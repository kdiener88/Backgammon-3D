import type { GameState, Move, Player } from "../types";
import { initialGameState } from "../initialState";
import { createSeededRoller } from "../dice";
import { maximalSequences, moveKey } from "../moveGeneration";
import { applyMoveToGame, finishTurn, rollOpening, rollTurn } from "../rules";
import { greedyFallbackMove } from "../../../engines/BuiltInHeuristicEngine";

/**
 * Builds a custom position. `points` maps board index -> signed checker
 * count (positive white / negative black). Counts are the caller's
 * responsibility unless `autoFill` is set, which dumps any missing checkers
 * on each side's 1-point equivalent... deliberately NOT done: tests should
 * state complete positions so invariant checks stay meaningful.
 */
export function makeState(config: {
  points: Record<number, number>;
  bar?: { white?: number; black?: number };
  off?: { white?: number; black?: number };
  turn?: Player;
  dice?: number[];
  phase?: GameState["phase"];
}): GameState {
  const state = initialGameState();
  state.points = new Array(24).fill(0);
  for (const [idx, count] of Object.entries(config.points)) {
    state.points[Number(idx)] = count;
  }
  state.bar = { white: config.bar?.white ?? 0, black: config.bar?.black ?? 0 };
  state.off = { white: config.off?.white ?? 0, black: config.off?.black ?? 0 };
  state.turn = config.turn ?? "white";
  state.dice = config.dice ?? [];
  state.rolled =
    config.dice && config.dice.length >= 2
      ? [config.dice[0], config.dice[1]]
      : null;
  state.phase = config.phase ?? "moving";
  return state;
}

/** True when `moves` matches one of the position's maximal legal sequences. */
export function isLegalSequence(state: GameState, moves: Move[]): boolean {
  const legal = maximalSequences(state);
  if (legal.length === 1 && legal[0].length === 0) return moves.length === 0;
  const key = moves.map(moveKey).join(" ");
  return legal.some((seq) => seq.map(moveKey).join(" ") === key);
}

export interface PlayoutResult {
  states: GameState[];
  finished: boolean;
  turns: number;
}

/**
 * Plays a full seeded game with the greedy engine on both sides. Returns
 * every intermediate state so tests can validate invariants throughout.
 */
export function playSeededGame(seed: number, maxTurns = 500): PlayoutResult {
  const roller = createSeededRoller(seed);
  let state = rollOpening(initialGameState(), roller);
  const states: GameState[] = [state];
  let turns = 0;

  while (state.phase !== "gameOver" && turns < maxTurns) {
    if (state.phase === "rolling") {
      state = rollTurn(state, roller);
      states.push(state);
    }
    const result = greedyFallbackMove(state);
    for (const move of result.moves) {
      state = applyMoveToGame(state, move);
      states.push(state);
    }
    if (state.phase !== "gameOver") {
      state = finishTurn(state);
      states.push(state);
    }
    turns++;
  }

  return { states, finished: state.phase === "gameOver", turns };
}

/**
 * Deterministically reaches a mid-game position by playing `plies` turns
 * of a seeded game, then re-rolls so the returned state is ready to move.
 */
export function midGamePosition(seed: number, plies: number): GameState {
  const roller = createSeededRoller(seed);
  let state = rollOpening(initialGameState(), roller);
  for (let i = 0; i < plies && state.phase !== "gameOver"; i++) {
    const result = greedyFallbackMove(state);
    for (const move of result.moves) {
      state = applyMoveToGame(state, move);
    }
    if (state.phase === "gameOver") break;
    state = finishTurn(state);
    state = rollTurn(state, roller);
  }
  return state;
}
