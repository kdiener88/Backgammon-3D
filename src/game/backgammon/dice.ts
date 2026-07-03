import type { DiceRoller } from "./types";

/**
 * Cryptographically random roller for normal play.
 * Uses rejection sampling so all six faces are exactly equiprobable.
 */
export function createCryptoRoller(): DiceRoller {
  const buf = new Uint8Array(1);
  return {
    seed: null,
    rollDie(): number {
      // Reject values >= 252 so 252 = 6 * 42 buckets stay uniform.
      let v: number;
      do {
        crypto.getRandomValues(buf);
        v = buf[0];
      } while (v >= 252);
      return (v % 6) + 1;
    },
  };
}

/**
 * Deterministic roller (mulberry32) for reproducible games, debugging and
 * end-to-end tests. Never used by the AI to pick outcomes — the engine only
 * ever sees dice that were already rolled.
 */
export function createSeededRoller(seed: number): DiceRoller {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    rollDie(): number {
      return Math.floor(next() * 6) + 1;
    },
  };
}

/** Expands a roll into the die values available to play (doubles → 4). */
export function diceForRoll(roll: [number, number]): number[] {
  return roll[0] === roll[1]
    ? [roll[0], roll[0], roll[0], roll[0]]
    : [roll[0], roll[1]];
}
