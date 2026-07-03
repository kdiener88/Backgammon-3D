import { describe, expect, it } from "vitest";
import { createCryptoRoller, createSeededRoller, diceForRoll } from "../dice";

describe("dice", () => {
  it("crypto roller stays within 1..6", () => {
    const roller = createCryptoRoller();
    for (let i = 0; i < 1000; i++) {
      const d = roller.rollDie();
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    }
  });

  it("seeded roller is deterministic", () => {
    const a = createSeededRoller(42);
    const b = createSeededRoller(42);
    const seqA = Array.from({ length: 50 }, () => a.rollDie());
    const seqB = Array.from({ length: 50 }, () => b.rollDie());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = createSeededRoller(1);
    const b = createSeededRoller(2);
    const seqA = Array.from({ length: 20 }, () => a.rollDie());
    const seqB = Array.from({ length: 20 }, () => b.rollDie());
    expect(seqA).not.toEqual(seqB);
  });

  it("expands doubles into four moves", () => {
    expect(diceForRoll([3, 3])).toEqual([3, 3, 3, 3]);
    expect(diceForRoll([6, 1])).toEqual([6, 1]);
  });
});
