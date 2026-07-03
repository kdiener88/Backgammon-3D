import { describe, expect, it } from "vitest";
import {
  BuiltInHeuristicEngine,
  greedyFallbackMove,
} from "../../../engines/BuiltInHeuristicEngine";
import type { EngineMatchContext } from "../../../engines/BackgammonEngineAdapter";
import { createSeededRoller } from "../dice";
import { isLegalSequence, midGamePosition } from "./helpers";

const MATCH: EngineMatchContext = {
  matchLength: 1,
  score: { white: 0, black: 0 },
  cubeEnabled: false,
  isCrawfordGame: false,
};

describe("engine legality", () => {
  it("the AI never returns an illegal sequence across 100 random positions", async () => {
    // Deterministic pseudo-random engine so failures are reproducible.
    const rng = (() => {
      const roller = createSeededRoller(999);
      return () => (roller.rollDie() - 1) / 6; // deterministic 0..~0.83
    })();
    const engines = [
      new BuiltInHeuristicEngine("beginner", { rng }),
      new BuiltInHeuristicEngine("intermediate", {
        lookaheadCandidates: 2,
        rng,
      }),
    ];
    for (let i = 0; i < 100; i++) {
      const state = midGamePosition(1000 + i, 3 + (i % 20));
      if (state.phase !== "moving") continue;
      const engine = engines[i % engines.length];
      const result = await engine.chooseMove({
        state,
        match: MATCH,
        timeLimitMs: 60,
      });
      expect(
        isLegalSequence(state, result.moves),
        `seed ${1000 + i}: ${JSON.stringify(result.moves)}`,
      ).toBe(true);
    }
  }, 60000);

  it("the greedy fallback is always legal too", () => {
    for (let i = 0; i < 50; i++) {
      const state = midGamePosition(5000 + i, 5 + (i % 15));
      if (state.phase !== "moving") continue;
      const result = greedyFallbackMove(state);
      expect(isLegalSequence(state, result.moves)).toBe(true);
    }
  });

  it("produces an explanation for every move", async () => {
    const engine = new BuiltInHeuristicEngine("intermediate");
    const state = midGamePosition(31, 6);
    const result = await engine.chooseMove({
      state,
      match: MATCH,
      timeLimitMs: 100,
    });
    expect(result.explanation.length).toBeGreaterThan(3);
  });

  it("evaluatePosition returns a sane probability", async () => {
    const engine = new BuiltInHeuristicEngine("expert");
    const state = midGamePosition(77, 8);
    const evalResult = await engine.evaluatePosition!({ state, match: MATCH });
    expect(evalResult.winProbability).toBeGreaterThan(0);
    expect(evalResult.winProbability).toBeLessThan(1);
    expect(Math.abs(evalResult.equity)).toBeLessThanOrEqual(1);
  });

  it("cube heuristics answer both questions", async () => {
    const engine = new BuiltInHeuristicEngine("expert");
    const state = midGamePosition(11, 4);
    const offer = await engine.chooseCubeAction!({
      state,
      match: MATCH,
      question: "offer",
    });
    expect(["double", "no-double"]).toContain(offer.action);
    const response = await engine.chooseCubeAction!({
      state,
      match: MATCH,
      question: "respond",
    });
    expect(["take", "drop"]).toContain(response.action);
  });
});
