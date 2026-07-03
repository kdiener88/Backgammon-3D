import { describe, expect, it } from "vitest";
import { playSeededGame } from "./helpers";
import { validateGameState } from "../validate";

describe("self-play", () => {
  it("50 seeded games finish with valid states throughout", () => {
    let finished = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const { states, finished: done, turns } = playSeededGame(seed);
      expect(turns).toBeLessThan(500); // no infinite games
      for (const state of states) {
        const errors = validateGameState(state);
        expect(errors, `seed ${seed}`).toEqual([]);
      }
      if (done) finished++;
      const last = states[states.length - 1];
      if (done) {
        expect(last.winner).not.toBeNull();
        expect(last.off[last.winner!]).toBe(15);
        expect(["single", "gammon", "backgammon"]).toContain(last.winKind);
      }
    }
    // Greedy vs greedy games always race to completion.
    expect(finished).toBe(50);
  }, 120000);
});
