import { describe, expect, it } from "vitest";
import { initialMatchState } from "../initialState";
import {
  deserializeMatch,
  positionKey,
  serializeMatch,
} from "../serialization";
import { midGamePosition } from "./helpers";

describe("serialization", () => {
  it("round-trips a match state", () => {
    const match = initialMatchState(5, true);
    match.game = midGamePosition(7, 10);
    const restored = deserializeMatch(serializeMatch(match));
    expect(restored).toEqual(match);
  });

  it("returns null for garbage", () => {
    expect(deserializeMatch("not json")).toBeNull();
    expect(deserializeMatch("{}")).toBeNull();
    expect(deserializeMatch('{"version":99,"match":{}}')).toBeNull();
  });

  it("returns null for a corrupted board", () => {
    const match = initialMatchState(5, true);
    match.game.points[3] = 99; // impossible checker count
    expect(deserializeMatch(serializeMatch(match))).toBeNull();
  });

  it("position keys distinguish dice and turn", () => {
    const match = initialMatchState(1, false);
    const a = positionKey({ ...match.game, dice: [3, 1] });
    const b = positionKey({ ...match.game, dice: [1, 3] });
    const c = positionKey({ ...match.game, dice: [3, 2] });
    const d = positionKey({ ...match.game, dice: [3, 1], turn: "black" });
    expect(a).toBe(b); // order-insensitive
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });
});
