import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Coins,
  Layers3,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
  Users
} from "lucide-react";
import { useMemo, useState } from "react";
import { cardKey, formatCard, formatCards, parseCards } from "./core/cardParser";
import { gamePresets, cloneRules } from "./core/gameRules";
import { calculatePayouts } from "./core/payouts";
import {
  Board,
  CalculationInput,
  CalculationResult,
  GameRules,
  OddChipDecision,
  Player,
  Pot,
  ValidationError
} from "./core/types";

type PlayerDraft = {
  id: string;
  name: string;
  seatNumber: number;
  holeCardsText: string;
  isLiveAtShowdown: boolean;
};

type BoardDraft = {
  id: string;
  name: string;
  cardsText: string;
};

type PotDraft = {
  id: string;
  name: string;
  amountText: string;
  eligiblePlayerIds: string[];
};

type OddDecisionDraft = OddChipDecision & {
  flippedCardText?: string;
};

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const initialPlayers: PlayerDraft[] = [
  { id: "p1", name: "Player 1", seatNumber: 1, holeCardsText: "", isLiveAtShowdown: true },
  { id: "p2", name: "Player 2", seatNumber: 2, holeCardsText: "", isLiveAtShowdown: true }
];

const initialBoards: BoardDraft[] = [{ id: "b1", name: "Board 1", cardsText: "" }];
const initialPots: PotDraft[] = [{ id: "pot-main", name: "Main Pot", amountText: "", eligiblePlayerIds: ["p1", "p2"] }];

export default function App() {
  const [rules, setRules] = useState<GameRules>(() => cloneRules(gamePresets[0]));
  const [presetName, setPresetName] = useState(gamePresets[0].name);
  const [players, setPlayers] = useState<PlayerDraft[]>(initialPlayers);
  const [boards, setBoards] = useState<BoardDraft[]>(initialBoards);
  const [pots, setPots] = useState<PotDraft[]>(initialPots);
  const [oddDecisionDrafts, setOddDecisionDrafts] = useState<Record<string, OddDecisionDraft>>({});
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const boardsById = useMemo(() => new Map(boards.map((board) => [board.id, board])), [boards]);

  const parsed = useMemo(
    () => buildCalculationInput({ players, boards, pots, rules, oddDecisionDrafts }),
    [players, boards, pots, rules, oddDecisionDrafts]
  );

  function runCalculation(nextOddDrafts = oddDecisionDrafts) {
    const nextParsed = buildCalculationInput({ players, boards, pots, rules, oddDecisionDrafts: nextOddDrafts });
    if (nextParsed.errors.length) {
      setErrors(nextParsed.errors);
      setResult(null);
      return;
    }

    try {
      const nextResult = calculatePayouts(nextParsed.input);
      setErrors([]);
      setResult(nextResult);
      setOddDecisionDrafts((current) => mergeGeneratedOddDecisions(current, nextResult.oddChipDecisions));
    } catch (error) {
      if (error instanceof ValidationError) {
        setErrors(error.errors);
        setResult(null);
      } else {
        setErrors([error instanceof Error ? error.message : "Calculation failed."]);
        setResult(null);
      }
    }
  }

  function updateOddDecision(id: string, patch: Partial<OddDecisionDraft>, recalculate = true) {
    const next = {
      ...oddDecisionDrafts,
      [id]: {
        ...oddDecisionDrafts[id],
        id,
        ...patch
      } as OddDecisionDraft
    };
    setOddDecisionDrafts(next);
    if (recalculate && result) {
      runCalculation(next);
    }
  }

  function selectPreset(name: string) {
    setPresetName(name);
    if (name === "Custom") {
      setRules((current) => ({ ...current, name: "Custom" }));
      return;
    }

    const preset = gamePresets.find((candidate) => candidate.name === name);
    if (preset) {
      setRules(cloneRules(preset));
    }
  }

  function loadDemo() {
    const demoPlayers: PlayerDraft[] = [
      { id: "p1", name: "Peter", seatNumber: 1, holeCardsText: "Ah Ks", isLiveAtShowdown: true },
      { id: "p2", name: "Mike", seatNumber: 2, holeCardsText: "Ad Qd", isLiveAtShowdown: true },
      { id: "p3", name: "James", seatNumber: 3, holeCardsText: "9h 9s", isLiveAtShowdown: true }
    ];
    setPresetName(gamePresets[0].name);
    setRules(cloneRules(gamePresets[0]));
    setPlayers(demoPlayers);
    setBoards([
      { id: "b1", name: "Board 1", cardsText: "As Kd 7c 4h 2s" },
      { id: "b2", name: "Board 2", cardsText: "9c 8c 7d 6s 5h" }
    ]);
    setPots([
      { id: "pot-main", name: "Main Pot", amountText: "301", eligiblePlayerIds: ["p1", "p2", "p3"] },
      { id: "pot-side-1", name: "Side Pot 1", amountText: "120", eligiblePlayerIds: ["p2", "p3"] }
    ]);
    setOddDecisionDrafts({});
    setResult(null);
    setErrors([]);
  }

  const unresolvedCount = result?.oddChipDecisions.filter((decision) => decision.status === "unresolved").length ?? 0;
  const totalPayout = result ? Object.values(result.playerPayouts).reduce((sum, value) => sum + value, 0) : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Bombs Away</p>
          <h1>Poker Payout Calculator</h1>
        </div>
        <div className="topbar-stat">
          <span>{totalPayout}</span>
          <small>chips assigned</small>
        </div>
      </header>

      <main className="workspace">
        <div className="primary-column">
          <section className="section setup-section">
            <div className="section-heading">
              <div>
                <span className="section-icon"><Calculator size={18} /></span>
                <h2>Game Setup</h2>
              </div>
              <button className="ghost-button" type="button" onClick={loadDemo}>
                <RotateCcw size={16} />
                Demo
              </button>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Preset</span>
                <select value={presetName} onChange={(event) => selectPreset(event.target.value)}>
                  {gamePresets.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                  <option value="Custom">Custom</option>
                </select>
              </label>

              <label className="field">
                <span>Hole cards</span>
                <input
                  min={1}
                  max={9}
                  type="number"
                  value={rules.holeCardsPerPlayer}
                  onChange={(event) =>
                    setRules((current) => ({
                      ...current,
                      holeCardsPerPlayer: Number(event.target.value),
                      name: presetName === "Custom" ? "Custom" : current.name
                    }))
                  }
                />
              </label>

              <label className="field">
                <span>Construction</span>
                <select
                  value={rules.handConstructionMode}
                  onChange={(event) =>
                    setRules((current) => ({
                      ...current,
                      handConstructionMode: event.target.value as GameRules["handConstructionMode"]
                    }))
                  }
                >
                  <option value="bestAny">Best any cards</option>
                  <option value="allowedHoleCounts">Allowed hole counts</option>
                </select>
              </label>
            </div>

            <div className="allowed-counts">
              <span>Allowed hole cards used</span>
              <div className="segmented-wrap">
                {Array.from({ length: Math.min(6, Math.max(1, rules.holeCardsPerPlayer + 1)) }, (_, index) => index).map(
                  (count) => (
                    <button
                      key={count}
                      className={rules.allowedHoleCardsUsed.includes(count) ? "segment active" : "segment"}
                      type="button"
                      onClick={() =>
                        setRules((current) => ({
                          ...current,
                          allowedHoleCardsUsed: toggleNumber(current.allowedHoleCardsUsed, count)
                        }))
                      }
                    >
                      {count}
                    </button>
                  )
                )}
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <span className="section-icon"><Users size={18} /></span>
                <h2>Players</h2>
              </div>
              <button className="icon-button labeled" type="button" onClick={() => setPlayers(addPlayer(players, pots, setPots))}>
                <Plus size={17} />
                Player
              </button>
            </div>

            <div className="stack">
              {players.map((player, index) => (
                <div className="editor-row" key={player.id}>
                  <div className="row-title">
                    <strong>Seat {player.seatNumber || index + 1}</strong>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={player.isLiveAtShowdown}
                        onChange={(event) => {
                          const isLive = event.target.checked;
                          setPlayers((current) =>
                            current.map((candidate) =>
                              candidate.id === player.id ? { ...candidate, isLiveAtShowdown: isLive } : candidate
                            )
                          );
                          if (!isLive) {
                            setPots((current) =>
                              current.map((pot) => ({
                                ...pot,
                                eligiblePlayerIds: pot.eligiblePlayerIds.filter((id) => id !== player.id)
                              }))
                            );
                          }
                        }}
                      />
                      <span>{player.isLiveAtShowdown ? "Live" : "Folded"}</span>
                    </label>
                  </div>

                  <div className="field-grid compact">
                    <label className="field tiny">
                      <span>Seat</span>
                      <input
                        type="number"
                        min={1}
                        value={player.seatNumber}
                        onChange={(event) =>
                          setPlayers((current) =>
                            current.map((candidate) =>
                              candidate.id === player.id ? { ...candidate, seatNumber: Number(event.target.value) } : candidate
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={player.name}
                        onChange={(event) =>
                          setPlayers((current) =>
                            current.map((candidate) =>
                              candidate.id === player.id ? { ...candidate, name: event.target.value } : candidate
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Hole cards</span>
                      <input
                        inputMode="text"
                        placeholder={rules.holeCardsPerPlayer === 2 ? "Ah Ks" : "Ah Ks Qd Jc"}
                        value={player.holeCardsText}
                        onChange={(event) =>
                          setPlayers((current) =>
                            current.map((candidate) =>
                              candidate.id === player.id ? { ...candidate, holeCardsText: event.target.value } : candidate
                            )
                          )
                        }
                      />
                    </label>
                  </div>

                  <div className="row-footer">
                    <CardPreview text={player.holeCardsText} />
                    <button
                      aria-label={`Remove ${player.name}`}
                      className="icon-button danger"
                      type="button"
                      onClick={() => removePlayer(player.id, setPlayers, setPots)}
                      disabled={players.length <= 2}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <span className="section-icon"><Layers3 size={18} /></span>
                <h2>Boards</h2>
              </div>
              <button
                className="icon-button labeled"
                type="button"
                onClick={() =>
                  setBoards((current) => [
                    ...current,
                    { id: newId("b"), name: `Board ${current.length + 1}`, cardsText: "" }
                  ])
                }
              >
                <Plus size={17} />
                Board
              </button>
            </div>

            <div className="stack">
              {boards.map((board) => (
                <div className="editor-row" key={board.id}>
                  <div className="field-grid compact">
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={board.name}
                        onChange={(event) =>
                          setBoards((current) =>
                            current.map((candidate) =>
                              candidate.id === board.id ? { ...candidate, name: event.target.value } : candidate
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Five board cards</span>
                      <input
                        placeholder="Ah Ks Td 9c 2d"
                        value={board.cardsText}
                        onChange={(event) =>
                          setBoards((current) =>
                            current.map((candidate) =>
                              candidate.id === board.id ? { ...candidate, cardsText: event.target.value } : candidate
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="row-footer">
                    <CardPreview text={board.cardsText} />
                    <button
                      aria-label={`Remove ${board.name}`}
                      className="icon-button danger"
                      type="button"
                      onClick={() => setBoards((current) => current.filter((candidate) => candidate.id !== board.id))}
                      disabled={boards.length <= 1}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <span className="section-icon"><Coins size={18} /></span>
                <h2>Pots</h2>
              </div>
              <button
                className="icon-button labeled"
                type="button"
                onClick={() =>
                  setPots((current) => [
                    ...current,
                    {
                      id: newId("pot"),
                      name: `Side Pot ${current.length}`,
                      amountText: "",
                      eligiblePlayerIds: players.filter((player) => player.isLiveAtShowdown).map((player) => player.id)
                    }
                  ])
                }
              >
                <Plus size={17} />
                Pot
              </button>
            </div>

            <div className="stack">
              {pots.map((pot) => (
                <div className="editor-row" key={pot.id}>
                  <div className="field-grid compact">
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={pot.name}
                        onChange={(event) =>
                          setPots((current) =>
                            current.map((candidate) =>
                              candidate.id === pot.id ? { ...candidate, name: event.target.value } : candidate
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Amount</span>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="300"
                        value={pot.amountText}
                        onChange={(event) =>
                          setPots((current) =>
                            current.map((candidate) =>
                              candidate.id === pot.id ? { ...candidate, amountText: event.target.value } : candidate
                            )
                          )
                        }
                      />
                    </label>
                  </div>

                  <div className="eligibility">
                    <span>Eligible players</span>
                    <div className="chip-grid">
                      {players.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          disabled={!player.isLiveAtShowdown}
                          className={pot.eligiblePlayerIds.includes(player.id) ? "choice-chip selected" : "choice-chip"}
                          onClick={() =>
                            setPots((current) =>
                              current.map((candidate) =>
                                candidate.id === pot.id
                                  ? {
                                      ...candidate,
                                      eligiblePlayerIds: toggleString(candidate.eligiblePlayerIds, player.id)
                                    }
                                  : candidate
                              )
                            )
                          }
                        >
                          {player.name || `Seat ${player.seatNumber}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="row-footer align-end">
                    <button
                      aria-label={`Remove ${pot.name}`}
                      className="icon-button danger"
                      type="button"
                      onClick={() => setPots((current) => current.filter((candidate) => candidate.id !== pot.id))}
                      disabled={pots.length <= 1}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="secondary-column">
          <section className="section sticky-section">
            <div className="section-heading">
              <div>
                <span className="section-icon"><Trophy size={18} /></span>
                <h2>Results</h2>
              </div>
              <button className="primary-button" type="button" onClick={() => runCalculation()}>
                <Calculator size={17} />
                Calculate
              </button>
            </div>

            {parsed.errors.length > 0 && (
              <div className="notice muted">
                <AlertTriangle size={17} />
                <span>{parsed.errors.length} entry issue{parsed.errors.length === 1 ? "" : "s"} before calculation.</span>
              </div>
            )}

            {errors.length > 0 && <MessageList title="Fix these first" messages={errors} tone="error" />}
            {result && result.warnings.length > 0 && <MessageList title="Warnings" messages={result.warnings} tone="warning" />}

            {result ? (
              <ResultsView result={result} players={players} boards={boards} unresolvedCount={unresolvedCount} />
            ) : (
              <div className="empty-state">
                <Coins size={28} />
                <p>Enter live players, five-card boards, pots, and eligibility, then calculate.</p>
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <span className="section-icon"><AlertTriangle size={18} /></span>
                <h2>Odd Chips</h2>
              </div>
              {unresolvedCount > 0 && <span className="count-pill">{unresolvedCount} open</span>}
            </div>

            {result?.oddChipDecisions.length ? (
              <div className="stack">
                {result.oddChipDecisions.map((decision) => (
                  <OddChipEditor
                    key={decision.id}
                    decision={oddDecisionDrafts[decision.id] ?? decision}
                    playersById={playersById}
                    boardsById={boardsById}
                    onChange={(patch) => updateOddDecision(decision.id, patch)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state slim">
                <CheckCircle2 size={24} />
                <p>Odd-chip decisions appear here after a calculation creates a remainder.</p>
              </div>
            )}
          </section>
        </aside>
      </main>

      <div className="mobile-action">
        <button className="primary-button wide" type="button" onClick={() => runCalculation()}>
          <Calculator size={18} />
          Calculate payouts
        </button>
      </div>
    </div>
  );
}

function buildCalculationInput(args: {
  players: PlayerDraft[];
  boards: BoardDraft[];
  pots: PotDraft[];
  rules: GameRules;
  oddDecisionDrafts: Record<string, OddDecisionDraft>;
}): { input: CalculationInput; errors: string[] } {
  const errors: string[] = [];

  const players: Player[] = args.players.map((player) => {
    const parsed = parseCards(player.holeCardsText);
    errors.push(...parsed.errors.map((error) => `${player.name || `Seat ${player.seatNumber}`}: ${error}`));
    return {
      id: player.id,
      name: player.name,
      seatNumber: player.seatNumber,
      holeCards: parsed.cards,
      isLiveAtShowdown: player.isLiveAtShowdown
    };
  });

  const boards: Board[] = args.boards.map((board) => {
    const parsed = parseCards(board.cardsText);
    errors.push(...parsed.errors.map((error) => `${board.name}: ${error}`));
    return {
      id: board.id,
      name: board.name,
      cards: parsed.cards
    };
  });

  const pots: Pot[] = args.pots.map((pot) => ({
    id: pot.id,
    name: pot.name,
    amount: Number(pot.amountText),
    eligiblePlayerIds: pot.eligiblePlayerIds
  }));

  const oddChipDecisions = Object.values(args.oddDecisionDrafts).map((decision) => {
    const flipText = decision.flippedCardText ?? (decision.flippedCard ? formatCard(decision.flippedCard) : "");
    const parsedFlip = parseCards(flipText);
    if (parsedFlip.errors.length) {
      errors.push(...parsedFlip.errors.map((error) => `${decision.description ?? "Odd chip"}: ${error}`));
    }
    if (parsedFlip.cards.length > 1) {
      errors.push(`${decision.description ?? "Odd chip"} needs only one flipped card.`);
    }

    return {
      ...decision,
      flippedCard: flipText.trim() ? parsedFlip.cards[0] : undefined
    };
  });

  return {
    input: {
      players,
      boards,
      pots,
      gameRules: args.rules,
      oddChipPolicy: "colorFlip",
      oddChipDecisions
    },
    errors
  };
}

function mergeGeneratedOddDecisions(
  current: Record<string, OddDecisionDraft>,
  generated: OddChipDecision[]
): Record<string, OddDecisionDraft> {
  const next = { ...current };
  for (const decision of generated) {
    next[decision.id] = {
      ...decision,
      ...next[decision.id],
      description: decision.description,
      candidates: decision.candidates,
      context: decision.context,
      amount: decision.amount,
      candidateType: decision.candidateType,
      policy: decision.policy,
      status: decision.status,
      flippedCardText: next[decision.id]?.flippedCardText ?? (decision.flippedCard ? formatCard(decision.flippedCard) : "")
    };
  }
  return next;
}

function CardPreview({ text }: { text: string }) {
  const parsed = parseCards(text);
  if (!text.trim()) return <span className="card-preview empty">No cards</span>;
  if (parsed.errors.length) return <span className="card-preview error">{parsed.errors[0]}</span>;
  return (
    <span className="card-preview">
      {parsed.cards.map((card) => (
        <span className={`mini-card ${card.suit === "h" || card.suit === "d" ? "red" : "black"}`} key={cardKey(card)}>
          {formatCard(card)}
        </span>
      ))}
    </span>
  );
}

function OddChipEditor({
  decision,
  playersById,
  boardsById,
  onChange
}: {
  decision: OddDecisionDraft;
  playersById: Map<string, PlayerDraft>;
  boardsById: Map<string, BoardDraft>;
  onChange: (patch: Partial<OddDecisionDraft>) => void;
}) {
  const canColorFlip = decision.candidates.length === 2;
  const candidateLabel = (id: string) => playersById.get(id)?.name || boardsById.get(id)?.name || id;
  const mode = decision.selectedCandidateId && !decision.chosenColorPlayerId ? "manual" : canColorFlip ? "color" : "manual";

  return (
    <div className={`odd-chip ${decision.status === "resolved" ? "resolved" : ""}`}>
      <div className="odd-chip-head">
        <strong>{decision.description ?? "Odd chip"}</strong>
        <span>{decision.status === "resolved" ? "Resolved" : `${decision.amount} chip open`}</span>
      </div>

      {canColorFlip ? (
        <div className="resolver-block">
          <div className="mode-tabs">
            <button
              type="button"
              className={mode === "color" ? "segment active" : "segment"}
              onClick={() => onChange({ selectedCandidateId: undefined })}
            >
              Color flip
            </button>
            <button
              type="button"
              className={mode === "manual" ? "segment active" : "segment"}
              onClick={() => onChange({ chosenColorPlayerId: undefined, chosenColor: undefined, flippedCardText: "" })}
            >
              Manual
            </button>
          </div>

          {mode === "color" ? (
            <div className="field-grid compact">
              <label className="field">
                <span>Picked color</span>
                <select
                  aria-label="Picked color"
                  value={decision.chosenColorPlayerId ?? ""}
                  onChange={(event) =>
                    onChange({
                      chosenColorPlayerId: event.target.value,
                      selectedCandidateId: undefined
                    })
                  }
                >
                  <option value="">Choose</option>
                  {decision.candidates.map((candidateId) => (
                    <option key={candidateId} value={candidateId}>
                      {candidateLabel(candidateId)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Color</span>
                <select
                  aria-label="Color"
                  value={decision.chosenColor ?? ""}
                  onChange={(event) =>
                    onChange({
                      chosenColor: event.target.value as OddChipDecision["chosenColor"],
                      selectedCandidateId: undefined
                    })
                  }
                >
                  <option value="">Choose</option>
                  <option value="red">Red</option>
                  <option value="black">Black</option>
                </select>
              </label>
              <label className="field">
                <span>Flipped card</span>
                <input
                  aria-label="Flipped card"
                  placeholder="8h"
                  value={decision.flippedCardText ?? ""}
                  onChange={(event) =>
                    onChange({
                      flippedCardText: event.target.value,
                      selectedCandidateId: undefined
                    })
                  }
                />
              </label>
            </div>
          ) : (
            <ManualOddSelector decision={decision} candidateLabel={candidateLabel} onChange={onChange} />
          )}
        </div>
      ) : (
        <>
          <p className="microcopy">
            Red/black cannot resolve {decision.candidates.length} candidates. Assign this chip manually.
          </p>
          <ManualOddSelector decision={decision} candidateLabel={candidateLabel} onChange={onChange} />
        </>
      )}
    </div>
  );
}

function ManualOddSelector({
  decision,
  candidateLabel,
  onChange
}: {
  decision: OddDecisionDraft;
  candidateLabel: (id: string) => string;
  onChange: (patch: Partial<OddDecisionDraft>) => void;
}) {
  return (
    <label className="field">
      <span>Odd chip winner</span>
      <select
        aria-label="Odd chip winner"
        value={decision.selectedCandidateId ?? ""}
        onChange={(event) =>
          onChange({
            selectedCandidateId: event.target.value || undefined,
            chosenColorPlayerId: undefined,
            chosenColor: undefined,
            flippedCardText: ""
          })
        }
      >
        <option value="">Unresolved</option>
        {decision.candidates.map((candidateId) => (
          <option key={candidateId} value={candidateId}>
            {candidateLabel(candidateId)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultsView({
  result,
  players,
  boards,
  unresolvedCount
}: {
  result: CalculationResult;
  players: PlayerDraft[];
  boards: BoardDraft[];
  unresolvedCount: number;
}) {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const boardsById = new Map(boards.map((board) => [board.id, board]));

  return (
    <div className="results">
      <div className="result-summary">
        <span>{unresolvedCount === 0 ? "All assigned" : `${unresolvedCount} odd chip${unresolvedCount === 1 ? "" : "s"} open`}</span>
      </div>

      <div className="payout-table">
        {players
          .slice()
          .sort((a, b) => a.seatNumber - b.seatNumber)
          .map((player) => (
            <div className="payout-row" key={player.id}>
              <span>{player.name || `Seat ${player.seatNumber}`}</span>
              <strong>{result.playerPayouts[player.id] ?? 0}</strong>
            </div>
          ))}
      </div>

      <details open className="detail-group">
        <summary>Pot breakdown</summary>
        <div className="stack">
          {result.potResults.map((pot) => (
            <div className="breakdown" key={pot.potId}>
              <div className="breakdown-title">
                <strong>{pot.potName}</strong>
                <span>{pot.amount} chips</span>
              </div>
              <p className="microcopy">
                Eligible: {pot.eligiblePlayerIds.map((id) => playersById.get(id)?.name ?? id).join(", ")}
              </p>

              {pot.unresolvedOddChips.map((decision) => (
                <p className="odd-warning" key={decision.id}>
                  {decision.description} held aside.
                </p>
              ))}

              {pot.boardShares.map((share) => (
                <div className="board-share" key={share.boardId}>
                  <div>
                    <strong>{boardsById.get(share.boardId)?.name ?? share.boardName}</strong>
                    <span>{share.amount} chips</span>
                  </div>
                  {share.winners.map((winner) => (
                    <WinnerLine winner={winner} playerName={playersById.get(winner.playerId)?.name ?? winner.playerId} key={winner.playerId} />
                  ))}
                  {share.unresolvedOddChips.map((decision) => (
                    <p className="odd-warning" key={decision.id}>
                      {decision.description} held aside.
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>

      <details className="detail-group">
        <summary>Board view</summary>
        <div className="stack">
          {result.boardResults.map((board) => (
            <div className="breakdown" key={board.boardId}>
              <div className="breakdown-title">
                <strong>{board.boardName}</strong>
              </div>
              {board.potResults.map((entry) => (
                <div className="board-share" key={entry.potId}>
                  <div>
                    <span>{entry.potName}</span>
                    <span>{entry.amount} chips</span>
                  </div>
                  {entry.winners.map((winner) => (
                    <WinnerLine winner={winner} playerName={playersById.get(winner.playerId)?.name ?? winner.playerId} key={winner.playerId} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function WinnerLine({ winner, playerName }: { winner: CalculationResult["potResults"][number]["boardShares"][number]["winners"][number]; playerName: string }) {
  return (
    <div className="winner-line">
      <span>
        <strong>{playerName}</strong> wins {winner.amountWon}
      </span>
      <small>
        {winner.hand.displayName}; {formatCards(winner.hand.fiveCardHand)}; {winner.hand.holeCardsUsed} hole used
      </small>
    </div>
  );
}

function MessageList({ title, messages, tone }: { title: string; messages: string[]; tone: "error" | "warning" }) {
  return (
    <div className={`message-list ${tone}`}>
      <strong>{title}</strong>
      <ul>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

function toggleString(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function toggleNumber(values: number[], value: number): number[] {
  const next = values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
  return next.sort((a, b) => a - b);
}

function addPlayer(players: PlayerDraft[], pots: PotDraft[], setPots: (updater: (current: PotDraft[]) => PotDraft[]) => void): PlayerDraft[] {
  const nextNumber = players.length + 1;
  const id = newId("p");
  setPots((current) =>
    current.map((pot) => ({
      ...pot,
      eligiblePlayerIds: [...pot.eligiblePlayerIds, id]
    }))
  );
  return [
    ...players,
    {
      id,
      name: `Player ${nextNumber}`,
      seatNumber: nextNumber,
      holeCardsText: "",
      isLiveAtShowdown: true
    }
  ];
}

function removePlayer(
  playerId: string,
  setPlayers: (updater: (current: PlayerDraft[]) => PlayerDraft[]) => void,
  setPots: (updater: (current: PotDraft[]) => PotDraft[]) => void
) {
  setPlayers((current) => current.filter((player) => player.id !== playerId));
  setPots((current) =>
    current.map((pot) => ({
      ...pot,
      eligiblePlayerIds: pot.eligiblePlayerIds.filter((id) => id !== playerId)
    }))
  );
}
