import { describe, expect, it } from "vitest";
import { parseCards } from "../core/cardParser";

describe("parseCards", () => {
  it("parses spaced, compact, and comma-separated notation", () => {
    expect(parseCards("Ah Ks").cards).toEqual([
      { rank: "A", suit: "h" },
      { rank: "K", suit: "s" }
    ]);
    expect(parseCards("AhKs").cards).toEqual([
      { rank: "A", suit: "h" },
      { rank: "K", suit: "s" }
    ]);
    expect(parseCards("Ah, Ks, 10d").cards).toEqual([
      { rank: "A", suit: "h" },
      { rank: "K", suit: "s" },
      { rank: "T", suit: "d" }
    ]);
  });

  it("reports invalid leftover text", () => {
    expect(parseCards("Ah XX").errors).toHaveLength(1);
  });
});
