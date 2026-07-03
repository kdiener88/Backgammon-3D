import type { GameState, Move } from "../game/backgammon/types";

export type EngineStrength = "beginner" | "intermediate" | "expert";

export interface EngineMatchContext {
  matchLength: number;
  score: { white: number; black: number };
  cubeEnabled: boolean;
  isCrawfordGame: boolean;
}

export interface EngineMoveInput {
  /** Turn-start state: `turn` is the engine's side and `dice` are rolled. */
  state: GameState;
  match: EngineMatchContext;
  /** Soft budget; engines should return their best-so-far when exceeded. */
  timeLimitMs?: number;
}

export interface EngineMoveResult {
  /** Full move sequence for the turn (may be empty when dancing). */
  moves: Move[];
  /** Short human-readable rationale, i18n-key based (see explain.ts). */
  explanation: string;
  /** Engine's score for the chosen play (higher = better for the engine). */
  evaluation?: number;
}

export interface EngineEvalInput {
  state: GameState;
  match: EngineMatchContext;
}

export interface EngineEvalResult {
  /** Rough equity in [-1, 1] from the perspective of `state.turn`. */
  equity: number;
  /** Estimated probability that `state.turn` wins the game. */
  winProbability: number;
  /** Named feature contributions, for the analysis panel. */
  breakdown?: Record<string, number>;
}

export interface EngineCubeInput {
  state: GameState;
  match: EngineMatchContext;
  /** 'offer' = should the engine double? 'respond' = take or drop? */
  question: "offer" | "respond";
}

export interface EngineCubeResult {
  action: "double" | "no-double" | "take" | "drop";
  reason: string;
}

/**
 * Every AI backend implements this interface. Engines receive serialized
 * positions and return *intentions*; the rules core re-validates every move
 * before it touches the board, so a buggy or malicious engine can never
 * produce an illegal play.
 */
export interface BackgammonEngineAdapter {
  id: string;
  name: string;
  strength: EngineStrength;
  supportsCube: boolean;
  initialize?(): Promise<void>;
  chooseMove(input: EngineMoveInput): Promise<EngineMoveResult>;
  evaluatePosition?(input: EngineEvalInput): Promise<EngineEvalResult>;
  chooseCubeAction?(input: EngineCubeInput): Promise<EngineCubeResult>;
  dispose?(): Promise<void>;
}
