import type { Player } from "./types";

export const NUM_POINTS = 24;
export const CHECKERS_PER_PLAYER = 15;

/** Direction of travel across board indices: white decreases, black increases. */
export const DIRECTION: Record<Player, 1 | -1> = {
  white: -1,
  black: 1,
};

/** Home board index ranges, inclusive. */
export const HOME_RANGE: Record<Player, [number, number]> = {
  white: [0, 5],
  black: [18, 23],
};

export const OPPONENT: Record<Player, Player> = {
  white: "black",
  black: "white",
};

export const MATCH_LENGTHS = [1, 3, 5, 7, 11] as const;

/** The 21 distinct dice rolls with their probability weights (out of 36). */
export const DISTINCT_ROLLS: ReadonlyArray<{
  dice: [number, number];
  weight: number;
}> = (() => {
  const rolls: { dice: [number, number]; weight: number }[] = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      rolls.push({ dice: [a, b], weight: a === b ? 1 : 2 });
    }
  }
  return rolls;
})();

/** Bar entry target index for a given die. */
export function entryIndex(player: Player, die: number): number {
  return player === "white" ? NUM_POINTS - die : die - 1;
}

/** True if the board index lies within the player's home board. */
export function isInHome(player: Player, index: number): boolean {
  const [lo, hi] = HOME_RANGE[player];
  return index >= lo && index <= hi;
}

/**
 * Distance (in pips) from a board index to bearing off for the player.
 * White at index i needs i + 1 pips; black needs 24 - i.
 */
export function pipsToOff(player: Player, index: number): number {
  return player === "white" ? index + 1 : NUM_POINTS - index;
}

/** Mover-relative point number (1..24) used in standard notation. */
export function relativePoint(player: Player, index: number): number {
  return player === "white" ? index + 1 : NUM_POINTS - index;
}
