import { describe, expect, it } from "vitest";
import { makeState } from "./helpers";
import {
  canBearOff,
  maximalSequences,
  moveKey,
  nextMovesAfterPrefix,
  singleMovesForDie,
} from "../moveGeneration";
import { initialGameState } from "../initialState";
import { diceForRoll } from "../dice";

describe("single moves", () => {
  it("generates the classic 3-1 plays from the start", () => {
    const s = { ...initialGameState(), phase: "moving" as const, dice: [3, 1] };
    const threes = singleMovesForDie(s, "white", 3).map(moveKey);
    // 8/5 for white = index 7 -> 4
    expect(threes).toContain("7>4/3");
    const ones = singleMovesForDie(s, "white", 1).map(moveKey);
    // 6/5 = index 5 -> 4
    expect(ones).toContain("5>4/1");
  });

  it("never moves onto a point held by two or more opponents", () => {
    // Black holds index 4 with 2 checkers; white on index 7 cannot play a 3.
    const s = makeState({
      points: { 7: 1, 5: 5, 4: -2, 12: 5, 23: 4, 0: -13 },
      dice: [3],
    });
    const moves = singleMovesForDie(s, "white", 3).map(moveKey);
    expect(moves).not.toContain("7>4/3");
  });

  it("flags a hit when landing on a lone opposing checker", () => {
    const s = makeState({
      points: { 7: 1, 4: -1, 5: 5, 12: 5, 23: 4, 0: -14 },
      dice: [3],
    });
    const move = singleMovesForDie(s, "white", 3).find(
      (m) => moveKey(m) === "7>4/3",
    );
    expect(move?.hit).toBe(true);
  });

  it("forces entry from the bar before any other move", () => {
    const s = makeState({
      points: { 12: 5, 7: 3, 5: 6, 23: 0, 0: -2, 11: -5, 16: -3, 18: -5 },
      bar: { white: 1 },
      dice: [3, 5],
    });
    // Entry with a 3 goes to index 21; with a 5 to index 19. Both open.
    const threes = singleMovesForDie(s, "white", 3);
    expect(threes).toHaveLength(1);
    expect(threes[0].from).toBe("bar");
    expect(threes[0].to).toBe(21);
  });

  it("dances when every entry point is blocked", () => {
    const s = makeState({
      // Black owns indices 18-23 with 2+ checkers each (closed board).
      points: {
        18: -3,
        19: -2,
        20: -2,
        21: -2,
        22: -2,
        23: -2,
        0: -2,
        12: 5,
        7: 5,
        5: 4,
      },
      bar: { white: 1 },
      dice: [3, 5],
    });
    const seqs = maximalSequences(s);
    expect(seqs).toEqual([[]]);
  });
});

describe("turn sequences", () => {
  it("doubles yield four moves when playable", () => {
    const s = {
      ...initialGameState(),
      phase: "moving" as const,
      dice: diceForRoll([3, 3]),
    };
    const seqs = maximalSequences(s);
    expect(seqs.length).toBeGreaterThan(0);
    for (const seq of seqs) {
      expect(seq).toHaveLength(4);
      for (const m of seq) expect(m.die).toBe(3);
    }
  });

  it("must play both dice when a sequence allows it (no dead-end prefixes)", () => {
    // White: single checkers on 23 and 18. Dice 5,6.
    // 23->18(5) kills the 6 (18->12 blocked, 23->17 blocked).
    // 18->13(5) keeps the 6 alive via 13->7.
    const s = makeState({
      points: {
        23: 1,
        18: 1,
        5: 5,
        4: 5,
        3: 3, // white 15
        17: -2,
        12: -2,
        0: -11, // black 15
      },
      dice: [5, 6],
    });
    const seqs = maximalSequences(s);
    expect(seqs.length).toBeGreaterThan(0);
    for (const seq of seqs) expect(seq).toHaveLength(2);
    const first = nextMovesAfterPrefix(seqs, []).map(moveKey);
    expect(first).toContain("18>13/5");
    expect(first).not.toContain("23>18/5");
  });

  it("plays the higher die when only one die can be used", () => {
    // Single white checker can play 6 (23->17) or 5 (23->18) but never both.
    const s = makeState({
      points: {
        23: 1,
        5: 5,
        4: 5,
        3: 4, // white 15
        12: -2,
        17: 0,
        18: 0,
        0: -13, // black 15
      },
      dice: [5, 6],
    });
    // Block continuations: after 23->17, 5 goes to 12 (blocked); after
    // 23->18, 6 goes to 12 (blocked). Home checkers: 5s from idx 5 -> 0open?
    // Block index 0 with black. Give black 13 on index 0.
    const seqs = maximalSequences(s);
    for (const seq of seqs) {
      expect(seq).toHaveLength(1);
      expect(seq[0].die).toBe(6);
    }
  });

  it("offers every distinct first move of maximal sequences", () => {
    const s = { ...initialGameState(), phase: "moving" as const, dice: [6, 1] };
    const seqs = maximalSequences(s);
    const first = nextMovesAfterPrefix(seqs, []).map(moveKey);
    // 13/7 (12->6) and 24/18 (23->17) are classic 6s.
    expect(first).toContain("12>6/6");
    expect(first).toContain("23>17/6");
  });
});

describe("bearing off", () => {
  it("requires every checker in the home board", () => {
    const s = makeState({
      points: { 6: 1, 5: 4, 4: 5, 3: 5, 0: -15 },
      dice: [6],
    });
    expect(canBearOff(s, "white")).toBe(false);
    const moves = singleMovesForDie(s, "white", 6);
    expect(moves.every((m) => m.to !== "off")).toBe(true);
  });

  it("bears off with the exact die", () => {
    const s = makeState({
      points: { 5: 2, 4: 3, 2: 5, 1: 3, 0: 2, 23: -15 },
      dice: [6],
    });
    expect(canBearOff(s, "white")).toBe(true);
    const moves = singleMovesForDie(s, "white", 6).map(moveKey);
    expect(moves).toContain("5>off/6");
  });

  it("allows overshoot only from the rearmost point", () => {
    const s = makeState({
      points: { 4: 3, 2: 5, 1: 4, 0: 3, 23: -15 },
      dice: [6],
    });
    const moves = singleMovesForDie(s, "white", 6).map(moveKey);
    expect(moves).toContain("4>off/6");
    expect(moves).not.toContain("2>off/6");
  });

  it("forbids overshoot while a farther checker remains", () => {
    const s = makeState({
      points: { 5: 1, 3: 5, 2: 5, 1: 4, 23: -15 },
      dice: [5],
    });
    const moves = singleMovesForDie(s, "white", 5).map(moveKey);
    // Die 5 overshoots from index 3 (pips 4), but index 5 still holds one.
    expect(moves).not.toContain("3>off/5");
    // The rearmost checker can move inside instead: 5 -> 0.
    expect(moves).toContain("5>0/5");
  });

  it("suspends bear-off when a checker is on the bar", () => {
    const s = makeState({
      points: { 5: 2, 4: 3, 2: 5, 1: 4, 23: -15 },
      bar: { white: 1 },
      dice: [6, 2],
    });
    expect(canBearOff(s, "white")).toBe(false);
    const sixes = singleMovesForDie(s, "white", 6);
    // Entry with a 6 targets index 18 (open here).
    expect(sixes.every((m) => m.from === "bar")).toBe(true);
  });

  it("black bears off symmetrically", () => {
    const s = makeState({
      points: { 18: -2, 20: -5, 22: -5, 23: -3, 0: 15 },
      turn: "black",
      dice: [6],
    });
    expect(canBearOff(s, "black")).toBe(true);
    const moves = singleMovesForDie(s, "black", 6).map(moveKey);
    expect(moves).toContain("18>off/6");
  });
});
