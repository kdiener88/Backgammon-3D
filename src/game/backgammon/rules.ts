import type {
  DiceRoller,
  GameState,
  MatchState,
  Move,
  Player,
  WinKind,
} from "./types";
import { CHECKERS_PER_PLAYER, HOME_RANGE, OPPONENT } from "./constants";
import { diceForRoll } from "./dice";
import { opponentCount, ownCount, singleMovesForDie } from "./moveGeneration";

function cloneGame(state: GameState): GameState {
  return {
    ...state,
    points: state.points.slice(),
    bar: { ...state.bar },
    off: { ...state.off },
    dice: state.dice.slice(),
    rolled: state.rolled ? [...state.rolled] : null,
    openingRoll: state.openingRoll ? { ...state.openingRoll } : null,
    cube: { ...state.cube },
    turnMoves: state.turnMoves.map((m) => ({ ...m })),
  };
}

/**
 * Opening roll: each player rolls one die; ties re-roll. The winner starts
 * and plays the two opening dice.
 */
export function rollOpening(state: GameState, roller: DiceRoller): GameState {
  if (state.phase !== "openingRoll") {
    throw new Error(`cannot roll opening in phase ${state.phase}`);
  }
  let white = roller.rollDie();
  let black = roller.rollDie();
  while (white === black) {
    white = roller.rollDie();
    black = roller.rollDie();
  }
  const next = cloneGame(state);
  next.openingRoll = { white, black };
  next.turn = white > black ? "white" : "black";
  next.rolled = [white, black];
  next.dice = diceForRoll([white, black]);
  next.phase = "moving";
  next.turnMoves = [];
  return next;
}

/** Rolls both dice for the player to move. */
export function rollTurn(state: GameState, roller: DiceRoller): GameState {
  if (state.phase !== "rolling") {
    throw new Error(`cannot roll in phase ${state.phase}`);
  }
  const next = cloneGame(state);
  const roll: [number, number] = [roller.rollDie(), roller.rollDie()];
  next.rolled = roll;
  next.dice = diceForRoll(roll);
  next.phase = "moving";
  next.turnMoves = [];
  return next;
}

/**
 * Applies one single move after re-validating it against the move
 * generator, so no caller (UI, engine, remote adapter) can ever corrupt
 * the board with an illegal play. This checks per-die legality — movement
 * direction and distance, bar-entry priority, blocking, and bear-off
 * eligibility. Sequence-level rules (maximal dice usage, higher-die) are
 * the caller's responsibility via `nextMovesAfterPrefix`.
 */
export function applyMoveToGame(state: GameState, move: Move): GameState {
  if (state.phase !== "moving") {
    throw new Error(`cannot move in phase ${state.phase}`);
  }
  const player = state.turn;
  const dieIdx = state.dice.indexOf(move.die);
  if (dieIdx === -1) {
    throw new Error(`die ${move.die} is not available`);
  }
  const legalForDie = singleMovesForDie(state, player, move.die);
  if (!legalForDie.some((m) => m.from === move.from && m.to === move.to)) {
    throw new Error(
      `illegal move ${String(move.from)}>${String(move.to)} with die ${move.die}`,
    );
  }
  const next = cloneGame(state);
  const sign = player === "white" ? 1 : -1;

  if (move.from === "bar") {
    next.bar[player] -= 1;
  } else {
    next.points[move.from] -= sign;
  }

  if (move.to === "off") {
    next.off[player] += 1;
  } else {
    const oppOnTarget = opponentCount(next.points, player, move.to);
    if (oppOnTarget === 1) {
      next.points[move.to] = 0;
      next.bar[OPPONENT[player]] += 1;
    }
    next.points[move.to] += sign;
  }

  next.dice.splice(dieIdx, 1);
  next.turnMoves.push({
    ...move,
    hit:
      move.to !== "off" && opponentCount(state.points, player, move.to) === 1,
  });

  if (next.off[player] === CHECKERS_PER_PLAYER) {
    next.phase = "gameOver";
    next.winner = player;
    next.winKind = winKindFor(next, player);
    next.dice = [];
  }
  return next;
}

/** Ends the turn: clears dice and hands play to the opponent. */
export function finishTurn(state: GameState): GameState {
  if (state.phase !== "moving") {
    throw new Error(`cannot finish turn in phase ${state.phase}`);
  }
  const next = cloneGame(state);
  next.turn = OPPONENT[state.turn];
  next.phase = "rolling";
  next.dice = [];
  next.rolled = null;
  next.turnMoves = [];
  return next;
}

/** Classifies a finished game: single, gammon or backgammon. */
export function winKindFor(state: GameState, winner: Player): WinKind {
  const loser = OPPONENT[winner];
  if (state.off[loser] > 0) return "single";
  // Backgammon: loser still has checkers on the bar or in the winner's home.
  if (state.bar[loser] > 0) return "backgammon";
  const [lo, hi] = HOME_RANGE[winner];
  for (let i = lo; i <= hi; i++) {
    if (ownCount(state.points, loser, i) > 0) return "backgammon";
  }
  return "gammon";
}

export const WIN_MULTIPLIER: Record<WinKind, number> = {
  single: 1,
  gammon: 2,
  backgammon: 3,
};

/**
 * Resignation. Standard rules make resignation an offer at a declared
 * level; as a single-player simplification the conceded level is derived
 * from the position so a player cannot dodge a clearly won gammon or
 * backgammon by resigning first: once the winner has 10+ checkers off and
 * the resigner none, the current gammon/backgammon classification applies.
 */
export function resign(state: GameState, player: Player): GameState {
  if (state.phase === "gameOver") {
    throw new Error("game is already over");
  }
  const winner = OPPONENT[player];
  const next = cloneGame(state);
  next.phase = "gameOver";
  next.winner = winner;
  next.winKind =
    state.off[winner] >= 10 && state.off[player] === 0
      ? winKindFor(state, winner)
      : "single";
  next.dice = [];
  return next;
}

// ---------------------------------------------------------------------------
// Doubling cube
// ---------------------------------------------------------------------------

export function canOfferDouble(match: MatchState, player: Player): boolean {
  const { game } = match;
  return (
    match.cubeEnabled &&
    !match.isCrawfordGame &&
    game.phase === "rolling" &&
    game.turn === player &&
    (game.cube.owner === "center" || game.cube.owner === player) &&
    game.cube.offeredBy === null
  );
}

export function offerDouble(state: GameState, player: Player): GameState {
  const next = cloneGame(state);
  next.cube = { ...next.cube, offeredBy: player };
  next.phase = "doubleOffered";
  return next;
}

export function acceptDouble(state: GameState): GameState {
  if (state.phase !== "doubleOffered" || !state.cube.offeredBy) {
    throw new Error("no double pending");
  }
  const next = cloneGame(state);
  next.cube = {
    value: state.cube.value * 2,
    owner: OPPONENT[state.cube.offeredBy],
    offeredBy: null,
  };
  next.phase = "rolling";
  return next;
}

/** Declining a double: the offerer wins the pre-double cube value. */
export function dropDouble(state: GameState): GameState {
  if (state.phase !== "doubleOffered" || !state.cube.offeredBy) {
    throw new Error("no double pending");
  }
  const next = cloneGame(state);
  next.phase = "gameOver";
  next.winner = state.cube.offeredBy;
  next.winKind = "single";
  next.cube = { ...next.cube, offeredBy: null };
  return next;
}

// ---------------------------------------------------------------------------
// Match scoring
// ---------------------------------------------------------------------------

/** Points awarded for a finished game (win kind × cube value). */
export function gamePoints(state: GameState): number {
  if (!state.winner || !state.winKind) return 0;
  return WIN_MULTIPLIER[state.winKind] * state.cube.value;
}

/**
 * Applies a finished game to the match: updates the score, Crawford flags
 * and the match winner.
 */
export function applyGameResult(match: MatchState): MatchState {
  const { game } = match;
  if (game.phase !== "gameOver" || !game.winner) {
    throw new Error("game is not over");
  }
  const score = { ...match.score };
  score[game.winner] += gamePoints(game);

  const next: MatchState = {
    ...match,
    score,
    game,
  };

  if (score[game.winner] >= match.matchLength) {
    next.matchWinner = game.winner;
    return next;
  }

  if (match.isCrawfordGame) {
    next.isCrawfordGame = false;
    next.crawfordDone = true;
  }
  return next;
}

/** Whether the next game must be the Crawford game. */
export function nextGameIsCrawford(match: MatchState): boolean {
  if (match.crawfordDone || match.matchLength <= 1) return false;
  const oneAway =
    match.score.white === match.matchLength - 1 ||
    match.score.black === match.matchLength - 1;
  return oneAway && !match.isCrawfordGame;
}
