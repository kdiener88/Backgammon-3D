import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  maximalSequences,
  moveKey,
  nextMovesAfterPrefix,
  singleMovesForDie,
} from "../moveGeneration";
import { applyMoveToGame } from "../rules";
import { validateGameState } from "../validate";
import { midGamePosition } from "./helpers";

describe("property-based invariants", () => {
  it("every legal single move keeps the state valid", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 0, max: 40 }),
        (seed, plies) => {
          const state = midGamePosition(seed, plies);
          if (state.phase !== "moving") return true;
          const seqs = maximalSequences(state);
          for (const move of nextMovesAfterPrefix(seqs, [])) {
            const next = applyMoveToGame(state, move);
            const errors = validateGameState(next);
            expect(
              errors,
              `seed=${seed} plies=${plies} ${moveKey(move)}`,
            ).toEqual([]);
          }
          return true;
        },
      ),
      { numRuns: 40 },
    );
  });

  it("offered single moves are a subset of raw die moves", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 0, max: 40 }),
        (seed, plies) => {
          const state = midGamePosition(seed, plies);
          if (state.phase !== "moving") return true;
          const raw = new Set(
            state.dice.flatMap((d) =>
              singleMovesForDie(state, state.turn, d).map(moveKey),
            ),
          );
          const offered = nextMovesAfterPrefix(maximalSequences(state), []);
          for (const move of offered) {
            expect(raw.has(moveKey(move))).toBe(true);
          }
          return true;
        },
      ),
      { numRuns: 40 },
    );
  });

  it("no point ever holds checkers of both players (signed encoding) and totals hold", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 0, max: 60 }),
        (seed, plies) => {
          const state = midGamePosition(seed, plies);
          // The signed representation makes mixed points unrepresentable;
          // validate the checker-count invariant instead.
          expect(validateGameState(state)).toEqual([]);
          return true;
        },
      ),
      { numRuns: 60 },
    );
  });
});
