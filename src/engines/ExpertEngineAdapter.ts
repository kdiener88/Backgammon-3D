import type {
  BackgammonEngineAdapter,
  EngineCubeInput,
  EngineCubeResult,
  EngineEvalInput,
  EngineEvalResult,
  EngineMoveInput,
  EngineMoveResult,
} from "./BackgammonEngineAdapter";
import type { Move } from "../game/backgammon/types";

/**
 * Adapter for an external world-class engine (GNU Backgammon or wildbg)
 * exposed over HTTP. GPL engine code is intentionally NOT bundled with this
 * MIT app — see docs/engine-research.md for the licensing rationale and how
 * to stand up a compatible server (e.g. bgweb-api's Docker image, or
 * `gnubg -t` behind a thin wrapper).
 *
 * HTTP contract (JSON):
 *   POST {baseUrl}/api/engine/best-move
 *     body:    { state: GameState, match: EngineMatchContext }
 *     returns: { moves: Move[], evaluation?: number, explanation?: string }
 *   POST {baseUrl}/api/engine/evaluate
 *     body:    { state: GameState, match: EngineMatchContext }
 *     returns: { equity: number, winProbability: number,
 *                breakdown?: Record<string, number> }
 *
 * Configure via VITE_EXPERT_ENGINE_URL at build time or the runtime setting
 * in the app. Every returned move is re-validated by the rules core before
 * being applied, so a faulty server cannot make an illegal play.
 */
export class ExpertEngineAdapter implements BackgammonEngineAdapter {
  readonly id = "expert-remote";
  readonly name = "Motor experto (remoto)";
  readonly strength = "expert" as const;
  readonly supportsCube = true;

  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async initialize(): Promise<void> {
    if (!this.baseUrl) {
      throw new Error("expert engine URL is not configured");
    }
  }

  async chooseMove(input: EngineMoveInput): Promise<EngineMoveResult> {
    const res = await this.post("/api/engine/best-move", {
      state: input.state,
      match: input.match,
    });
    const moves = res.moves;
    if (!Array.isArray(moves) || !moves.every(isMoveShaped)) {
      throw new Error("expert engine returned a malformed move list");
    }
    return {
      moves: moves as Move[],
      explanation:
        typeof res.explanation === "string"
          ? res.explanation
          : "Jugada del motor experto.",
      evaluation:
        typeof res.evaluation === "number" ? res.evaluation : undefined,
    };
  }

  async evaluatePosition(input: EngineEvalInput): Promise<EngineEvalResult> {
    const res = await this.post("/api/engine/evaluate", {
      state: input.state,
      match: input.match,
    });
    if (
      typeof res.equity !== "number" ||
      typeof res.winProbability !== "number"
    ) {
      throw new Error("expert engine returned a malformed evaluation");
    }
    return {
      equity: res.equity,
      winProbability: res.winProbability,
      breakdown:
        res.breakdown && typeof res.breakdown === "object"
          ? (res.breakdown as Record<string, number>)
          : undefined,
    };
  }

  async chooseCubeAction(_input: EngineCubeInput): Promise<EngineCubeResult> {
    // Cube endpoint intentionally unspecified in v1 of the contract.
    throw new Error("cube decisions are not part of the remote contract yet");
  }

  private async post(
    path: string,
    body: unknown,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw new Error(`expert engine responded ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }
}

function isMoveShaped(m: unknown): boolean {
  if (typeof m !== "object" || m === null) return false;
  const move = m as Record<string, unknown>;
  const fromOk =
    move.from === "bar" ||
    (typeof move.from === "number" && move.from >= 0 && move.from < 24);
  const toOk =
    move.to === "off" ||
    (typeof move.to === "number" && move.to >= 0 && move.to < 24);
  const dieOk = typeof move.die === "number" && move.die >= 1 && move.die <= 6;
  return fromOk && toOk && dieOk;
}
