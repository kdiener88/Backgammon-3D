import { describe, expect, it } from "vitest";
import { moveNotation, turnNotation } from "../notation";

describe("notation", () => {
  it("renders white moves in white numbering", () => {
    expect(moveNotation("white", { from: 7, to: 4, die: 3, hit: false })).toBe(
      "8/5",
    );
  });

  it("renders black moves in black numbering", () => {
    // Black index 18 is black's 6-point; index 22 is black's 2-point.
    expect(
      moveNotation("black", { from: 18, to: 22, die: 4, hit: false }),
    ).toBe("6/2");
  });

  it("marks hits with an asterisk", () => {
    expect(moveNotation("white", { from: 7, to: 4, die: 3, hit: true })).toBe(
      "8/5*",
    );
  });

  it("renders bar entries and bear-offs", () => {
    expect(
      moveNotation("white", { from: "bar", to: 21, die: 3, hit: false }),
    ).toBe("bar/22");
    expect(
      moveNotation("white", { from: 3, to: "off", die: 4, hit: false }),
    ).toBe("4/off");
  });

  it("collapses repeated moves on doubles", () => {
    const text = turnNotation(
      "white",
      [4, 4],
      [
        { from: 12, to: 8, die: 4, hit: false },
        { from: 12, to: 8, die: 4, hit: false },
        { from: 8, to: 4, die: 4, hit: false },
        { from: 8, to: 4, die: 4, hit: false },
      ],
    );
    expect(text).toBe("44: 13/9(2) 9/5(2)");
  });

  it("reports a dance", () => {
    expect(turnNotation("white", [6, 6], [])).toBe("66: (no play)");
  });
});
