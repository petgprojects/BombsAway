export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type Player = {
  id: string;
  name: string;
  seatNumber: number;
  holeCards: Card[];
  isLiveAtShowdown: boolean;
};

export type Board = {
  id: string;
  name: string;
  cards: Card[];
};

export type Pot = {
  id: string;
  name: string;
  amount: number;
  eligiblePlayerIds: string[];
};

export type HandConstructionMode = "bestAny" | "allowedHoleCounts";

export type GameRules = {
  name: string;
  holeCardsPerPlayer: number;
  handConstructionMode: HandConstructionMode;
  allowedHoleCardsUsed: number[];
};

export type OddChipPolicy = "colorFlip" | "manual";

export type OddChipDecision = {
  id: string;
  context: "potAcrossBoards" | "boardShareAcrossTiedWinners";
  amount: number;
  candidates: string[];
  policy: OddChipPolicy;
  status: "unresolved" | "resolved";
  selectedCandidateId?: string;
  chosenColorPlayerId?: string;
  chosenColor?: "red" | "black";
  flippedCard?: Card;
  description?: string;
  candidateType?: "board" | "player";
  potId?: string;
  boardId?: string;
};

export type HandCategory =
  | "ROYAL_FLUSH"
  | "STRAIGHT_FLUSH"
  | "FOUR_OF_A_KIND"
  | "FULL_HOUSE"
  | "FLUSH"
  | "STRAIGHT"
  | "THREE_OF_A_KIND"
  | "TWO_PAIR"
  | "ONE_PAIR"
  | "HIGH_CARD";

export type HandResult = {
  category: HandCategory;
  categoryRank: number;
  tieBreakers: number[];
  fiveCardHand: Card[];
  displayName: string;
  holeCardsUsed: number;
};

export type BoardWinner = {
  playerId: string;
  amountWon: number;
  hand: HandResult;
};

export type BoardShare = {
  boardId: string;
  boardName: string;
  amount: number;
  winners: BoardWinner[];
  unresolvedOddChips: OddChipDecision[];
};

export type PotResult = {
  potId: string;
  potName: string;
  amount: number;
  eligiblePlayerIds: string[];
  boardShares: BoardShare[];
  unresolvedOddChips: OddChipDecision[];
};

export type BoardResult = {
  boardId: string;
  boardName: string;
  potResults: {
    potId: string;
    potName: string;
    winners: BoardWinner[];
    amount: number;
  }[];
};

export type CalculationInput = {
  players: Player[];
  boards: Board[];
  pots: Pot[];
  gameRules: GameRules;
  oddChipPolicy: OddChipPolicy;
  oddChipDecisions?: OddChipDecision[];
};

export type CalculationResult = {
  playerPayouts: Record<string, number>;
  potResults: PotResult[];
  boardResults: BoardResult[];
  oddChipDecisions: OddChipDecision[];
  warnings: string[];
};

export class ValidationError extends Error {
  errors: string[];
  warnings: string[];

  constructor(errors: string[], warnings: string[] = []) {
    super(errors.join("\n"));
    this.name = "ValidationError";
    this.errors = errors;
    this.warnings = warnings;
  }
}
