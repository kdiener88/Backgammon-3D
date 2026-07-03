import type {
  BackgammonEngineAdapter,
  EngineCubeInput,
  EngineCubeResult,
  EngineEvalInput,
  EngineEvalResult,
  EngineMoveInput,
  EngineMoveResult,
  EngineStrength,
} from "./BackgammonEngineAdapter";
import type { GameState, Move, Player } from "../game/backgammon/types";
import { DISTINCT_ROLLS, OPPONENT } from "../game/backgammon/constants";
import { distinctPlays } from "../game/backgammon/moveGeneration";
import { diceForRoll } from "../game/backgammon/dice";
import {
  type BoardLike,
  describePlay,
  equityFromScore,
  evaluateBoard,
  winProbabilityFromScore,
} from "./evaluation";

interface Candidate {
  moves: Move[];
  board: BoardLike;
  staticScore: number;
  finalScore: number;
}

export interface HeuristicEngineOptions {
  /** Standard deviation (in pips) of noise added to move scores. */
  noise?: number;
  /** Probability of deliberately picking a sub-optimal move. */
  errorRate?: number;
  /** How many top candidates get the 1-ply lookahead. 0 disables it. */
  lookaheadCandidates?: number;
  /** Injectable RNG so tests stay deterministic. */
  rng?: () => number;
}

const PRESETS: Record<
  EngineStrength,
  Required<Omit<HeuristicEngineOptions, "rng">>
> = {
  beginner: { noise: 7, errorRate: 0.2, lookaheadCandidates: 0 },
  intermediate: { noise: 0, errorRate: 0, lookaheadCandidates: 5 },
  expert: { noise: 0, errorRate: 0, lookaheadCandidates: 12 },
};

/**
 * Built-in TypeScript engine. 0-ply: static evaluation of every distinct
 * final position. 1-ply (intermediate/expert): the top candidates are
 * re-scored by the probability-weighted best opponent reply over all 21
 * distinct rolls (expectiminimax depth 1).
 */
export class BuiltInHeuristicEngine implements BackgammonEngineAdapter {
  readonly id: string;
  readonly name: string;
  readonly strength: EngineStrength;
  readonly supportsCube = true;
  private readonly opts: Required<Omit<HeuristicEngineOptions, "rng">>;
  private readonly rng: () => number;

  constructor(strength: EngineStrength, options: HeuristicEngineOptions = {}) {
    this.strength = strength;
    this.id = `builtin-${strength}`;
    this.name = `Motor interno (${strength})`;
    this.opts = { ...PRESETS[strength], ...options };
    this.rng = options.rng ?? Math.random;
  }

  async chooseMove(input: EngineMoveInput): Promise<EngineMoveResult> {
    const { state } = input;
    const player = state.turn;
    const before: BoardLike = {
      points: state.points,
      bar: state.bar,
      off: state.off,
    };

    const plays = distinctPlays(state);
    if (
      plays.length === 0 ||
      (plays.length === 1 && plays[0].moves.length === 0)
    ) {
      return {
        moves: [],
        explanation: describePlay(before, before, player, []),
      };
    }

    const deadline =
      performance.now() + (input.timeLimitMs ?? this.defaultTimeLimit());

    let candidates: Candidate[] = plays.map((p) => {
      const staticScore = evaluateBoard(p.board, player).total;
      return {
        moves: p.moves,
        board: p.board,
        staticScore,
        finalScore: staticScore,
      };
    });
    candidates.sort((a, b) => b.staticScore - a.staticScore);

    if (this.opts.lookaheadCandidates > 0) {
      const top = candidates.slice(0, this.opts.lookaheadCandidates);
      for (const cand of top) {
        if (performance.now() > deadline) break;
        cand.finalScore = this.onePlyScore(cand.board, player, deadline);
      }
      candidates = [...top, ...candidates.slice(this.opts.lookaheadCandidates)];
      candidates.sort((a, b) => b.finalScore - a.finalScore);
    }

    const chosen = this.pickWithNoise(candidates);
    return {
      moves: chosen.moves,
      explanation: describePlay(before, chosen.board, player, chosen.moves),
      evaluation: equityFromScore(chosen.finalScore),
    };
  }

  /**
   * Expected value after the opponent's best reply, averaged over all 21
   * distinct rolls weighted by probability. Score stays from `player`'s
   * perspective: opponent replies minimize it.
   */
  private onePlyScore(
    board: BoardLike,
    player: Player,
    deadline: number,
  ): number {
    const opp = OPPONENT[player];
    let sum = 0;
    let weightDone = 0;
    for (const { dice, weight } of DISTINCT_ROLLS) {
      if (performance.now() > deadline) break;
      const oppState = {
        points: board.points,
        bar: board.bar,
        off: board.off,
        turn: opp,
        dice: diceForRoll(dice),
      };
      const replies = distinctPlays(oppState);
      let best = -Infinity;
      if (
        replies.length === 0 ||
        (replies.length === 1 && replies[0].moves.length === 0)
      ) {
        // Opponent dances: evaluate the unchanged board.
        best = evaluateBoard(board, opp).total;
      } else {
        for (const reply of replies) {
          const s = evaluateBoard(reply.board, opp).total;
          if (s > best) best = s;
        }
      }
      // The opponent's best reply score is our loss (eval is antisymmetric).
      sum += weight * -best;
      weightDone += weight;
    }
    const staticScore = evaluateBoard(board, player).total;
    if (weightDone === 0) return staticScore;
    // Budget ran out mid-way: blend evaluated rolls with the static score
    // for the unevaluated remainder, keeping probability weights intact.
    return (sum + staticScore * (36 - weightDone)) / 36;
  }

  private pickWithNoise(candidates: Candidate[]): Candidate {
    if (this.opts.noise === 0 && this.opts.errorRate === 0)
      return candidates[0];

    if (this.rng() < this.opts.errorRate) {
      const pool = candidates.slice(0, Math.min(4, candidates.length));
      return pool[Math.floor(this.rng() * pool.length)];
    }
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const cand of candidates.slice(0, 8)) {
      const jitter = this.gaussian() * this.opts.noise;
      const s = cand.finalScore + jitter;
      if (s > bestScore) {
        bestScore = s;
        best = cand;
      }
    }
    return best;
  }

  private gaussian(): number {
    // Box–Muller transform.
    const u = Math.max(this.rng(), 1e-9);
    const v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  async evaluatePosition(input: EngineEvalInput): Promise<EngineEvalResult> {
    const { state } = input;
    const breakdown = evaluateBoard(
      { points: state.points, bar: state.bar, off: state.off },
      state.turn,
    );
    return {
      equity: equityFromScore(breakdown.total),
      winProbability: winProbabilityFromScore(breakdown.total),
      breakdown: {
        carrera: breakdown.race,
        estructura: breakdown.structure,
        riesgo: breakdown.blotRisk,
        barra: breakdown.bar,
        fuera: breakdown.off,
        total: breakdown.total,
      },
    };
  }

  async chooseCubeAction(input: EngineCubeInput): Promise<EngineCubeResult> {
    const evalResult = await this.evaluatePosition({
      state: input.state,
      match: input.match,
    });
    const wp = evalResult.winProbability;
    if (input.question === "offer") {
      if (wp >= 0.65 && wp <= 0.85) {
        return { action: "double", reason: "Ventaja clara: dobla." };
      }
      return {
        action: "no-double",
        reason: "La posición no justifica doblar.",
      };
    }
    // Responding to a double: classic 25% take point (cubeless simplification).
    if (wp >= 0.25) {
      return {
        action: "take",
        reason: "Suficientes chances: acepta el doble.",
      };
    }
    return { action: "drop", reason: "Posición muy inferior: abandona." };
  }

  private defaultTimeLimit(): number {
    switch (this.strength) {
      case "beginner":
        return 800;
      case "intermediate":
        return 2000;
      case "expert":
        return 4000;
    }
  }
}

/** Synchronous, zero-noise greedy pick used as the main-thread fallback. */
export function greedyFallbackMove(state: GameState): EngineMoveResult {
  const player = state.turn;
  const before: BoardLike = {
    points: state.points,
    bar: state.bar,
    off: state.off,
  };
  const plays = distinctPlays(state);
  if (
    plays.length === 0 ||
    (plays.length === 1 && plays[0].moves.length === 0)
  ) {
    return { moves: [], explanation: describePlay(before, before, player, []) };
  }
  let best = plays[0];
  let bestScore = -Infinity;
  for (const p of plays) {
    const s = evaluateBoard(p.board, player).total;
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return {
    moves: best.moves,
    explanation: describePlay(before, best.board, player, best.moves),
    evaluation: equityFromScore(bestScore),
  };
}
