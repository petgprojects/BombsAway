import { GameRules } from "./types";

export const gamePresets: GameRules[] = [
  {
    name: "No-Limit Hold'em",
    holeCardsPerPlayer: 2,
    handConstructionMode: "bestAny",
    allowedHoleCardsUsed: [0, 1, 2]
  },
  {
    name: "Omaha",
    holeCardsPerPlayer: 4,
    handConstructionMode: "allowedHoleCounts",
    allowedHoleCardsUsed: [2]
  },
  {
    name: "5-Card Omaha - Use 2",
    holeCardsPerPlayer: 5,
    handConstructionMode: "allowedHoleCounts",
    allowedHoleCardsUsed: [2]
  },
  {
    name: "5-Card Omaha - Use 3",
    holeCardsPerPlayer: 5,
    handConstructionMode: "allowedHoleCounts",
    allowedHoleCardsUsed: [3]
  },
  {
    name: "5-Card Omaha - Use 2 or 3",
    holeCardsPerPlayer: 5,
    handConstructionMode: "allowedHoleCounts",
    allowedHoleCardsUsed: [2, 3]
  }
];

export function cloneRules(rules: GameRules): GameRules {
  return {
    ...rules,
    allowedHoleCardsUsed: rules.allowedHoleCardsUsed.slice()
  };
}
