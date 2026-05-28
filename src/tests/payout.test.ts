import { describe, expect, it } from "vitest";
import { parseCards } from "../core/cardParser";
import { calculatePayouts } from "../core/payouts";
import { CalculationInput, GameRules, ValidationError } from "../core/types";

const c = (text: string) => parseCards(text).cards;

const holdem: GameRules = {
  name: "No-Limit Hold'em",
  holeCardsPerPlayer: 2,
  handConstructionMode: "bestAny",
  allowedHoleCardsUsed: [0, 1, 2]
};

function baseInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  return {
    players: [
      { id: "a", name: "A", seatNumber: 1, holeCards: c("Ah Ks"), isLiveAtShowdown: true },
      { id: "b", name: "B", seatNumber: 2, holeCards: c("Qd Qc"), isLiveAtShowdown: true },
      { id: "c", name: "C", seatNumber: 3, holeCards: c("9h 8h"), isLiveAtShowdown: true }
    ],
    boards: [{ id: "b1", name: "Board 1", cards: c("As Kd 7c 4h 2s") }],
    pots: [{ id: "main", name: "Main Pot", amount: 300, eligiblePlayerIds: ["a", "b", "c"] }],
    gameRules: holdem,
    oddChipPolicy: "colorFlip",
    ...overrides
  };
}

describe("payout calculation", () => {
  it("rejects duplicate cards globally", () => {
    expect(() =>
      calculatePayouts(
        baseInput({
          boards: [{ id: "b1", name: "Board 1", cards: c("Ah Kd 7c 4h 2s") }]
        })
      )
    ).toThrow(ValidationError);
  });

  it("supports manual side pots", () => {
    const result = calculatePayouts(
      baseInput({
        pots: [
          { id: "main", name: "Main Pot", amount: 300, eligiblePlayerIds: ["a", "b", "c"] },
          { id: "side", name: "Side Pot 1", amount: 120, eligiblePlayerIds: ["b", "c"] }
        ]
      })
    );

    expect(result.playerPayouts.a).toBe(300);
    expect(result.playerPayouts.b + result.playerPayouts.c).toBe(120);
  });

  it("ignores allowed hole-card counts in best-any mode", () => {
    const result = calculatePayouts(
      baseInput({
        gameRules: {
          name: "Best any custom",
          holeCardsPerPlayer: 2,
          handConstructionMode: "bestAny",
          allowedHoleCardsUsed: []
        }
      })
    );

    expect(result.playerPayouts.a).toBe(300);
  });

  it("splits multiple boards", () => {
    const result = calculatePayouts(
      baseInput({
        boards: [
          { id: "b1", name: "Board 1", cards: c("As Kd 7c 4h 2s") },
          { id: "b2", name: "Board 2", cards: c("Qh Jd 9c 3s 2d") }
        ],
        pots: [{ id: "main", name: "Main Pot", amount: 300, eligiblePlayerIds: ["a", "b"] }]
      })
    );

    expect(result.playerPayouts.a).toBe(150);
    expect(result.playerPayouts.b).toBe(150);
  });

  it("chops tied boards", () => {
    const result = calculatePayouts(
      baseInput({
        players: [
          { id: "a", name: "A", seatNumber: 1, holeCards: c("2c 3d"), isLiveAtShowdown: true },
          { id: "b", name: "B", seatNumber: 2, holeCards: c("4c 5d"), isLiveAtShowdown: true }
        ],
        boards: [{ id: "b1", name: "Board 1", cards: c("Ah Kh Qh Jh Th") }],
        pots: [{ id: "main", name: "Main Pot", amount: 100, eligiblePlayerIds: ["a", "b"] }]
      })
    );

    expect(result.playerPayouts.a).toBe(50);
    expect(result.playerPayouts.b).toBe(50);
  });

  it("resolves tied winner odd chip by color flip", () => {
    const result = calculatePayouts(
      baseInput({
        players: [
          { id: "a", name: "A", seatNumber: 1, holeCards: c("2c 3d"), isLiveAtShowdown: true },
          { id: "b", name: "B", seatNumber: 2, holeCards: c("4c 5d"), isLiveAtShowdown: true }
        ],
        boards: [{ id: "b1", name: "Board 1", cards: c("Ah Kh Qh Jh Th") }],
        pots: [{ id: "main", name: "Main Pot", amount: 101, eligiblePlayerIds: ["a", "b"] }],
        oddChipDecisions: [
          {
            id: "odd:main:b1:winners:1",
            context: "boardShareAcrossTiedWinners",
            amount: 1,
            candidates: ["a", "b"],
            policy: "colorFlip",
            status: "unresolved",
            chosenColorPlayerId: "a",
            chosenColor: "red",
            flippedCard: { rank: "8", suit: "h" }
          }
        ]
      })
    );

    expect(result.playerPayouts.a).toBe(51);
    expect(result.playerPayouts.b).toBe(50);
  });

  it("leaves 3-candidate odd chips unresolved", () => {
    const result = calculatePayouts(
      baseInput({
        players: [
          { id: "a", name: "A", seatNumber: 1, holeCards: c("2c 3d"), isLiveAtShowdown: true },
          { id: "b", name: "B", seatNumber: 2, holeCards: c("4c 5d"), isLiveAtShowdown: true },
          { id: "c", name: "C", seatNumber: 3, holeCards: c("6c 7d"), isLiveAtShowdown: true }
        ],
        boards: [{ id: "b1", name: "Board 1", cards: c("Ah Kh Qh Jh Th") }],
        pots: [{ id: "main", name: "Main Pot", amount: 101, eligiblePlayerIds: ["a", "b", "c"] }]
      })
    );

    expect(result.playerPayouts.a).toBe(33);
    expect(result.playerPayouts.b).toBe(33);
    expect(result.playerPayouts.c).toBe(33);
    expect(result.oddChipDecisions.filter((decision) => decision.status === "unresolved")).toHaveLength(2);
  });
});
