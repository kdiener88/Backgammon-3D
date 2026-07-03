import type { GameState, Player } from "./types";
import { CHECKERS_PER_PLAYER, NUM_POINTS } from "./constants";
import { ownCount } from "./moveGeneration";

/**
 * Structural invariant checks. Returns a list of human-readable violations;
 * an empty list means the state is valid. Used by tests, self-play and when
 * deserializing persisted games.
 */
export function validateGameState(state: GameState): string[] {
  const errors: string[] = [];

  if (state.points.length !== NUM_POINTS) {
    errors.push(
      `points must have ${NUM_POINTS} entries, got ${state.points.length}`,
    );
    return errors;
  }

  for (const player of ["white", "black"] as Player[]) {
    let total = state.bar[player] + state.off[player];
    for (let i = 0; i < NUM_POINTS; i++) {
      total += ownCount(state.points, player, i);
    }
    if (total !== CHECKERS_PER_PLAYER) {
      errors.push(
        `${player} has ${total} checkers, expected ${CHECKERS_PER_PLAYER}`,
      );
    }
    if (state.bar[player] < 0) errors.push(`${player} bar is negative`);
    if (state.off[player] < 0) errors.push(`${player} off is negative`);
  }

  for (let i = 0; i < NUM_POINTS; i++) {
    if (!Number.isInteger(state.points[i])) {
      errors.push(`point ${i} is not an integer`);
    }
    if (Math.abs(state.points[i]) > CHECKERS_PER_PLAYER) {
      errors.push(`point ${i} holds more than ${CHECKERS_PER_PLAYER} checkers`);
    }
  }

  if (state.dice.length > 4) errors.push("more than 4 dice pending");
  for (const d of state.dice) {
    if (!Number.isInteger(d) || d < 1 || d > 6)
      errors.push(`invalid die value ${d}`);
  }

  if (state.phase === "gameOver" && state.winner === null) {
    errors.push("gameOver phase without a winner");
  }
  if (
    state.winner !== null &&
    state.off[state.winner] !== CHECKERS_PER_PLAYER
  ) {
    // A dropped double also ends the game without 15 checkers off; that is
    // recorded with winKind 'single' and empty dice.
    if (state.winKind !== "single") {
      errors.push("winner declared without 15 checkers off (and not a drop)");
    }
  }

  return errors;
}
