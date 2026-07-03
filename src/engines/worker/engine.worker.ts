/// <reference lib="webworker" />
/**
 * Engine host worker: keeps AI computation off the main thread so the UI
 * never janks while the machine "thinks". One instance serves every
 * difficulty; results are memoized by position + dice + player.
 */
import type {
  BackgammonEngineAdapter,
  EngineCubeInput,
  EngineEvalInput,
  EngineMoveInput,
  EngineStrength,
} from "../BackgammonEngineAdapter";
import { BuiltInHeuristicEngine } from "../BuiltInHeuristicEngine";
import { ExpertEngineAdapter } from "../ExpertEngineAdapter";
import { positionKey } from "../../game/backgammon/serialization";

export interface EngineRequest {
  id: number;
  kind: "chooseMove" | "evaluate" | "cube";
  strength: EngineStrength;
  /** Set to use the remote expert adapter instead of the built-in engine. */
  expertUrl?: string;
  payload: EngineMoveInput | EngineEvalInput | EngineCubeInput;
}

export interface EngineResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

const builtIn: Record<EngineStrength, BackgammonEngineAdapter> = {
  beginner: new BuiltInHeuristicEngine("beginner"),
  intermediate: new BuiltInHeuristicEngine("intermediate"),
  expert: new BuiltInHeuristicEngine("expert"),
};

let remoteExpert: ExpertEngineAdapter | null = null;
let remoteExpertUrl = "";

function engineFor(req: EngineRequest): BackgammonEngineAdapter {
  if (req.strength === "expert" && req.expertUrl) {
    if (!remoteExpert || remoteExpertUrl !== req.expertUrl) {
      remoteExpert = new ExpertEngineAdapter(req.expertUrl);
      remoteExpertUrl = req.expertUrl;
    }
    return remoteExpert;
  }
  return builtIn[req.strength];
}

const MAX_CACHE = 2000;
const moveCache = new Map<string, unknown>();

function cacheKey(req: EngineRequest): string | null {
  if (req.kind !== "chooseMove") return null;
  const input = req.payload as EngineMoveInput;
  // Beginner is intentionally noisy — caching would freeze its mistakes.
  if (req.strength === "beginner") return null;
  return `${req.strength}|${req.expertUrl ?? ""}|${positionKey(input.state)}`;
}

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const req = event.data;
  const respond = (msg: EngineResponse) => {
    (self as unknown as Worker).postMessage(msg);
  };
  try {
    const key = cacheKey(req);
    if (key && moveCache.has(key)) {
      respond({ id: req.id, ok: true, result: moveCache.get(key) });
      return;
    }

    const engine = engineFor(req);
    let result: unknown;
    switch (req.kind) {
      case "chooseMove":
        result = await engine.chooseMove(req.payload as EngineMoveInput);
        break;
      case "evaluate":
        if (!engine.evaluatePosition) throw new Error("evaluate not supported");
        result = await engine.evaluatePosition(req.payload as EngineEvalInput);
        break;
      case "cube":
        if (!engine.chooseCubeAction) throw new Error("cube not supported");
        result = await engine.chooseCubeAction(req.payload as EngineCubeInput);
        break;
    }

    if (key) {
      if (moveCache.size >= MAX_CACHE) {
        const oldest = moveCache.keys().next().value;
        if (oldest !== undefined) moveCache.delete(oldest);
      }
      moveCache.set(key, result);
    }
    respond({ id: req.id, ok: true, result });
  } catch (err) {
    respond({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
