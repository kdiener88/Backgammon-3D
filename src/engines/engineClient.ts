import type {
  EngineCubeInput,
  EngineCubeResult,
  EngineEvalInput,
  EngineEvalResult,
  EngineMoveInput,
  EngineMoveResult,
  EngineStrength,
} from "./BackgammonEngineAdapter";
import type { EngineRequest, EngineResponse } from "./worker/engine.worker";
import { greedyFallbackMove } from "./BuiltInHeuristicEngine";

/** Wall-clock budget per request before the main-thread fallback kicks in. */
const TIMEOUT_MS: Record<EngineStrength, number> = {
  beginner: 3000,
  intermediate: 5000,
  expert: 10000,
};

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Main-thread facade over the engine worker. Guarantees an answer: on
 * worker failure or timeout, a synchronous greedy engine picks a legal move
 * so the game can never stall.
 */
export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker | null {
    if (typeof Worker === "undefined") return null;
    if (!this.worker) {
      this.worker = new Worker(
        new URL("./worker/engine.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (event: MessageEvent<EngineResponse>) => {
        const res = event.data;
        const entry = this.pending.get(res.id);
        if (!entry) return;
        this.pending.delete(res.id);
        clearTimeout(entry.timer);
        if (res.ok) entry.resolve(res.result);
        else entry.reject(new Error(res.error ?? "engine error"));
      };
      this.worker.onerror = () => {
        for (const [id, entry] of this.pending) {
          clearTimeout(entry.timer);
          entry.reject(new Error("engine worker crashed"));
          this.pending.delete(id);
        }
        this.worker?.terminate();
        this.worker = null;
      };
    }
    return this.worker;
  }

  private request<T>(
    kind: EngineRequest["kind"],
    strength: EngineStrength,
    payload: EngineRequest["payload"],
    expertUrl: string | undefined,
    timeoutMs: number,
  ): Promise<T> {
    const worker = this.ensureWorker();
    if (!worker) return Promise.reject(new Error("workers unavailable"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("engine timeout"));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      const message: EngineRequest = { id, kind, strength, expertUrl, payload };
      worker.postMessage(message);
    });
  }

  async chooseMove(
    input: EngineMoveInput,
    strength: EngineStrength,
    expertUrl?: string,
  ): Promise<EngineMoveResult> {
    try {
      return await this.request<EngineMoveResult>(
        "chooseMove",
        strength,
        input,
        expertUrl,
        TIMEOUT_MS[strength],
      );
    } catch {
      // Timeout, crash or missing Worker support: never leave the game stuck.
      return greedyFallbackMove(input.state);
    }
  }

  async evaluatePosition(
    input: EngineEvalInput,
    strength: EngineStrength,
    expertUrl?: string,
  ): Promise<EngineEvalResult | null> {
    try {
      return await this.request<EngineEvalResult>(
        "evaluate",
        strength,
        input,
        expertUrl,
        TIMEOUT_MS[strength],
      );
    } catch {
      return null;
    }
  }

  async chooseCubeAction(
    input: EngineCubeInput,
    strength: EngineStrength,
  ): Promise<EngineCubeResult | null> {
    try {
      return await this.request<EngineCubeResult>(
        "cube",
        strength,
        input,
        undefined,
        TIMEOUT_MS[strength],
      );
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("client disposed"));
    }
    this.pending.clear();
  }
}

export const engineClient = new EngineClient();
