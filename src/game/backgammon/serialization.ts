import type { GameState, MatchState } from "./types";
import { validateGameState } from "./validate";

const SCHEMA_VERSION = 1;

export interface SerializedMatch {
  version: number;
  match: MatchState;
}

export function serializeMatch(match: MatchState): string {
  const payload: SerializedMatch = { version: SCHEMA_VERSION, match };
  return JSON.stringify(payload);
}

/**
 * Parses and validates a serialized match. Returns null on any structural
 * problem instead of throwing, so callers can fall back to a fresh game.
 */
export function deserializeMatch(raw: string): MatchState | null {
  try {
    const parsed = JSON.parse(raw) as SerializedMatch;
    if (parsed.version !== SCHEMA_VERSION) return null;
    const match = parsed.match;
    if (!match || typeof match !== "object") return null;
    if (!match.game || !Array.isArray(match.game.points)) return null;
    const errors = validateGameState(match.game);
    if (errors.length > 0) return null;
    return match;
  } catch {
    return null;
  }
}

/**
 * Stable cache key for a position + dice + player to move. Used by engines
 * to memoize evaluations.
 */
export function positionKey(
  state: Pick<GameState, "points" | "bar" | "off" | "turn" | "dice">,
): string {
  const dice = state.dice
    .slice()
    .sort((a, b) => a - b)
    .join("");
  return `${state.points.join(",")}|${state.bar.white},${state.bar.black}|${state.off.white},${state.off.black}|${state.turn}|${dice}`;
}
