import { Card, Rank, Suit } from "./types";

const rankAliases: Record<string, Rank> = {
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  T: "T",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
  "10": "T"
};

const validSuits = new Set(["s", "h", "d", "c"]);

export type CardParseResult = {
  cards: Card[];
  errors: string[];
};

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function formatCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function formatCards(cards: Card[]): string {
  return cards.map(formatCard).join(" ");
}

export function suitColor(suit: Suit): "red" | "black" {
  return suit === "h" || suit === "d" ? "red" : "black";
}

export function parseCards(input: string): CardParseResult {
  const source = input.trim();
  if (!source) {
    return { cards: [], errors: [] };
  }

  const cards: Card[] = [];
  const errors: string[] = [];
  const consumed = Array.from({ length: source.length }, () => false);
  const cardPattern = /(10|[2-9TJQKA])\s*([shdc])/gi;
  let match: RegExpExecArray | null;

  while ((match = cardPattern.exec(source)) !== null) {
    const rawRank = match[1].toUpperCase();
    const rawSuit = match[2].toLowerCase();
    const rank = rankAliases[rawRank];
    const suit = rawSuit as Suit;

    for (let i = match.index; i < match.index + match[0].length; i += 1) {
      consumed[i] = true;
    }

    if (!rank || !validSuits.has(rawSuit)) {
      errors.push(`Invalid card "${match[0]}".`);
      continue;
    }

    cards.push({ rank, suit });
  }

  const leftover = source
    .split("")
    .filter((char, index) => !consumed[index] && !/[\s,;|/-]/.test(char))
    .join("");

  if (leftover) {
    errors.push(`Could not parse "${leftover}". Use notation like Ah Ks or AhKs.`);
  }

  return { cards, errors };
}
