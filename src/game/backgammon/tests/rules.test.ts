import { describe, expect, it } from "vitest";
import { makeState } from "./helpers";
import { initialGameState, initialMatchState } from "../initialState";
import { createSeededRoller } from "../dice";
import {
  acceptDouble,
  applyGameResult,
  applyMoveToGame,
  canOfferDouble,
  dropDouble,
  finishTurn,
  gamePoints,
  nextGameIsCrawford,
  offerDouble,
  resign,
  rollOpening,
  rollTurn,
  winKindFor,
} from "../rules";

describe("opening roll", () => {
  it("gives the start to the higher die and plays both dice", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = rollOpening(initialGameState(), createSeededRoller(seed));
      expect(s.openingRoll).not.toBeNull();
      const { white, black } = s.openingRoll!;
      expect(white).not.toBe(black); // ties are re-rolled
      expect(s.turn).toBe(white > black ? "white" : "black");
      expect(s.dice.sort()).toEqual([white, black].sort());
      expect(s.phase).toBe("moving");
    }
  });
});

describe("applying moves", () => {
  it("moves a checker and consumes the die", () => {
    const s = { ...initialGameState(), phase: "moving" as const, dice: [3, 1] };
    const next = applyMoveToGame(s, { from: 7, to: 4, die: 3, hit: false });
    expect(next.points[7]).toBe(2);
    expect(next.points[4]).toBe(1);
    expect(next.dice).toEqual([1]);
    expect(next.turnMoves).toHaveLength(1);
  });

  it("sends a hit checker to the bar", () => {
    const s = makeState({
      points: { 7: 1, 4: -1, 5: 5, 12: 5, 23: 4, 0: -14 },
      dice: [3],
    });
    const next = applyMoveToGame(s, { from: 7, to: 4, die: 3, hit: true });
    expect(next.points[4]).toBe(1);
    expect(next.bar.black).toBe(1);
  });

  it("rejects a move with an unavailable die", () => {
    const s = { ...initialGameState(), phase: "moving" as const, dice: [3, 1] };
    expect(() =>
      applyMoveToGame(s, { from: 7, to: 2, die: 5, hit: false }),
    ).toThrow(/not available/);
  });

  it("rejects moving onto a blocked point", () => {
    const s = makeState({
      points: { 7: 1, 4: -2, 5: 5, 12: 5, 23: 4, 0: -13 },
      dice: [3],
    });
    expect(() =>
      applyMoveToGame(s, { from: 7, to: 4, die: 3, hit: false }),
    ).toThrow(/illegal move/);
  });

  it("rejects moving a checker that is not there", () => {
    const s = { ...initialGameState(), phase: "moving" as const, dice: [3, 1] };
    expect(() =>
      applyMoveToGame(s, { from: 9, to: 6, die: 3, hit: false }),
    ).toThrow(/illegal move/);
  });

  it("rejects a backward or wrong-distance move (engine boundary)", () => {
    const s = makeState({
      points: { 5: 15, 18: -15 },
      dice: [3, 4],
    });
    // Backward: white index 5 -> 8.
    expect(() =>
      applyMoveToGame(s, { from: 5, to: 8, die: 3, hit: false }),
    ).toThrow(/illegal move/);
    // Wrong distance: 5 pips on a die of 3.
    expect(() =>
      applyMoveToGame(s, { from: 5, to: 0, die: 3, hit: false }),
    ).toThrow(/illegal move/);
  });

  it("rejects board moves while a checker waits on the bar", () => {
    const s = makeState({
      points: { 12: 5, 5: 9, 0: -15 },
      bar: { white: 1 },
      dice: [3, 5],
    });
    expect(() =>
      applyMoveToGame(s, { from: 12, to: 9, die: 3, hit: false }),
    ).toThrow(/illegal move/);
  });

  it("rejects bear-off before every checker is home", () => {
    const s = makeState({
      points: { 12: 5, 5: 10, 0: -15 },
      dice: [6, 2],
    });
    expect(() =>
      applyMoveToGame(s, { from: 5, to: "off", die: 6, hit: false }),
    ).toThrow(/illegal move/);
  });

  it("finishes the game when the 15th checker comes off", () => {
    const s = makeState({
      points: { 0: 1, 23: -15 },
      off: { white: 14 },
      dice: [1],
    });
    const next = applyMoveToGame(s, { from: 0, to: "off", die: 1, hit: false });
    expect(next.phase).toBe("gameOver");
    expect(next.winner).toBe("white");
  });
});

describe("turn flow", () => {
  it("hands the dice to the opponent", () => {
    const s = { ...initialGameState(), phase: "moving" as const, dice: [] };
    const next = finishTurn(s);
    expect(next.turn).toBe("black");
    expect(next.phase).toBe("rolling");
    expect(next.dice).toEqual([]);
  });

  it("rollTurn produces 2 dice or 4 on doubles", () => {
    const s = {
      ...initialGameState(),
      phase: "rolling" as const,
      turn: "black" as const,
    };
    for (let seed = 0; seed < 20; seed++) {
      const rolled = rollTurn(s, createSeededRoller(seed));
      const [a, b] = rolled.rolled!;
      expect(rolled.dice).toHaveLength(a === b ? 4 : 2);
    }
  });
});

describe("win classification", () => {
  it("single when the loser has borne off at least one", () => {
    const s = makeState({
      points: { 20: -14 },
      off: { white: 15, black: 1 },
    });
    expect(winKindFor(s, "white")).toBe("single");
  });

  it("gammon when the loser has none off and none in danger", () => {
    const s = makeState({
      points: { 12: -15 },
      off: { white: 15 },
    });
    expect(winKindFor(s, "white")).toBe("gammon");
  });

  it("backgammon when the loser still occupies the winner home board", () => {
    const s = makeState({
      points: { 2: -1, 12: -14 },
      off: { white: 15 },
    });
    expect(winKindFor(s, "white")).toBe("backgammon");
  });

  it("backgammon when the loser has a checker on the bar", () => {
    const s = makeState({
      points: { 12: -14 },
      bar: { black: 1 },
      off: { white: 15 },
    });
    expect(winKindFor(s, "white")).toBe("backgammon");
  });

  it("resignation awards a single game to the opponent", () => {
    const s = initialGameState();
    s.phase = "rolling";
    const next = resign(s, "white");
    expect(next.phase).toBe("gameOver");
    expect(next.winner).toBe("black");
    expect(next.winKind).toBe("single");
  });

  it("resigning cannot dodge a locked-in gammon or backgammon", () => {
    // Black about to be backgammoned: 0 off, checkers inside white's home,
    // white already has 14 checkers borne off.
    const gammonish = makeState({
      points: { 0: 1, 3: -3, 4: -4, 5: -4 },
      bar: { black: 4 },
      off: { white: 14 },
    });
    expect(resign(gammonish, "black").winKind).toBe("backgammon");

    // Winner has fewer than 10 off: concession stays a single game.
    const early = makeState({
      points: { 0: 6, 1: 5, 2: 4, 12: -15 },
      off: { white: 0 },
    });
    expect(resign(early, "black").winKind).toBe("single");
  });

  it("cannot resign a finished game", () => {
    const s = makeState({ points: { 0: 1, 23: -15 }, off: { white: 14 } });
    s.phase = "gameOver";
    s.winner = "white";
    s.winKind = "single";
    expect(() => resign(s, "black")).toThrow(/already over/);
  });
});

describe("doubling cube", () => {
  it("doubles the stake and passes ownership on take", () => {
    const s = {
      ...initialGameState(),
      phase: "rolling" as const,
      turn: "white" as const,
    };
    const offered = offerDouble(s, "white");
    expect(offered.phase).toBe("doubleOffered");
    const taken = acceptDouble(offered);
    expect(taken.cube.value).toBe(2);
    expect(taken.cube.owner).toBe("black");
    expect(taken.phase).toBe("rolling");
  });

  it("drop ends the game at the pre-double value", () => {
    const s = {
      ...initialGameState(),
      phase: "rolling" as const,
      turn: "white" as const,
    };
    const dropped = dropDouble(offerDouble(s, "white"));
    expect(dropped.phase).toBe("gameOver");
    expect(dropped.winner).toBe("white");
    expect(gamePoints(dropped)).toBe(1);
  });

  it("cannot double without owning the cube", () => {
    const match = initialMatchState(7, true);
    match.game.phase = "rolling";
    match.game.turn = "white";
    match.game.cube = { value: 2, owner: "black", offeredBy: null };
    expect(canOfferDouble(match, "white")).toBe(false);
    match.game.cube = { value: 2, owner: "white", offeredBy: null };
    expect(canOfferDouble(match, "white")).toBe(true);
  });

  it("cannot double during the Crawford game", () => {
    const match = initialMatchState(7, true);
    match.game.phase = "rolling";
    match.game.turn = "white";
    match.isCrawfordGame = true;
    expect(canOfferDouble(match, "white")).toBe(false);
  });
});

describe("match scoring", () => {
  it("applies gammon x cube to the score", () => {
    const match = initialMatchState(7, true);
    match.game = makeState({ points: { 12: -15 }, off: { white: 15 } });
    match.game.phase = "gameOver";
    match.game.winner = "white";
    match.game.winKind = "gammon";
    match.game.cube = { value: 2, owner: "white", offeredBy: null };
    const next = applyGameResult(match);
    expect(next.score.white).toBe(4);
    expect(next.matchWinner).toBeNull();
  });

  it("declares the match winner at the match length", () => {
    const match = initialMatchState(3, false);
    match.score = { white: 2, black: 0 };
    match.game = makeState({
      points: { 12: -14 },
      off: { white: 15, black: 1 },
    });
    match.game.phase = "gameOver";
    match.game.winner = "white";
    match.game.winKind = "single";
    const next = applyGameResult(match);
    expect(next.matchWinner).toBe("white");
  });

  it("flags the Crawford game when a player reaches match length - 1", () => {
    const match = initialMatchState(5, true);
    match.score = { white: 4, black: 2 };
    expect(nextGameIsCrawford(match)).toBe(true);
    match.crawfordDone = true;
    expect(nextGameIsCrawford(match)).toBe(false);
  });
});
