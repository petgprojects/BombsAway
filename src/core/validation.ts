import { cardKey, formatCard } from "./cardParser";
import { CalculationInput, Card } from "./types";

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

export function validateInput(input: CalculationInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { players, boards, pots, gameRules } = input;
  const playerById = new Map(players.map((player) => [player.id, player]));
  const livePlayers = players.filter((player) => player.isLiveAtShowdown);

  if (livePlayers.length < 2) {
    errors.push("Enter at least two live players.");
  }

  if (gameRules.holeCardsPerPlayer < 1) {
    errors.push("Hole cards per player must be at least 1.");
  }

  if (gameRules.handConstructionMode === "allowedHoleCounts") {
    if (!gameRules.allowedHoleCardsUsed.length) {
      errors.push("Allowed hole-card counts cannot be empty.");
    }

    for (const holeCount of gameRules.allowedHoleCardsUsed) {
      const boardCount = 5 - holeCount;
      if (holeCount < 0 || holeCount > gameRules.holeCardsPerPlayer) {
        errors.push(`Allowed hole-card count ${holeCount} is impossible for ${gameRules.holeCardsPerPlayer} hole cards.`);
      }
      if (boardCount < 0 || boardCount > 5) {
        errors.push(`Allowed hole-card count ${holeCount} requires an impossible ${boardCount} board cards.`);
      }
    }
  }

  for (const player of livePlayers) {
    if (player.holeCards.length !== gameRules.holeCardsPerPlayer) {
      errors.push(
        `${player.name || `Seat ${player.seatNumber}`} needs exactly ${gameRules.holeCardsPerPlayer} hole cards.`
      );
    }
  }

  if (!boards.length) {
    errors.push("Enter at least one board.");
  }

  for (const board of boards) {
    if (board.cards.length !== 5) {
      errors.push(`${board.name} must have exactly 5 cards.`);
    }
  }

  if (!pots.length) {
    errors.push("Enter at least one pot.");
  }

  for (const pot of pots) {
    if (!Number.isInteger(pot.amount) || pot.amount <= 0) {
      errors.push(`${pot.name} amount must be a positive integer.`);
    }

    if (pot.eligiblePlayerIds.length < 1) {
      errors.push(`${pot.name} must have at least one eligible player.`);
    }

    if (pot.eligiblePlayerIds.length === 1) {
      warnings.push(`${pot.name} has one eligible player and will be awarded uncontested.`);
    }

    for (const playerId of pot.eligiblePlayerIds) {
      const player = playerById.get(playerId);
      if (!player) {
        errors.push(`${pot.name} includes an unknown player.`);
      } else if (!player.isLiveAtShowdown) {
        errors.push(`${player.name || `Seat ${player.seatNumber}`} is folded but is eligible for ${pot.name}.`);
      }
    }
  }

  validateDuplicateCards(input, errors);

  return { errors, warnings };
}

function validateDuplicateCards(input: CalculationInput, errors: string[]): void {
  const seen = new Map<string, string>();

  function record(card: Card, location: string): void {
    const key = `${card.rank}${card.suit}`;
    const firstLocation = seen.get(key);
    if (firstLocation) {
      errors.push(`Duplicate card ${formatCard(card)} appears in ${firstLocation} and ${location}.`);
    } else {
      seen.set(key, location);
    }
  }

  for (const player of input.players) {
    player.holeCards.forEach((card) => record(card, player.name || `Seat ${player.seatNumber}`));
  }

  for (const board of input.boards) {
    board.cards.forEach((card) => record(card, board.name));
  }

  for (const decision of input.oddChipDecisions ?? []) {
    if (decision.flippedCard) {
      const label = decision.description ? `odd-chip flip for ${decision.description}` : "odd-chip flip";
      const key = cardKey(decision.flippedCard);
      const firstLocation = seen.get(key);
      if (firstLocation) {
        errors.push(`Odd-chip flipped card ${formatCard(decision.flippedCard)} duplicates a card in ${firstLocation}.`);
      } else {
        seen.set(key, label);
      }
    }
  }
}
