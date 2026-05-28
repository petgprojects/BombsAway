import { formatCard, formatCards, suitColor } from "./cardParser";
import { compareHands, evaluateAllowedHoleCounts, evaluateBestAny } from "./handEvaluator";
import {
  BoardResult,
  BoardShare,
  BoardWinner,
  CalculationInput,
  CalculationResult,
  HandResult,
  OddChipDecision,
  Player,
  PotResult,
  ValidationError
} from "./types";
import { validateInput } from "./validation";

export function calculatePayouts(input: CalculationInput): CalculationResult {
  const validation = validateInput(input);
  if (validation.errors.length) {
    throw new ValidationError(validation.errors, validation.warnings);
  }

  const playersById = new Map(input.players.map((player) => [player.id, player]));
  const boardsById = new Map(input.boards.map((board) => [board.id, board]));
  const existingDecisions = new Map((input.oddChipDecisions ?? []).map((decision) => [decision.id, decision]));
  const playerPayouts = Object.fromEntries(input.players.map((player) => [player.id, 0]));
  const allOddDecisions: OddChipDecision[] = [];
  const potResults: PotResult[] = [];
  const boardResultsById = new Map<string, BoardResult>(
    input.boards.map((board) => [board.id, { boardId: board.id, boardName: board.name, potResults: [] }])
  );

  for (const pot of input.pots) {
    const boardExtra = new Map(input.boards.map((board) => [board.id, 0]));
    const potOddChips: OddChipDecision[] = [];
    const baseBoardShare = Math.floor(pot.amount / input.boards.length);
    const boardRemainder = pot.amount % input.boards.length;

    for (let i = 0; i < boardRemainder; i += 1) {
      const decision = resolveOddDecision({
        base: {
          id: `odd:${pot.id}:boards:${i + 1}`,
          context: "potAcrossBoards",
          amount: 1,
          candidates: input.boards.map((board) => board.id),
          policy: input.boards.length === 2 ? input.oddChipPolicy : "manual",
          status: "unresolved",
          description:
            boardRemainder === 1
              ? `${pot.name} remainder across boards`
              : `${pot.name} remainder across boards (${i + 1} of ${boardRemainder})`,
          candidateType: "board",
          potId: pot.id
        },
        existing: existingDecisions.get(`odd:${pot.id}:boards:${i + 1}`)
      });

      allOddDecisions.push(decision);
      if (decision.status === "resolved" && decision.selectedCandidateId) {
        boardExtra.set(decision.selectedCandidateId, (boardExtra.get(decision.selectedCandidateId) ?? 0) + 1);
      } else {
        potOddChips.push(decision);
      }
    }

    const boardShares: BoardShare[] = [];

    for (const board of input.boards) {
      const boardShareAmount = baseBoardShare + (boardExtra.get(board.id) ?? 0);
      const eligiblePlayers = pot.eligiblePlayerIds.map((playerId) => playersById.get(playerId)).filter(Boolean) as Player[];
      const winners = determineBoardWinners(eligiblePlayers, board.cards, input.gameRules, boardShareAmount);
      const splitWinners = splitBoardShare({
        winners,
        amount: boardShareAmount,
        potId: pot.id,
        potName: pot.name,
        boardId: board.id,
        boardName: board.name,
        existingDecisions,
        oddChipPolicy: input.oddChipPolicy,
        allOddDecisions
      });

      for (const winner of splitWinners.winners) {
        playerPayouts[winner.playerId] += winner.amountWon;
      }

      const boardShare: BoardShare = {
        boardId: board.id,
        boardName: board.name,
        amount: boardShareAmount,
        winners: splitWinners.winners,
        unresolvedOddChips: splitWinners.unresolvedOddChips
      };

      boardShares.push(boardShare);
      boardResultsById.get(board.id)?.potResults.push({
        potId: pot.id,
        potName: pot.name,
        winners: splitWinners.winners,
        amount: boardShareAmount
      });
    }

    potResults.push({
      potId: pot.id,
      potName: pot.name,
      amount: pot.amount,
      eligiblePlayerIds: pot.eligiblePlayerIds,
      boardShares,
      unresolvedOddChips: potOddChips
    });
  }

  const unresolved = allOddDecisions.filter((decision) => decision.status === "unresolved");
  const warnings = [
    ...validation.warnings,
    ...unresolved.map((decision) => `${decision.description ?? "Odd chip"} is unresolved.`)
  ];

  return {
    playerPayouts,
    potResults,
    boardResults: Array.from(boardResultsById.values()),
    oddChipDecisions: allOddDecisions,
    warnings
  };
}

function determineBoardWinners(
  eligiblePlayers: Player[],
  boardCards: CalculationInput["boards"][number]["cards"],
  gameRules: CalculationInput["gameRules"],
  amount: number
): BoardWinner[] {
  if (eligiblePlayers.length === 1) {
    const player = eligiblePlayers[0];
    return [
      {
        playerId: player.id,
        amountWon: amount,
        hand: evaluatePlayerHand(player, boardCards, gameRules)
      }
    ];
  }

  const evaluated = eligiblePlayers.map((player) => ({
    player,
    hand: evaluatePlayerHand(player, boardCards, gameRules)
  }));

  const best = evaluated.reduce((currentBest, current) =>
    compareHands(current.hand, currentBest.hand) > 0 ? current : currentBest
  );

  return evaluated
    .filter((entry) => compareHands(entry.hand, best.hand) === 0)
    .map((entry) => ({
      playerId: entry.player.id,
      amountWon: 0,
      hand: entry.hand
    }));
}

function evaluatePlayerHand(
  player: Player,
  boardCards: CalculationInput["boards"][number]["cards"],
  gameRules: CalculationInput["gameRules"]
): HandResult {
  if (gameRules.handConstructionMode === "bestAny") {
    return evaluateBestAny(player.holeCards, boardCards);
  }

  return evaluateAllowedHoleCounts(player.holeCards, boardCards, gameRules.allowedHoleCardsUsed);
}

function splitBoardShare(args: {
  winners: BoardWinner[];
  amount: number;
  potId: string;
  potName: string;
  boardId: string;
  boardName: string;
  existingDecisions: Map<string, OddChipDecision>;
  oddChipPolicy: CalculationInput["oddChipPolicy"];
  allOddDecisions: OddChipDecision[];
}): { winners: BoardWinner[]; unresolvedOddChips: OddChipDecision[] } {
  const { winners, amount } = args;
  if (winners.length === 1) {
    return { winners: [{ ...winners[0], amountWon: amount }], unresolvedOddChips: [] };
  }

  const baseAmount = Math.floor(amount / winners.length);
  const remainder = amount % winners.length;
  const payouts = new Map(winners.map((winner) => [winner.playerId, baseAmount]));
  const unresolvedOddChips: OddChipDecision[] = [];

  for (let i = 0; i < remainder; i += 1) {
    const id = `odd:${args.potId}:${args.boardId}:winners:${i + 1}`;
    const decision = resolveOddDecision({
      base: {
        id,
        context: "boardShareAcrossTiedWinners",
        amount: 1,
        candidates: winners.map((winner) => winner.playerId),
        policy: winners.length === 2 ? args.oddChipPolicy : "manual",
        status: "unresolved",
        description:
          remainder === 1
            ? `${args.potName} on ${args.boardName} tied-winner remainder`
            : `${args.potName} on ${args.boardName} tied-winner remainder (${i + 1} of ${remainder})`,
        candidateType: "player",
        potId: args.potId,
        boardId: args.boardId
      },
      existing: args.existingDecisions.get(id)
    });

    args.allOddDecisions.push(decision);
    if (decision.status === "resolved" && decision.selectedCandidateId) {
      payouts.set(decision.selectedCandidateId, (payouts.get(decision.selectedCandidateId) ?? 0) + 1);
    } else {
      unresolvedOddChips.push(decision);
    }
  }

  return {
    winners: winners.map((winner) => ({ ...winner, amountWon: payouts.get(winner.playerId) ?? 0 })),
    unresolvedOddChips
  };
}

function resolveOddDecision(args: { base: OddChipDecision; existing?: OddChipDecision }): OddChipDecision {
  const existing = args.existing;
  const candidateSet = new Set(args.base.candidates);
  const selectedCandidateId = existing?.selectedCandidateId;
  const chosenColorPlayerId = existing?.chosenColorPlayerId;
  const chosenColor = existing?.chosenColor;
  const flippedCard = existing?.flippedCard;
  const policy = args.base.candidates.length === 2 ? existing?.policy ?? args.base.policy : "manual";

  const decision: OddChipDecision = {
    ...args.base,
    policy,
    selectedCandidateId: selectedCandidateId && candidateSet.has(selectedCandidateId) ? selectedCandidateId : undefined,
    chosenColorPlayerId:
      chosenColorPlayerId && candidateSet.has(chosenColorPlayerId) ? chosenColorPlayerId : undefined,
    chosenColor,
    flippedCard
  };

  if (decision.selectedCandidateId) {
    return { ...decision, status: "resolved" };
  }

  if (
    decision.policy === "colorFlip" &&
    decision.candidates.length === 2 &&
    decision.chosenColorPlayerId &&
    decision.chosenColor &&
    decision.flippedCard
  ) {
    const selected =
      suitColor(decision.flippedCard.suit) === decision.chosenColor
        ? decision.chosenColorPlayerId
        : decision.candidates.find((candidateId) => candidateId !== decision.chosenColorPlayerId);

    if (selected) {
      return { ...decision, selectedCandidateId: selected, status: "resolved" };
    }
  }

  return { ...decision, status: "unresolved", selectedCandidateId: undefined };
}

export function describeWinner(winner: BoardWinner, playersById: Map<string, Player>): string {
  const player = playersById.get(winner.playerId);
  return `${player?.name ?? "Unknown player"} wins ${winner.amountWon} with ${winner.hand.displayName} (${formatCards(
    winner.hand.fiveCardHand
  )}, ${winner.hand.holeCardsUsed} hole used)`;
}

export function describeOddChip(decision: OddChipDecision): string {
  if (decision.status === "resolved" && decision.selectedCandidateId) {
    const flipText = decision.flippedCard ? ` after ${formatCard(decision.flippedCard)}` : "";
    return `${decision.description ?? "Odd chip"} resolved to ${decision.selectedCandidateId}${flipText}.`;
  }
  return `${decision.description ?? "Odd chip"} is unresolved.`;
}
