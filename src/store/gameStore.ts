import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  DiceRoller,
  GameRecord,
  GameState,
  MatchState,
  Move,
  Player,
  TurnRecord,
} from "../game/backgammon/types";
import {
  initialGameState,
  initialMatchState,
} from "../game/backgammon/initialState";
import {
  createCryptoRoller,
  createSeededRoller,
} from "../game/backgammon/dice";
import {
  maximalSequences,
  moveKey,
  nextMovesAfterPrefix,
} from "../game/backgammon/moveGeneration";
import {
  acceptDouble,
  applyGameResult,
  applyMoveToGame,
  canOfferDouble,
  dropDouble,
  finishTurn,
  nextGameIsCrawford,
  offerDouble,
  resign,
  rollOpening,
  rollTurn,
} from "../game/backgammon/rules";
import { turnNotation } from "../game/backgammon/notation";
import { validateGameState } from "../game/backgammon/validate";
import { engineClient } from "../engines/engineClient";
import { greedyFallbackMove } from "../engines/BuiltInHeuristicEngine";
import type {
  EngineEvalResult,
  EngineMatchContext,
} from "../engines/BackgammonEngineAdapter";
import { ANIM_MS, useSettings } from "./settingsStore";
import { sounds } from "../lib/sounds";

/**
 * Which color the human plays is decided per match (settings: white, black
 * or random) and lives in the store as `humanSide`. Components must read it
 * from the store instead of assuming white.
 */
export function opponentOf(player: Player): Player {
  return player === "white" ? "black" : "white";
}

// ---------------------------------------------------------------------------
// Dice roller lifecycle (not serializable → lives outside the store; the
// store persists `seed` + `rollsUsed` so a seeded game replays exactly).
// ---------------------------------------------------------------------------
let roller: DiceRoller | null = null;
let rollerSeed: number | null = null;

function countingRoller(base: DiceRoller): DiceRoller {
  return {
    seed: base.seed,
    rollDie() {
      useGame.setState((s) => ({ rollsUsed: s.rollsUsed + 1 }));
      return base.rollDie();
    },
  };
}

function getRoller(seed: number | null, rollsUsed: number): DiceRoller {
  if (roller && rollerSeed === seed) return roller;
  const base = seed === null ? createCryptoRoller() : createSeededRoller(seed);
  // Fast-forward a restored seeded game to its exact dice stream position.
  if (seed !== null) {
    for (let i = 0; i < rollsUsed; i++) base.rollDie();
  }
  rollerSeed = seed;
  roller = countingRoller(base);
  return roller;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type StatusKey =
  | "idle"
  | "yourTurn"
  | "aiTurn"
  | "danced"
  | "youWinGame"
  | "aiWinsGame"
  | "youWinMatch"
  | "aiWinsMatch"
  | "doubleOffered";

export interface GameStore {
  match: MatchState;
  /** Snapshot at the start of the current 'moving' phase (for undo/legality). */
  turnStart: GameState | null;
  history: TurnRecord[];
  gameRecord: GameRecord;
  rollsUsed: number;
  aiThinking: boolean;
  selected: number | "bar" | null;
  lastExplanation: string | null;
  hintMoves: Move[] | null;
  analysis: EngineEvalResult | null;
  status: StatusKey;
  started: boolean;
  /** Color the human plays this match; the AI plays the opposite. */
  humanSide: Player;

  newMatch: () => void;
  nextGame: () => void;
  rollDice: () => void;
  select: (loc: number | "bar" | null) => void;
  moveChecker: (from: number | "bar", to: number | "off") => void;
  undoMove: () => void;
  confirmTurn: () => void;
  resignGame: () => void;
  offerDoubleAction: () => Promise<void>;
  respondDouble: (take: boolean) => Promise<void>;
  requestHint: () => Promise<void>;
  analyzePosition: () => Promise<void>;
  resumeAiIfNeeded: () => void;
}

/** Legal sequences are derived state — recomputed, never persisted. */
let legalSeqsCache: { key: string; seqs: Move[][] } | null = null;

export function legalSequencesFor(turnStart: GameState | null): Move[][] {
  if (!turnStart || turnStart.phase !== "moving") return [[]];
  const key = `${turnStart.points.join(",")}|${turnStart.bar.white},${turnStart.bar.black}|${turnStart.off.white},${turnStart.off.black}|${turnStart.turn}|${turnStart.dice.join(",")}`;
  if (legalSeqsCache?.key === key) return legalSeqsCache.seqs;
  const seqs = maximalSequences(turnStart);
  legalSeqsCache = { key, seqs };
  return seqs;
}

/** Next legal single moves given what has already been played this turn. */
export function currentLegalMoves(store: {
  match: MatchState;
  turnStart: GameState | null;
}): Move[] {
  const { turnStart } = store;
  const game = store.match.game;
  if (!turnStart || game.phase !== "moving") return [];
  return nextMovesAfterPrefix(legalSequencesFor(turnStart), game.turnMoves);
}

function matchContext(match: MatchState): EngineMatchContext {
  return {
    matchLength: match.matchLength,
    score: match.score,
    cubeEnabled: match.cubeEnabled,
    isCrawfordGame: match.isCrawfordGame,
  };
}

function playSound(name: keyof typeof sounds): void {
  if (useSettings.getState().soundOn) sounds[name]();
}

function animDelay(): number {
  const s = useSettings.getState();
  return s.reducedMotion ? 60 : ANIM_MS[s.animSpeed];
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      match: initialMatchState(5, false),
      turnStart: null,
      history: [],
      gameRecord: { seed: null, turns: [], initialTurn: null },
      rollsUsed: 0,
      aiThinking: false,
      selected: null,
      lastExplanation: null,
      hintMoves: null,
      analysis: null,
      status: "idle",
      started: false,
      humanSide: "white",

      newMatch: () => {
        const settings = useSettings.getState();
        roller = null;
        legalSeqsCache = null;
        const humanSide: Player =
          settings.playerColor === "random"
            ? Math.random() < 0.5
              ? "white"
              : "black"
            : settings.playerColor;
        set({
          match: initialMatchState(settings.matchLength, settings.cubeEnabled),
          turnStart: null,
          history: [],
          gameRecord: { seed: settings.seed, turns: [], initialTurn: null },
          rollsUsed: 0,
          aiThinking: false,
          selected: null,
          lastExplanation: null,
          hintMoves: null,
          analysis: null,
          status: "idle",
          started: true,
          humanSide,
        });
      },

      nextGame: () => {
        const { match } = get();
        if (match.matchWinner || match.game.phase !== "gameOver") return;
        const isCrawford = nextGameIsCrawford(match);
        set({
          match: {
            ...match,
            game: initialGameState(),
            isCrawfordGame: isCrawford,
          },
          turnStart: null,
          history: [],
          selected: null,
          hintMoves: null,
          analysis: null,
          status: "idle",
        });
      },

      rollDice: () => {
        const { match, aiThinking, rollsUsed, gameRecord, humanSide } = get();
        const game = match.game;
        if (aiThinking || match.matchWinner) return;

        const dice = getRoller(gameRecord.seed, rollsUsed);
        if (game.phase === "openingRoll") {
          const next = rollOpening(game, dice);
          playSound("roll");
          set({
            match: { ...match, game: next },
            turnStart: next,
            gameRecord: { ...gameRecord, initialTurn: next.turn },
            status: next.turn === humanSide ? "yourTurn" : "aiTurn",
            hintMoves: null,
          });
          if (next.turn !== humanSide) void runAiTurn(set, get);
          return;
        }

        if (game.phase !== "rolling" || game.turn !== humanSide) return;
        const next = rollTurn(game, dice);
        playSound("roll");
        const seqs = maximalSequences(next);
        const canPlay = !(seqs.length === 1 && seqs[0].length === 0);
        set({
          match: { ...match, game: next },
          turnStart: next,
          status: canPlay ? "yourTurn" : "danced",
          hintMoves: null,
          analysis: null,
        });
      },

      select: (loc) => {
        set({ selected: loc });
      },

      moveChecker: (from, to) => {
        const state = get();
        const game = state.match.game;
        if (
          state.aiThinking ||
          game.phase !== "moving" ||
          game.turn !== state.humanSide
        )
          return;
        const legal = currentLegalMoves(state);
        // With doubles both dice give the same (from, to); any match works.
        // With mixed dice prefer the exact single move the user picked.
        const move = legal.find((m) => m.from === from && m.to === to);
        if (!move) return;
        const next = applyMoveToGame(game, move);
        if (import.meta.env.DEV) {
          const errors = validateGameState(next);
          if (errors.length > 0) console.error("invariant violation", errors);
        }
        playSound(move.hit ? "hit" : move.to === "off" ? "bearOff" : "move");
        set({
          match: { ...state.match, game: next },
          selected: null,
          hintMoves: null,
        });
        if (next.phase === "gameOver") {
          finishGame(set, get);
        }
      },

      undoMove: () => {
        const { match, turnStart, aiThinking, humanSide } = get();
        const game = match.game;
        if (
          aiThinking ||
          !turnStart ||
          game.phase !== "moving" ||
          game.turn !== humanSide ||
          game.turnMoves.length === 0
        ) {
          return;
        }
        // Replay the prefix from the turn-start snapshot (pure + cheap).
        let replayed = turnStart;
        for (const move of game.turnMoves.slice(0, -1)) {
          replayed = applyMoveToGame(replayed, move);
        }
        set({
          match: { ...match, game: replayed },
          selected: null,
          hintMoves: null,
        });
      },

      confirmTurn: () => {
        const state = get();
        const game = state.match.game;
        if (
          state.aiThinking ||
          game.phase !== "moving" ||
          game.turn !== state.humanSide
        )
          return;
        if (currentLegalMoves(state).length > 0) return; // dice left to play
        recordTurn(set, get);
        const next = finishTurn(game);
        set({
          match: { ...state.match, game: next },
          turnStart: null,
          selected: null,
          status: "aiTurn",
        });
        void runAiTurn(set, get);
      },

      resignGame: () => {
        const { match, aiThinking, humanSide } = get();
        if (aiThinking || match.game.phase === "gameOver" || match.matchWinner)
          return;
        const next = resign(match.game, humanSide);
        set({ match: { ...match, game: next } });
        finishGame(set, get);
      },

      offerDoubleAction: async () => {
        const state = get();
        if (state.aiThinking) return;
        if (!canOfferDouble(state.match, state.humanSide)) return;
        const offered = offerDouble(state.match.game, state.humanSide);
        set({ match: { ...state.match, game: offered }, aiThinking: true });
        const answer = await engineClient.chooseCubeAction(
          {
            state: offered,
            match: matchContext(state.match),
            question: "respond",
          },
          useSettings.getState().difficulty,
        );
        const current = get();
        if (answer === null || answer.action === "take") {
          const taken = acceptDouble(current.match.game);
          set({
            match: { ...current.match, game: taken },
            aiThinking: false,
            lastExplanation: answer?.reason ?? null,
          });
        } else {
          const dropped = dropDouble(current.match.game);
          set({
            match: { ...current.match, game: dropped },
            aiThinking: false,
            lastExplanation: answer.reason,
          });
          finishGame(set, get);
        }
      },

      respondDouble: async (take) => {
        const state = get();
        const game = state.match.game;
        if (
          game.phase !== "doubleOffered" ||
          game.cube.offeredBy !== opponentOf(state.humanSide)
        )
          return;
        if (take) {
          const taken = acceptDouble(game);
          set({ match: { ...state.match, game: taken }, status: "aiTurn" });
          void runAiTurn(set, get);
        } else {
          const dropped = dropDouble(game);
          set({ match: { ...state.match, game: dropped } });
          finishGame(set, get);
        }
      },

      requestHint: async () => {
        const state = get();
        const game = state.match.game;
        if (
          state.aiThinking ||
          game.phase !== "moving" ||
          game.turn !== state.humanSide
        )
          return;
        if (game.dice.length === 0) return;
        const result = await engineClient.chooseMove(
          { state: game, match: matchContext(state.match), timeLimitMs: 1500 },
          "expert",
        );
        if (get().match.game === game) {
          set({ hintMoves: result.moves.length > 0 ? result.moves : null });
        }
      },

      analyzePosition: async () => {
        const state = get();
        const result = await engineClient.evaluatePosition(
          {
            state: state.match.game,
            match: matchContext(state.match),
          },
          "expert",
        );
        set({ analysis: result });
      },

      resumeAiIfNeeded: () => {
        const { match, aiThinking, started, humanSide } = get();
        if (!started || aiThinking || match.matchWinner) return;
        const game = match.game;
        const aiSide = opponentOf(humanSide);
        const aiPending =
          (game.phase === "rolling" && game.turn === aiSide) ||
          (game.phase === "moving" && game.turn === aiSide);
        if (aiPending) void runAiTurn(set, get);
      },
    }),
    {
      name: "backgammon-game",
      partialize: (state) => ({
        match: state.match,
        turnStart: state.turnStart,
        history: state.history,
        gameRecord: state.gameRecord,
        rollsUsed: state.rollsUsed,
        lastExplanation: state.lastExplanation,
        status: state.status,
        started: state.started,
        humanSide: state.humanSide,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // An AI turn interrupted by a reload resumes from the App effect
        // via resumeAiIfNeeded(); derived caches rebuild lazily.
        legalSeqsCache = null;
        roller = null;
      },
    },
  ),
);

type Set = (
  partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>),
) => void;
type Get = () => GameStore;

/** Records the finished (or dance) turn into history + the replayable log. */
function recordTurn(set: Set, get: Get): void {
  const { match, history, gameRecord } = get();
  const game = match.game;
  if (!game.rolled) return;
  const record: TurnRecord = {
    player: game.turn,
    roll: game.rolled,
    moves: game.turnMoves,
    notation: turnNotation(game.turn, game.rolled, game.turnMoves),
  };
  set({
    history: [...history, record],
    gameRecord: { ...gameRecord, turns: [...gameRecord.turns, record] },
  });
}

/** Handles a game that just reached 'gameOver': scoring, match state, UI. */
function finishGame(set: Set, get: Get): void {
  recordTurn(set, get);
  const { match, humanSide } = get();
  const applied = applyGameResult(match);
  const humanWon = applied.game.winner === humanSide;
  playSound(humanWon ? "win" : "lose");
  const status: StatusKey = applied.matchWinner
    ? humanWon
      ? "youWinMatch"
      : "aiWinsMatch"
    : humanWon
      ? "youWinGame"
      : "aiWinsGame";
  set({
    match: applied,
    status,
    turnStart: null,
    selected: null,
    aiThinking: false,
  });
}

/**
 * Full AI turn: optional cube decision, roll, think in the worker, then
 * animate the chosen sequence move by move. Every engine move is validated
 * against the legal-sequence list before touching the board.
 */
async function runAiTurn(set: Set, get: Get): Promise<void> {
  const initial = get();
  if (initial.aiThinking || initial.match.matchWinner) return;
  let { match } = initial;
  let game = match.game;
  const aiSide = opponentOf(initial.humanSide);
  if (game.turn !== aiSide) return;

  set({ aiThinking: true, status: "aiTurn", selected: null, hintMoves: null });
  try {
    // 1. Cube decision (only from a fresh 'rolling' phase).
    if (game.phase === "rolling" && canOfferDouble(match, aiSide)) {
      const cube = await engineClient.chooseCubeAction(
        { state: game, match: matchContext(match), question: "offer" },
        useSettings.getState().difficulty,
      );
      if (cube?.action === "double") {
        const offered = offerDouble(game, aiSide);
        set({
          match: { ...get().match, game: offered },
          aiThinking: false,
          status: "doubleOffered",
          lastExplanation: cube.reason,
        });
        return; // wait for the human's take/drop
      }
    }

    // 2. Roll (unless the opening roll already provided dice).
    if (game.phase === "rolling") {
      await sleep(animDelay());
      const dice = getRoller(get().gameRecord.seed, get().rollsUsed);
      game = rollTurn(game, dice);
      playSound("roll");
      match = { ...get().match, game };
      set({ match, turnStart: game });
    }

    if (game.phase !== "moving") {
      set({ aiThinking: false });
      return;
    }

    // 3. Think.
    const settings = useSettings.getState();
    const legal = legalSequencesFor(game);
    const legalKeys = new Set(legal.map((seq) => seq.map(moveKey).join(" ")));
    let result = await engineClient.chooseMove(
      { state: game, match: matchContext(match) },
      settings.difficulty,
      settings.difficulty === "expert" && settings.expertUrl
        ? settings.expertUrl
        : undefined,
    );
    // 4. Validate the engine's intention against the rules core.
    if (!legalKeys.has(result.moves.map(moveKey).join(" "))) {
      result = greedyFallbackMove(game);
    }

    // 5. Animate the sequence.
    for (const move of result.moves) {
      await sleep(animDelay());
      const current = get();
      game = applyMoveToGame(current.match.game, move);
      playSound(move.hit ? "hit" : move.to === "off" ? "bearOff" : "move");
      set({ match: { ...current.match, game } });
    }
    set({ lastExplanation: result.explanation });

    await sleep(animDelay());
    if (game.phase === "gameOver") {
      finishGame(set, get);
      return;
    }

    // 6. Hand the turn back.
    recordTurn(set, get);
    const next = finishTurn(game);
    set({
      match: { ...get().match, game: next },
      turnStart: null,
      aiThinking: false,
      status: "yourTurn",
    });
  } catch (err) {
    // Never leave the game wedged: release the lock and surface the turn.
    console.error("AI turn failed", err);
    set({ aiThinking: false });
  }
}
