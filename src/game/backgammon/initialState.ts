import type { GameState, MatchState } from "./types";
import { NUM_POINTS } from "./constants";

/** Standard backgammon starting position (see docs/rules.md). */
export function initialPoints(): number[] {
  const points = new Array<number>(NUM_POINTS).fill(0);
  // White: 2 on the 24-point, 5 on the 13-point, 3 on the 8-point, 5 on the 6-point.
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  // Black mirrors white.
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return points;
}

export function initialGameState(): GameState {
  return {
    points: initialPoints(),
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    turn: "white",
    phase: "openingRoll",
    dice: [],
    rolled: null,
    openingRoll: null,
    cube: { value: 1, owner: "center", offeredBy: null },
    winner: null,
    winKind: null,
    turnMoves: [],
  };
}

export function initialMatchState(
  matchLength: number,
  cubeEnabled: boolean,
): MatchState {
  return {
    game: initialGameState(),
    score: { white: 0, black: 0 },
    matchLength,
    isCrawfordGame: false,
    crawfordDone: false,
    cubeEnabled,
    matchWinner: null,
  };
}
