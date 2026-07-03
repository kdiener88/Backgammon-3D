/**
 * Core types for the backgammon rules engine.
 *
 * Board representation:
 * - `points` is an array of 24 signed integers indexed 0..23.
 *   Index i corresponds to White's point number (i + 1).
 *   Positive values = White checkers, negative values = Black checkers.
 * - White's home board is indices 0..5 (points 1..6) and White moves
 *   toward index 0 (decreasing). White enters from the bar onto 24 - die.
 * - Black's home board is indices 18..23 and Black moves toward index 23
 *   (increasing). Black enters from the bar onto die - 1.
 *
 * This module must stay free of any React / DOM / engine dependencies.
 */

export type Player = "white" | "black";

export type GamePhase =
  "openingRoll" | "rolling" | "moving" | "doubleOffered" | "gameOver";

export type WinKind = "single" | "gammon" | "backgammon";

/** A single checker move consuming exactly one die. */
export interface Move {
  /** Board index 0..23, or 'bar' when entering from the bar. */
  from: number | "bar";
  /** Board index 0..23, or 'off' when bearing off. */
  to: number | "off";
  /** Die value (1..6) consumed by this move. */
  die: number;
  /** True when the move hits a lone opposing checker (sends it to the bar). */
  hit: boolean;
}

export interface CubeState {
  value: number;
  /** 'center' means either player may double. */
  owner: Player | "center";
  /** Set while a double offer is pending acceptance. */
  offeredBy: Player | null;
}

export interface GameState {
  points: number[];
  bar: Record<Player, number>;
  off: Record<Player, number>;
  turn: Player;
  phase: GamePhase;
  /** Remaining die values to play this turn. Doubles are expanded to 4 entries. */
  dice: number[];
  /** The roll as it left the cup (null before rolling). */
  rolled: [number, number] | null;
  /** Opening roll values (one die each) once decided. */
  openingRoll: { white: number; black: number } | null;
  cube: CubeState;
  winner: Player | null;
  winKind: WinKind | null;
  /** Moves already played within the current turn (for undo / notation). */
  turnMoves: Move[];
}

export interface MatchState {
  game: GameState;
  score: Record<Player, number>;
  /** 1, 3, 5, 7 or 11 points. */
  matchLength: number;
  /** True while the current game is the Crawford game. */
  isCrawfordGame: boolean;
  /** True once the Crawford game has been played. */
  crawfordDone: boolean;
  cubeEnabled: boolean;
  matchWinner: Player | null;
}

/** One completed turn, for history/replay. */
export interface TurnRecord {
  player: Player;
  roll: [number, number];
  moves: Move[];
  /** Human-readable notation, e.g. "31: 8/5 6/5*". */
  notation: string;
  /** Cube action taken this turn, if any. */
  cubeAction?: "double" | "take" | "drop";
}

export interface GameRecord {
  seed: number | null;
  turns: TurnRecord[];
  initialTurn: Player | null;
}

export interface DiceRoller {
  /** Returns an integer in [1, 6]. */
  rollDie(): number;
  /** Optional: expose the seed for replay. */
  readonly seed: number | null;
}
