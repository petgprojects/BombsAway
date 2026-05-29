import { createServer } from "node:http";
import { readFile, readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = join(rootDir, "dist");

loadDotEnv();

const port = Number(process.env.PORT ?? 8787);
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = process.env.OPENROUTER_VISION_MODEL ?? "openai/gpt-4.1-mini";
const maxBodyBytes = Number(process.env.MAX_VISION_BODY_BYTES ?? 9_000_000);
const debugOpenRouter = process.env.OPENROUTER_DEBUG === "1" || process.env.OPENROUTER_DEBUG === "true";
const openRouterReasoningEffort = process.env.OPENROUTER_REASONING_EFFORT ?? "none";
const openRouterReasoningMaxTokens = process.env.OPENROUTER_REASONING_MAX_TOKENS;
const openRouterReasoningExclude = parseBoolean(process.env.OPENROUTER_REASONING_EXCLUDE ?? "true");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"]
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "POST" && url.pathname === "/api/vision/openrouter") {
      await handleOpenRouterVision(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    await serveStatic(url.pathname, response, request.method === "HEAD");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    sendJson(response, 500, { error: message });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Bombs Away server listening on http://localhost:${port}`);
});

async function handleOpenRouterVision(request, response) {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const body = await readJsonBody(request);
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  logOpenRouterDebug(requestId, "incoming request", {
    model: openRouterModel,
    reasoning: buildReasoningConfig(),
    bodyBytes: body.__rawByteLength ?? null,
    imageDataUrlBytes: imageDataUrl.length,
    hasApiKey: Boolean(openRouterApiKey)
  });

  if (!openRouterApiKey) {
    sendJson(response, 500, {
      error: "OPENROUTER_API_KEY is not configured on the server."
    });
    return;
  }

  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(imageDataUrl)) {
    sendJson(response, 400, {
      error: "imageDataUrl must be a base64 data URL for a PNG, JPEG, or WebP image."
    });
    return;
  }

  const openRouterPayload = {
    model: openRouterModel,
    temperature: 0,
    max_tokens: 1600,
    ...(buildReasoningConfig() ? { reasoning: buildReasoningConfig() } : {}),
    response_format: {
      type: "json_object"
    },
    messages: [
      {
        role: "system",
        content:
          "You extract visible physical playing cards from poker showdown table photos. Return only valid JSON. Never infer winners, pots, or hidden cards."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Return a JSON object with exactly these top-level keys: players, boards, warnings. players must be an array of objects with name, cards, confidence, notes. boards must be an array of objects with name, cards, confidence, notes. warnings must be an array of strings. Cards must use compact notation with rank followed by lowercase suit, like As Kh Qd Jc Ts 9h. Use T for tens. Identify community boards separately from player hole-card groups. Prefer grouping center/table-run cards into complete five-card boards when visible. Look for every player hole-card group around the table edges, including cropped or rotated groups, and do not stop after two players. If a card is uncertain, omit it and add a warning instead of guessing. Name players Player 1, Player 2, etc. when names are not visible."
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl
            }
          }
        ]
      }
    ]
  };

  logOpenRouterDebug(requestId, "sending request", redactImagePayload(openRouterPayload));

  const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "Bombs Away Poker Payout Calculator"
    },
    body: JSON.stringify(openRouterPayload)
  });

  const upstreamText = await openRouterResponse.text();
  logOpenRouterDebug(requestId, "raw response", {
    status: openRouterResponse.status,
    ok: openRouterResponse.ok,
    body: upstreamText
  });

  if (!openRouterResponse.ok) {
    sendJson(response, openRouterResponse.status, {
      error: formatUpstreamError(openRouterResponse.status, upstreamText)
    });
    return;
  }

  const upstream = JSON.parse(upstreamText);
  const content = upstream?.choices?.[0]?.message?.content;
  logOpenRouterDebug(requestId, "message content", content);
  const draft = parseModelJson(content);
  logOpenRouterDebug(requestId, "parsed draft", draft);

  sendJson(response, 200, {
    model: openRouterModel,
    draft,
    usage: upstream.usage ?? null,
    warnings: draft.warnings ?? []
  });
}

async function serveStatic(pathname, response, headOnly) {
  const cleanPath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const requestedPath = cleanPath === "/" ? "/index.html" : cleanPath;
  const filePath = resolve(join(distDir, requestedPath));

  if (!filePath.startsWith(distDir)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  try {
    const body = await readFileAsync(filePath);
    const extension = extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
    });
    if (!headOnly) response.end(body);
    else response.end();
  } catch {
    const fallback = await readFileAsync(join(distDir, "index.html"));
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    });
    if (!headOnly) response.end(fallback);
    else response.end();
  }
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    let isTooLarge = false;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        isTooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        if (isTooLarge) {
          rejectBody(new Error(`Vision request body is too large. Limit is ${maxBodyBytes} bytes.`));
          return;
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        const parsed = raw ? JSON.parse(raw) : {};
        Object.defineProperty(parsed, "__rawByteLength", {
          enumerable: false,
          value: size
        });
        resolveBody(parsed);
      } catch {
        rejectBody(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", rejectBody);
  });
}

function loadDotEnv() {
  try {
    const envText = readFileSync(join(rootDir, ".env"), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;

      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // A .env file is optional; docker-compose and shell env vars still work.
  }
}

function buildReasoningConfig() {
  if (openRouterReasoningMaxTokens) {
    const maxTokens = Number(openRouterReasoningMaxTokens);
    if (Number.isFinite(maxTokens) && maxTokens >= 0) {
      return {
        max_tokens: maxTokens,
        exclude: openRouterReasoningExclude
      };
    }
  }

  const effort = openRouterReasoningEffort.toLowerCase();
  if (effort === "auto" || effort === "default" || effort === "provider") {
    return undefined;
  }

  return {
    effort,
    exclude: openRouterReasoningExclude
  };
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function logOpenRouterDebug(requestId, label, value) {
  if (!debugOpenRouter) return;
  const rendered = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  console.log(`[openrouter:${requestId}] ${label}\n${rendered}`);
}

function redactImagePayload(payload) {
  return {
    ...payload,
    messages: payload.messages.map((message) => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content.map((entry) =>
            entry.type === "image_url"
              ? {
                  ...entry,
                  image_url: {
                    url: `<redacted data URL, ${entry.image_url.url.length} chars>`
                  }
                }
              : entry
          )
        : message.content
    }))
  };
}

function parseModelJson(content) {
  if (typeof content !== "string") {
    throw new Error("OpenRouter returned an empty vision response.");
  }

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OpenRouter did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function formatUpstreamError(status, text) {
  const message = parseUpstreamError(text) ?? `OpenRouter request failed with HTTP ${status}.`;
  if (/string did not match the expected pattern/i.test(message)) {
    return `OpenRouter rejected the vision request format. Original error: ${message}`;
  }
  return message;
}

function parseUpstreamError(text) {
  try {
    const parsed = JSON.parse(text);
    const details = parsed?.error?.metadata?.raw ?? parsed?.error?.details ?? parsed?.details;
    const message = parsed?.error?.message ?? parsed?.message ?? null;
    return [message, details].filter(Boolean).join(" ");
  } catch {
    return text || null;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  response.end(JSON.stringify(payload));
}
