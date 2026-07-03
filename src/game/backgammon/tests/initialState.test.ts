import { describe, expect, it } from "vitest";
import { initialGameState, initialMatchState } from "../initialState";
import { validateGameState } from "../validate";
import { pipCount } from "../pipCount";

describe("initial state", () => {
  it("places the standard starting position", () => {
    const s = initialGameState();
    expect(s.points[23]).toBe(2); // white 24-point
    expect(s.points[12]).toBe(5); // white 13-point
    expect(s.points[7]).toBe(3); // white 8-point
    expect(s.points[5]).toBe(5); // white 6-point
    expect(s.points[0]).toBe(-2);
    expect(s.points[11]).toBe(-5);
    expect(s.points[16]).toBe(-3);
    expect(s.points[18]).toBe(-5);
  });

  it("passes structural validation", () => {
    expect(validateGameState(initialGameState())).toEqual([]);
  });

  it("both players start with 167 pips", () => {
    const s = initialGameState();
    expect(pipCount(s, "white")).toBe(167);
    expect(pipCount(s, "black")).toBe(167);
  });

  it("creates a match with the requested length and empty score", () => {
    const m = initialMatchState(7, true);
    expect(m.matchLength).toBe(7);
    expect(m.score).toEqual({ white: 0, black: 0 });
    expect(m.cubeEnabled).toBe(true);
    expect(m.matchWinner).toBeNull();
  });
});
