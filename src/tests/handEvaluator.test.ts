import { describe, expect, it } from "vitest";
import { parseCards } from "../core/cardParser";
import { evaluateAllowedHoleCounts, evaluateBestAny } from "../core/handEvaluator";

const cards = (text: string) => parseCards(text).cards;

describe("hand evaluator", () => {
  it("finds best hold'em hand and board plays", () => {
    const result = evaluateBestAny(cards("2c 3d"), cards("Ah Kh Qh Jh Th"));
    expect(result.category).toBe("ROYAL_FLUSH");
    expect(result.holeCardsUsed).toBe(0);
  });

  it("handles kickers", () => {
    const aceKing = evaluateBestAny(cards("Ah Kd"), cards("As 7c 6d 3h 2c"));
    const aceQueen = evaluateBestAny(cards("Ad Qd"), cards("As 7c 6d 3h 2c"));
    expect(aceKing.tieBreakers).toEqual([14, 13, 7, 6]);
    expect(aceKing.tieBreakers[1]).toBeGreaterThan(aceQueen.tieBreakers[1]);
  });

  it("handles wheel straights", () => {
    const result = evaluateBestAny(cards("Ah 2d"), cards("3s 4c 5h Kd Qc"));
    expect(result.category).toBe("STRAIGHT");
    expect(result.tieBreakers).toEqual([5]);
  });

  it("uses exactly two hole cards for Omaha", () => {
    const result = evaluateAllowedHoleCounts(cards("Ah As Kc Qd"), cards("Ad Ac 2h 3s 4c"), [2]);
    expect(result.holeCardsUsed).toBe(2);
    expect(result.category).toBe("FOUR_OF_A_KIND");
  });

  it("uses exactly three hole cards for 5-card Omaha exact 3", () => {
    const result = evaluateAllowedHoleCounts(cards("Ah As Kc Qd Jh"), cards("Ad Ac 2h 3s 4c"), [3]);
    expect(result.holeCardsUsed).toBe(3);
  });

  it("supports 5-card Omaha using 2 or 3 hole cards", () => {
    const result = evaluateAllowedHoleCounts(cards("Ah Kh Qh 2c 3d"), cards("Jh Th 9h 4s 5c"), [2, 3]);
    expect(result.category).toBe("ROYAL_FLUSH");
    expect(result.holeCardsUsed).toBe(3);
  });
});
