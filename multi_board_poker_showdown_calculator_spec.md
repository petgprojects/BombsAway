# Multi-Board Poker Showdown Calculator — Revised Spec

## 1. Product Goal

Build a web app that calculates poker showdown payouts for home-game poker hands involving:

- No-limit Hold’em
- Omaha-style games, including 4-card and 5-card Omaha
- Custom hole-card usage rules
- Bomb pots
- Multiple boards / “run it twice”
- Manually entered side pots
- Physical-chip payout support

The app is **not** a full poker game engine. It is a showdown calculator.

The core question it answers is:

> Given the players, their hole cards, the boards, the side pots, and the game rules, who wins each pot/board and how many chips should each player receive?

---

## 2. Core Assumptions

These assumptions should drive v1:

1. The hand is already at showdown.
2. The user manually enters all live players and their cards.
3. The user manually enters all boards.
4. The user manually enters pots and eligible players.
5. The app does not need to reconstruct betting history.
6. Folded players do not need to be entered unless relevant to dead money already included in a pot.
7. The app pays out physical chip amounts.
8. No settlement helper is needed.
9. No hi-lo games in v1.
10. No equity calculation before all board cards are known.

---

## 3. Supported Game Types

The app should use configurable presets. Presets should be editable.

### 3.1 No-Limit Hold’em

```ts
{
  name: "No-Limit Hold'em",
  holeCardsPerPlayer: 2,
  handConstructionMode: "bestAny",
  allowedHoleCardsUsed: [0, 1, 2]
}
```

Meaning:

- Each player has 2 hole cards.
- Best 5-card hand is chosen from hole cards plus board.
- Player may use 0, 1, or 2 hole cards.

---

### 3.2 Standard Omaha

```ts
{
  name: "Omaha",
  holeCardsPerPlayer: 4,
  handConstructionMode: "allowedHoleCounts",
  allowedHoleCardsUsed: [2]
}
```

Meaning:

- Each player has 4 hole cards.
- Player must use exactly 2 hole cards.
- Player must use exactly 3 board cards.

---

### 3.3 5-Card Omaha — Use Exactly 2 Hole Cards

```ts
{
  name: "5-Card Omaha — Use 2",
  holeCardsPerPlayer: 5,
  handConstructionMode: "allowedHoleCounts",
  allowedHoleCardsUsed: [2]
}
```

Meaning:

- Each player has 5 hole cards.
- Player must use exactly 2 hole cards.
- Player must use exactly 3 board cards.

---

### 3.4 5-Card Omaha — Use Exactly 3 Hole Cards

```ts
{
  name: "5-Card Omaha — Use 3",
  holeCardsPerPlayer: 5,
  handConstructionMode: "allowedHoleCounts",
  allowedHoleCardsUsed: [3]
}
```

Meaning:

- Each player has 5 hole cards.
- Player must use exactly 3 hole cards.
- Player must use exactly 2 board cards.

---

### 3.5 5-Card Omaha — Use Either 2 or 3 Hole Cards

```ts
{
  name: "5-Card Omaha — Use 2 or 3",
  holeCardsPerPlayer: 5,
  handConstructionMode: "allowedHoleCounts",
  allowedHoleCardsUsed: [2, 3]
}
```

Meaning:

- Each player has 5 hole cards.
- For each possible 5-card hand, the player may use either:
  - exactly 2 hole cards and 3 board cards, or
  - exactly 3 hole cards and 2 board cards.
- The best legal 5-card hand wins.

This is an important house-rule variant and must be supported.

---

### 3.6 Custom Game

```ts
type GameRules = {
  name: string;
  holeCardsPerPlayer: number;
  handConstructionMode: "bestAny" | "allowedHoleCounts";
  allowedHoleCardsUsed: number[];
};
```

Validation:

```ts
for each k in allowedHoleCardsUsed:
  k >= 0
  k <= holeCardsPerPlayer
  5 - k >= 0
  5 - k <= boardCards.length
```

---

## 4. Data Model

### 4.1 Card

```ts
type Suit = "s" | "h" | "d" | "c";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";

type Card = {
  rank: Rank;
  suit: Suit;
};
```

Text notation should support:

```txt
Ah Ks
Td 9c
7h 7d 7s 2c Ac
```

The app must reject duplicate cards globally across:

- Player hole cards
- Board cards
- Optional exposed odd-chip tiebreaker card, if entered

---

### 4.2 Player

```ts
type Player = {
  id: string;
  name: string;
  seatNumber: number;
  holeCards: Card[];
  isLiveAtShowdown: boolean;
};
```

Notes:

- `seatNumber` is mostly for display and ordering.
- `isLiveAtShowdown` allows the app to keep a player visible while excluding them from eligibility.
- Folded/dead players generally do not need cards.

---

### 4.3 Board

```ts
type Board = {
  id: string;
  name: string;
  cards: Card[];
};
```

For v1:

- Every board must have exactly 5 cards.
- Multiple boards are supported.
- Each pot is split across all boards.

---

### 4.4 Pot

Unlike a full poker engine, v1 should **not** derive side pots from betting history.

Instead, the user manually enters each pot.

```ts
type Pot = {
  id: string;
  name: string; // "Main Pot", "Side Pot 1", etc.
  amount: number; // integer chip units
  eligiblePlayerIds: string[];
};
```

Example:

```ts
[
  {
    id: "pot-main",
    name: "Main Pot",
    amount: 300,
    eligiblePlayerIds: ["p1", "p2", "p3", "p4"]
  },
  {
    id: "pot-side-1",
    name: "Side Pot 1",
    amount: 120,
    eligiblePlayerIds: ["p2", "p3"]
  }
]
```

This matches the real workflow:

- The group knows the pot amounts.
- The group knows who is eligible for each side pot.
- The app should not try to reconstruct betting.

---

## 5. Multi-Board Pot Splitting

Each entered pot is split across all boards.

Example:

```txt
Pot: 300 chips
Boards: 2

Board 1 share: 150
Board 2 share: 150
```

If the pot does not divide evenly across boards, use the odd-chip rule.

Example:

```txt
Pot: 301 chips
Boards: 2

Base split:
Board 1: 150
Board 2: 150
Odd chip: unresolved
```

Because your game resolves odd chips by color flip, the app should explicitly mark odd chips as needing resolution rather than automatically assigning them unless the user enters the result.

---

## 6. Odd-Chip Rules

### 6.1 Default Odd-Chip Method

Your house rule:

> One player picks red or black. Flip the next card in the deck. If the card matches their chosen color, they get the odd chip. Otherwise, the other player gets it.

This applies most naturally when there are exactly 2 possible recipients.

The app should support this as the default odd-chip policy.

```ts
type OddChipPolicy = "colorFlip" | "manual";
```

---

### 6.2 Odd Chip Resolution Model

Odd chips can arise from:

1. Splitting a pot across multiple boards.
2. Splitting a board/pot share among tied winners.

Represent odd-chip decisions explicitly.

```ts
type OddChipDecision = {
  id: string;
  context:
    | "potAcrossBoards"
    | "boardShareAcrossTiedWinners";
  amount: number; // usually 1 chip, but can be more if smallest unit creates remainder
  candidates: string[]; // board IDs or player IDs
  policy: "colorFlip" | "manual";
  status: "unresolved" | "resolved";
  selectedCandidateId?: string;
  chosenColorPlayerId?: string;
  chosenColor?: "red" | "black";
  flippedCard?: Card;
};
```

---

### 6.3 Color Flip Behavior

For tied winners:

Example:

```txt
Board share: 101 chips
Winners: Peter, Mike

Base:
Peter: 50
Mike: 50

Odd chip:
Peter picks red.
Flip next card: 8h.
Heart is red.
Peter gets the odd chip.
```

Result:

```txt
Peter: 51
Mike: 50
```

The UI should allow either:

- Enter who won the odd chip manually, or
- Enter:
  - player who picked color
  - selected color
  - flipped card

The app then determines the odd-chip winner.

Suit colors:

```ts
const suitColor = {
  h: "red",
  d: "red",
  s: "black",
  c: "black"
};
```

---

### 6.4 More Than Two Odd-Chip Candidates

Color flip is ambiguous when more than two candidates exist, for example:

- Pot remainder across 3 boards
- Tied hand with 3+ winners
- Multiple odd chips

For v1, support this simple rule:

If exactly 2 candidates:
- use color flip

If more than 2 candidates:
- require manual assignment

The app should show:

```txt
Odd chip cannot be resolved by red/black because there are 3 candidates. Please manually assign it.
```

---

## 7. Hand Evaluation

The app evaluates standard high-hand poker only.

Ranking order:

1. Royal flush
2. Straight flush
3. Four of a kind
4. Full house
5. Flush
6. Straight
7. Three of a kind
8. Two pair
9. One pair
10. High card

No hi-lo.

---

### 7.1 HandResult

```ts
type HandCategory =
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

type HandResult = {
  category: HandCategory;
  categoryRank: number;
  tieBreakers: number[];
  fiveCardHand: Card[];
  displayName: string;
  holeCardsUsed: number;
};
```

`holeCardsUsed` is important for custom Omaha variants so the UI can show whether the winning hand used 2 or 3 hole cards.

---

### 7.2 Hold’em / Best Any

```ts
function evaluateBestAny(holeCards: Card[], boardCards: Card[]): HandResult {
  const allCards = [...holeCards, ...boardCards];
  const candidateHands = combinations(allCards, 5);
  return bestFiveCardHand(candidateHands);
}
```

---

### 7.3 Allowed Hole Counts

This should support Omaha and custom variants.

```ts
function evaluateAllowedHoleCounts(
  holeCards: Card[],
  boardCards: Card[],
  allowedHoleCardsUsed: number[]
): HandResult {
  const candidateHands = [];

  for (const holeCount of allowedHoleCardsUsed) {
    const boardCount = 5 - holeCount;

    const holeCombos = combinations(holeCards, holeCount);
    const boardCombos = combinations(boardCards, boardCount);

    for (const h of holeCombos) {
      for (const b of boardCombos) {
        candidateHands.push({
          cards: [...h, ...b],
          holeCardsUsed: holeCount
        });
      }
    }
  }

  return bestFiveCardHand(candidateHands);
}
```

This is the key rule needed for:

- exact 2-card Omaha
- exact 3-card Omaha
- 2-or-3-card Omaha

---

## 8. Payout Algorithm

### 8.1 Inputs

```ts
type CalculationInput = {
  players: Player[];
  boards: Board[];
  pots: Pot[];
  gameRules: GameRules;
  oddChipPolicy: OddChipPolicy;
  oddChipDecisions?: OddChipDecision[];
};
```

---

### 8.2 Output

```ts
type CalculationResult = {
  playerPayouts: Record<string, number>;
  playerNetDisplay?: never; // not needed for physical chip games
  potResults: PotResult[];
  boardResults: BoardResult[];
  oddChipDecisions: OddChipDecision[];
  warnings: string[];
};
```

No settlement output.

---

### 8.3 Pot Result

```ts
type PotResult = {
  potId: string;
  potName: string;
  amount: number;
  eligiblePlayerIds: string[];
  boardShares: BoardShare[];
};
```

---

### 8.4 Board Share

```ts
type BoardShare = {
  boardId: string;
  amount: number;
  winners: BoardWinner[];
  unresolvedOddChips: OddChipDecision[];
};
```

---

### 8.5 Board Winner

```ts
type BoardWinner = {
  playerId: string;
  amountWon: number;
  hand: HandResult;
};
```

---

### 8.6 Calculation Flow

```ts
function calculatePayouts(input: CalculationInput): CalculationResult {
  validateInput(input);

  initialize payout map for all players at 0;

  for each pot:
    split pot.amount across boards;
    if uneven split creates odd chip:
      create odd-chip decision;
      if unresolved, hold odd chip aside from payouts;

    for each board share:
      evaluate all eligible live players on that board;
      determine best hand;
      determine winner(s);

      split board share among winners;
      if uneven winner split creates odd chip:
        create odd-chip decision;
        if resolved, assign it;
        if unresolved, hold it aside;

      add resolved payouts to player payout map;

  return calculation result with:
    payouts
    pot-by-pot results
    board-by-board results
    odd-chip decisions
    warnings
}
```

Important:

- The calculation should be valid even with unresolved odd chips.
- Unresolved odd chips should be displayed clearly.
- Resolved odd chips should be included in payouts.

---

## 9. Validation Rules

### 9.1 Cards

Reject calculation if:

- Duplicate card appears anywhere.
- Invalid rank or suit.
- Live player has wrong number of hole cards.
- Board has anything other than 5 cards.
- Odd-chip flipped card duplicates a known card.

---

### 9.2 Players

Reject calculation if:

- Fewer than 2 live players.
- A live player is missing hole cards.
- A player in a pot is not found.
- A player marked folded/live false is listed as eligible for a pot.

---

### 9.3 Pots

Reject calculation if:

- No pots are entered.
- Pot amount is not a positive integer.
- A pot has fewer than 1 eligible player.
- A pot includes an invalid player ID.

Warn if:

- A pot has only one eligible player.
  - This is allowed because a side pot can be uncontested.
  - The eligible player automatically receives that pot’s share across boards.

---

### 9.4 Game Rules

Reject calculation if:

- `holeCardsPerPlayer < 1`
- `allowedHoleCardsUsed` is empty
- Any allowed hole count is impossible
- Any board-card count would be negative or greater than 5

For example:

```txt
holeCardsPerPlayer = 2
allowedHoleCardsUsed = [3]
```

Invalid.

---

## 10. UI Requirements

### 10.1 Main Layout

```txt
[Game Setup]
- Game preset
- Hole cards per player
- Allowed hole cards used
  - Hold'em: best any
  - Omaha: exact 2
  - 5-card Omaha: exact 2
  - 5-card Omaha: exact 3
  - 5-card Omaha: 2 or 3
  - Custom

[Players]
- Seat
- Name
- Hole cards
- Live/folded toggle

[Boards]
- Board 1 cards
- Board 2 cards
- Add/remove board

[Pots]
- Pot name
- Pot amount
- Eligible players checkboxes
- Add/remove pot

[Odd Chips]
- List unresolved odd-chip decisions
- For 2-candidate decisions:
  - player who picked color
  - red/black selection
  - flipped card
  - or manual winner
- For 3+ candidates:
  - manual assignment

[Calculate]

[Results]
- Total payout by player
- Pot-by-pot breakdown
- Board-by-board breakdown
- Winning hand descriptions
- Unresolved odd-chip warnings
```

---

### 10.2 Player Entry

Default player labels:

```txt
Player 1
Player 2
Player 3
...
```

Allow renaming.

For card input:

```txt
Ah Ks
AhKs
Ah, Ks
```

The parser may normalize all to:

```ts
[{ rank: "A", suit: "h" }, { rank: "K", suit: "s" }]
```

---

### 10.3 Pot Entry UI

Each pot should have:

```txt
Name: Main Pot
Amount: 300
Eligible:
[x] Peter
[x] Mike
[x] James
[ ] Rob
```

This is more important than contribution tracking.

Do not require users to enter per-player bets.

---

## 11. Recommended Project Structure

```txt
/src
  /core
    cards.ts
    cardParser.ts
    combinations.ts
    handEvaluator.ts
    gameRules.ts
    pots.ts
    payouts.ts
    oddChips.ts
    validation.ts
  /ui
    components/
      GameSetup.tsx
      PlayerEditor.tsx
      BoardEditor.tsx
      PotEditor.tsx
      OddChipResolver.tsx
      ResultsView.tsx
  /tests
    cardParser.test.ts
    handEvaluator.test.ts
    omahaRules.test.ts
    payout.test.ts
    oddChips.test.ts
    validation.test.ts
```

Core calculation logic should be pure TypeScript and independent of the UI.

---

## 12. Test Cases

### 12.1 Hold’em

Test:

- Best 5 from 7 cards.
- Board plays.
- Kickers work.
- Ties chop correctly.
- Wheel straight A-2-3-4-5 works.

---

### 12.2 Omaha Exact 2

Scenario:

```txt
Player hole: Ah As Kc Qd
Board: Ad Ac 2h 3s 4c
```

The evaluator must use exactly 2 hole cards and 3 board cards.

It cannot freely use any 5 cards.

---

### 12.3 Omaha Exact 3

Scenario:

```txt
Player hole: Ah As Kc Qd Jh
Board: Ad Ac 2h 3s 4c
```

The evaluator must use exactly 3 hole cards and exactly 2 board cards.

---

### 12.4 Omaha 2 or 3

Scenario:

```txt
Game rule:
allowedHoleCardsUsed = [2, 3]
```

The evaluator must generate candidates using:

- 2 hole + 3 board
- 3 hole + 2 board

Then return the strongest legal hand.

The result should expose:

```txt
holeCardsUsed: 2
```

or:

```txt
holeCardsUsed: 3
```

depending on the winning hand.

---

### 12.5 Manual Side Pots

Input:

```txt
Players:
A, B, C

Pots:
Main Pot: 300, eligible A/B/C
Side Pot 1: 120, eligible B/C
```

Expected:

- Main pot evaluated among A, B, C.
- Side pot evaluated only among B and C.
- No betting reconstruction required.

---

### 12.6 Multi-Board Pot Split

Input:

```txt
Pot: 300
Boards: 2
Board 1 winner: A
Board 2 winner: B
```

Expected:

```txt
A receives 150
B receives 150
```

---

### 12.7 Tied Board

Input:

```txt
Board share: 100
Winners: A and B
```

Expected:

```txt
A receives 50
B receives 50
```

---

### 12.8 Odd Chip by Color Flip

Input:

```txt
Board share: 101
Winners: A and B

A picks red.
Flipped card: 8h.
```

Expected:

```txt
A receives 51
B receives 50
```

Input:

```txt
A picks red.
Flipped card: 8s.
```

Expected:

```txt
A receives 50
B receives 51
```

---

### 12.9 Odd Chip With 3 Candidates

Input:

```txt
Board share: 101
Winners: A, B, C
```

Expected:

- Equal base split: 33 each.
- 2 chips unresolved or manually assigned.
- Color flip is not used automatically because there are 3 candidates.

---

## 13. Out of Scope for v1

Do not implement:

- Betting engine
- Automatic side-pot derivation from bet history
- Settlement helper
- Hi-lo
- Lowball
- Equity calculator
- Accounts
- Authentication
- Database persistence
- Multiplayer synchronization
- Random dealing
- Rake
- Tournament support

---

## 14. Implementation Agent Prompt

Use this prompt for Codex or another implementation agent:

```txt
Build a TypeScript web app that calculates poker showdown payouts for home games with Hold’em, Omaha-style games, bomb pots, multiple boards, and manually entered side pots.

The app should have a pure TypeScript calculation engine and a simple web UI.

Core requirements:

1. Represent cards, players, boards, pots, game rules, hand results, odd-chip decisions, and payout results using typed TypeScript models.

2. Support Hold’em where the player may use any 0, 1, or 2 hole cards and the best 5-card hand is selected from hole cards plus board.

3. Support Omaha/custom hand-construction rules using `allowedHoleCardsUsed`.
   Examples:
   - Standard Omaha: 4 hole cards, allowedHoleCardsUsed = [2]
   - 5-card Omaha using 2 hole cards: 5 hole cards, allowedHoleCardsUsed = [2]
   - 5-card Omaha using 3 hole cards: 5 hole cards, allowedHoleCardsUsed = [3]
   - 5-card Omaha using either 2 or 3 hole cards: 5 hole cards, allowedHoleCardsUsed = [2, 3]

4. For allowed-hole-count games, generate all legal 5-card candidate hands by combining K hole cards with 5-K board cards for every K in allowedHoleCardsUsed. Evaluate all candidates and return the strongest legal hand.

5. Evaluate standard high-hand poker rankings only:
   royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card.

6. Support multiple boards. Each pot is split across all boards. Each board is evaluated independently.

7. Support manually entered pots. Each pot has:
   - name
   - amount
   - eligible players

Do not derive side pots from betting history.

8. Use integer chip units only. Do not use floating-point arithmetic for payouts.

9. Implement odd-chip handling:
   - Default policy is color flip.
   - If exactly two candidates exist, allow the user to enter which player picked red/black and the flipped card, then assign the odd chip accordingly.
   - If more than two candidates exist, require manual assignment.
   - The app should support unresolved odd chips and clearly show them in the result.

10. No settlement helper is needed.

11. No hi-lo support.

12. Output:
   - total payout by player
   - pot-by-pot breakdown
   - board-by-board winners
   - winning hand descriptions
   - hole cards used in the winning hand
   - unresolved odd-chip warnings

13. Include unit tests for:
   - card parsing
   - duplicate card validation
   - Hold’em hand evaluation
   - Omaha exact-2 evaluation
   - Omaha exact-3 evaluation
   - Omaha 2-or-3 evaluation
   - manual side pots
   - multi-board payouts
   - chopped pots
   - color-flip odd-chip resolution
   - unresolved odd chips with 3+ candidates

Keep the calculation engine separate from the UI.
```
