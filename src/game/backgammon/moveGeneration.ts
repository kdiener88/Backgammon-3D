import type { GameState, Move, Player } from "./types";
import { DIRECTION, HOME_RANGE, entryIndex, pipsToOff } from "./constants";

/** Number of the player's checkers sitting on a board index. */
export function ownCount(
  points: number[],
  player: Player,
  index: number,
): number {
  const v = points[index];
  return player === "white" ? Math.max(v, 0) : Math.max(-v, 0);
}

/** Number of the opponent's checkers sitting on a board index. */
export function opponentCount(
  points: number[],
  player: Player,
  index: number,
): number {
  const v = points[index];
  return player === "white" ? Math.max(-v, 0) : Math.max(v, 0);
}

/** A point is blocked when the opponent holds it with two or more checkers. */
export function isBlocked(
  points: number[],
  player: Player,
  index: number,
): boolean {
  return opponentCount(points, player, index) >= 2;
}

/** True when every checker not yet borne off sits in the player's home board. */
export function canBearOff(
  state: Pick<GameState, "points" | "bar">,
  player: Player,
): boolean {
  if (state.bar[player] > 0) return false;
  const [lo, hi] = HOME_RANGE[player];
  for (let i = 0; i < state.points.length; i++) {
    if (i >= lo && i <= hi) continue;
    if (ownCount(state.points, player, i) > 0) return false;
  }
  return true;
}

/**
 * All legal single moves for one die value from the given position,
 * ignoring the maximal-usage rule (that is applied over full sequences).
 */
export function singleMovesForDie(
  state: Pick<GameState, "points" | "bar">,
  player: Player,
  die: number,
): Move[] {
  const moves: Move[] = [];
  const { points, bar } = state;

  // Checkers on the bar must enter before anything else may move.
  if (bar[player] > 0) {
    const target = entryIndex(player, die);
    if (!isBlocked(points, player, target)) {
      moves.push({
        from: "bar",
        to: target,
        die,
        hit: opponentCount(points, player, target) === 1,
      });
    }
    return moves;
  }

  const dir = DIRECTION[player];
  const bearingOff = canBearOff(state, player);

  for (let from = 0; from < points.length; from++) {
    if (ownCount(points, player, from) === 0) continue;
    const to = from + dir * die;

    if (to >= 0 && to < points.length) {
      if (!isBlocked(points, player, to)) {
        moves.push({
          from,
          to,
          die,
          hit: opponentCount(points, player, to) === 1,
        });
      }
      continue;
    }

    // Destination is off the board: bear-off rules.
    if (!bearingOff) continue;
    const pips = pipsToOff(player, from);
    if (die === pips) {
      moves.push({ from, to: "off", die, hit: false });
    } else if (die > pips && !hasCheckerFartherOut(points, player, from)) {
      moves.push({ from, to: "off", die, hit: false });
    }
  }
  return moves;
}

/** True if the player has a checker farther from bear-off than `index`. */
function hasCheckerFartherOut(
  points: number[],
  player: Player,
  index: number,
): boolean {
  const [lo, hi] = HOME_RANGE[player];
  if (player === "white") {
    for (let i = index + 1; i <= hi; i++) {
      if (ownCount(points, player, i) > 0) return true;
    }
  } else {
    for (let i = lo; i < index; i++) {
      if (ownCount(points, player, i) > 0) return true;
    }
  }
  return false;
}

/** Minimal board snapshot used while enumerating sequences. */
interface BoardPos {
  points: number[];
  bar: Record<Player, number>;
  off: Record<Player, number>;
}

function cloneBoard(b: BoardPos): BoardPos {
  return {
    points: b.points.slice(),
    bar: { ...b.bar },
    off: { ...b.off },
  };
}

/** Applies a single move to a board snapshot (mutates the given clone). */
function applyToBoard(board: BoardPos, player: Player, move: Move): void {
  const sign = player === "white" ? 1 : -1;
  if (move.from === "bar") {
    board.bar[player] -= 1;
  } else {
    board.points[move.from] -= sign;
  }
  if (move.to === "off") {
    board.off[player] += 1;
    return;
  }
  if (move.hit) {
    const opp: Player = player === "white" ? "black" : "white";
    board.points[move.to] = 0;
    board.bar[opp] += 1;
  }
  board.points[move.to] += sign;
}

export function boardKey(board: BoardPos): string {
  return `${board.points.join(",")}|${board.bar.white},${board.bar.black}|${board.off.white},${board.off.black}`;
}

export function moveKey(move: Move): string {
  return `${move.from}>${move.to}/${move.die}`;
}

/**
 * Enumerates every maximal legal sequence for the dice available in `state`,
 * applying the compulsory rules:
 *  - as many dice as possible must be played;
 *  - with a non-double roll, if only one die can be played and either could
 *    be played individually, the higher die must be played.
 *
 * Returns full sequences (possibly empty: `[[]]` means "no legal move").
 */
export function maximalSequences(
  state: Pick<GameState, "points" | "bar" | "off" | "turn" | "dice">,
): Move[][] {
  const player = state.turn;
  const board: BoardPos = {
    points: state.points,
    bar: state.bar,
    off: state.off,
  };
  const memo = new Map<string, Move[][]>();

  function search(pos: BoardPos, dice: number[]): Move[][] {
    if (dice.length === 0) return [[]];
    const key = `${boardKey(pos)}#${dice.join(",")}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const results: Move[][] = [];
    const tried = new Set<number>();
    for (let i = 0; i < dice.length; i++) {
      const die = dice[i];
      if (tried.has(die)) continue;
      tried.add(die);
      const rest = dice.slice(0, i).concat(dice.slice(i + 1));
      for (const move of singleMovesForDie(pos, player, die)) {
        const next = cloneBoard(pos);
        applyToBoard(next, player, move);
        for (const tail of search(next, rest)) {
          results.push([move, ...tail]);
        }
      }
    }
    const out = results.length === 0 ? [[]] : results;
    memo.set(key, out);
    return out;
  }

  const all = search(board, state.dice);
  const maxLen = Math.max(...all.map((s) => s.length));
  let maximal = all.filter((s) => s.length === maxLen);

  // Higher-die rule: only relevant for a non-double roll where exactly one
  // die can be played.
  const dice = state.dice;
  if (maxLen === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const higher = Math.max(dice[0], dice[1]);
    const higherSeqs = maximal.filter((s) => s[0].die === higher);
    if (higherSeqs.length > 0) maximal = higherSeqs;
  }

  return maximal;
}

/** Sequences that start with the given prefix of already-played moves. */
export function sequencesAfterPrefix(
  sequences: Move[][],
  played: Move[],
): Move[][] {
  return sequences.filter((seq) => {
    if (seq.length < played.length) return false;
    return played.every((m, i) => moveKey(m) === moveKey(seq[i]));
  });
}

/**
 * The legal next single moves given the moves already played this turn.
 * A single move is legal only when it extends some maximal sequence — this
 * enforces "you must play both dice when possible" at every step.
 */
export function nextMovesAfterPrefix(
  sequences: Move[][],
  played: Move[],
): Move[] {
  const seen = new Map<string, Move>();
  for (const seq of sequencesAfterPrefix(sequences, played)) {
    const next = seq[played.length];
    if (next) seen.set(moveKey(next), next);
  }
  return [...seen.values()];
}

/** Distinct final positions reachable this turn, for engine consumption. */
export function distinctPlays(
  state: Pick<GameState, "points" | "bar" | "off" | "turn" | "dice">,
): { moves: Move[]; board: BoardPos }[] {
  const player = state.turn;
  const out = new Map<string, { moves: Move[]; board: BoardPos }>();
  for (const seq of maximalSequences(state)) {
    const board = cloneBoard({
      points: state.points,
      bar: state.bar,
      off: state.off,
    });
    for (const move of seq) applyToBoard(board, player, move);
    const key = boardKey(board);
    if (!out.has(key)) out.set(key, { moves: seq, board });
  }
  return [...out.values()];
}
