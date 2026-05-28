import { cardKey } from "./cardParser";
import { combinations } from "./combinations";
import { Card, HandCategory, HandResult } from "./types";

const rankValues: Record<Card["rank"], number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

const categoryRanks: Record<HandCategory, number> = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

const rankName: Record<number, string> = {
  14: "Ace",
  13: "King",
  12: "Queen",
  11: "Jack",
  10: "Ten",
  9: "Nine",
  8: "Eight",
  7: "Seven",
  6: "Six",
  5: "Five",
  4: "Four",
  3: "Three",
  2: "Two"
};

const rankPlural: Record<number, string> = {
  14: "Aces",
  13: "Kings",
  12: "Queens",
  11: "Jacks",
  10: "Tens",
  9: "Nines",
  8: "Eights",
  7: "Sevens",
  6: "Sixes",
  5: "Fives",
  4: "Fours",
  3: "Threes",
  2: "Twos"
};

type CandidateHand = {
  cards: Card[];
  holeCardsUsed: number;
};

export function compareHands(a: HandResult, b: HandResult): number {
  if (a.categoryRank !== b.categoryRank) {
    return a.categoryRank - b.categoryRank;
  }

  const length = Math.max(a.tieBreakers.length, b.tieBreakers.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a.tieBreakers[i] ?? 0) - (b.tieBreakers[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

export function evaluateBestAny(holeCards: Card[], boardCards: Card[]): HandResult {
  const holeKeys = new Set(holeCards.map(cardKey));
  const allCards = [...holeCards, ...boardCards];
  return bestFiveCardHand(
    combinations(allCards, 5).map((cards) => ({
      cards,
      holeCardsUsed: cards.filter((card) => holeKeys.has(cardKey(card))).length
    }))
  );
}

export function evaluateAllowedHoleCounts(
  holeCards: Card[],
  boardCards: Card[],
  allowedHoleCardsUsed: number[]
): HandResult {
  const candidateHands: CandidateHand[] = [];

  for (const holeCount of allowedHoleCardsUsed) {
    const boardCount = 5 - holeCount;
    const holeCombos = combinations(holeCards, holeCount);
    const boardCombos = combinations(boardCards, boardCount);

    for (const holeCombo of holeCombos) {
      for (const boardCombo of boardCombos) {
        candidateHands.push({
          cards: [...holeCombo, ...boardCombo],
          holeCardsUsed: holeCount
        });
      }
    }
  }

  return bestFiveCardHand(candidateHands);
}

export function bestFiveCardHand(candidateHands: CandidateHand[]): HandResult {
  if (!candidateHands.length) {
    throw new Error("No legal five-card hands can be built with the current rules.");
  }

  return candidateHands
    .map((candidate) => evaluateFiveCardHand(candidate.cards, candidate.holeCardsUsed))
    .reduce((best, current) => (compareHands(current, best) > 0 ? current : best));
}

export function evaluateFiveCardHand(cards: Card[], holeCardsUsed = 0): HandResult {
  if (cards.length !== 5) {
    throw new Error("Exactly five cards are required to evaluate a hand.");
  }

  const values = cards.map((card) => rankValues[card.rank]).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const countGroups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  const isFlush = cards.every((card) => card.suit === cards[0].suit);
  const straightHigh = getStraightHigh(values);

  let category: HandCategory;
  let tieBreakers: number[];

  if (isFlush && straightHigh === 14) {
    category = "ROYAL_FLUSH";
    tieBreakers = [14];
  } else if (isFlush && straightHigh) {
    category = "STRAIGHT_FLUSH";
    tieBreakers = [straightHigh];
  } else if (countGroups[0][1] === 4) {
    const kicker = countGroups.find(([, count]) => count === 1)?.[0] ?? 0;
    category = "FOUR_OF_A_KIND";
    tieBreakers = [countGroups[0][0], kicker];
  } else if (countGroups[0][1] === 3 && countGroups[1]?.[1] === 2) {
    category = "FULL_HOUSE";
    tieBreakers = [countGroups[0][0], countGroups[1][0]];
  } else if (isFlush) {
    category = "FLUSH";
    tieBreakers = values;
  } else if (straightHigh) {
    category = "STRAIGHT";
    tieBreakers = [straightHigh];
  } else if (countGroups[0][1] === 3) {
    const kickers = countGroups.filter(([, count]) => count === 1).map(([value]) => value);
    category = "THREE_OF_A_KIND";
    tieBreakers = [countGroups[0][0], ...kickers];
  } else if (countGroups[0][1] === 2 && countGroups[1]?.[1] === 2) {
    const pairs = countGroups.filter(([, count]) => count === 2).map(([value]) => value);
    const kicker = countGroups.find(([, count]) => count === 1)?.[0] ?? 0;
    category = "TWO_PAIR";
    tieBreakers = [...pairs, kicker];
  } else if (countGroups[0][1] === 2) {
    const kickers = countGroups.filter(([, count]) => count === 1).map(([value]) => value);
    category = "ONE_PAIR";
    tieBreakers = [countGroups[0][0], ...kickers];
  } else {
    category = "HIGH_CARD";
    tieBreakers = values;
  }

  return {
    category,
    categoryRank: categoryRanks[category],
    tieBreakers,
    fiveCardHand: sortCardsForDisplay(cards),
    displayName: describeHand(category, tieBreakers),
    holeCardsUsed
  };
}

function getStraightHigh(values: number[]): number | null {
  const unique = Array.from(new Set(values)).sort((a, b) => b - a);
  if (unique.includes(14)) {
    unique.push(1);
  }

  for (let i = 0; i <= unique.length - 5; i += 1) {
    const window = unique.slice(i, i + 5);
    if (window.every((value, index) => index === 0 || value === window[index - 1] - 1)) {
      return window[0] === 1 ? 5 : window[0];
    }
  }

  return null;
}

function describeHand(category: HandCategory, tieBreakers: number[]): string {
  switch (category) {
    case "ROYAL_FLUSH":
      return "Royal flush";
    case "STRAIGHT_FLUSH":
      return `Straight flush, ${rankName[tieBreakers[0]]} high`;
    case "FOUR_OF_A_KIND":
      return `Four of a kind, ${rankPlural[tieBreakers[0]]}`;
    case "FULL_HOUSE":
      return `Full house, ${rankPlural[tieBreakers[0]]} over ${rankPlural[tieBreakers[1]]}`;
    case "FLUSH":
      return `Flush, ${rankName[tieBreakers[0]]} high`;
    case "STRAIGHT":
      return `Straight, ${rankName[tieBreakers[0]]} high`;
    case "THREE_OF_A_KIND":
      return `Three of a kind, ${rankPlural[tieBreakers[0]]}`;
    case "TWO_PAIR":
      return `Two pair, ${rankPlural[tieBreakers[0]]} and ${rankPlural[tieBreakers[1]]}`;
    case "ONE_PAIR":
      return `Pair of ${rankPlural[tieBreakers[0]]}`;
    case "HIGH_CARD":
      return `${rankName[tieBreakers[0]]} high`;
  }
}

function sortCardsForDisplay(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => rankValues[b.rank] - rankValues[a.rank]);
}
