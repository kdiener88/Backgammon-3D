import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "../lib/i18n";
import type { EngineStrength } from "../engines/BackgammonEngineAdapter";

export type BoardMode = "2d" | "3d";
export type AnimSpeed = "slow" | "normal" | "fast";

export interface SettingsState {
  boardMode: BoardMode;
  difficulty: EngineStrength;
  soundOn: boolean;
  animSpeed: AnimSpeed;
  matchLength: number;
  /** Fixed dice seed for reproducible games; null = crypto randomness. */
  seed: number | null;
  showHints: boolean;
  cubeEnabled: boolean;
  language: Language;
  reducedMotion: boolean;
  /** Optional URL of an external expert engine (see ExpertEngineAdapter). */
  expertUrl: string;
  set: (partial: Partial<Omit<SettingsState, "set">>) => void;
}

/** URL overrides (?seed=123&mode=2d) power reproducible E2E runs. */
function urlOverrides(): Partial<SettingsState> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const overrides: Partial<SettingsState> = {};
  const seed = params.get("seed");
  if (seed !== null && /^\d+$/.test(seed)) overrides.seed = Number(seed);
  const mode = params.get("mode");
  if (mode === "2d" || mode === "3d") overrides.boardMode = mode;
  const anim = params.get("anim");
  if (anim === "fast") overrides.animSpeed = "fast";
  return overrides;
}

function defaultBoardMode(): BoardMode {
  if (typeof window === "undefined") return "3d";
  // Small screens default to the lighter, clearer 2D board.
  return window.matchMedia("(max-width: 768px)").matches ? "2d" : "3d";
}

function defaultReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      boardMode: defaultBoardMode(),
      difficulty: "intermediate",
      soundOn: true,
      animSpeed: "normal",
      matchLength: 5,
      seed: null,
      showHints: true,
      cubeEnabled: false,
      language: "es",
      reducedMotion: defaultReducedMotion(),
      expertUrl: (import.meta.env?.VITE_EXPERT_ENGINE_URL as string) ?? "",
      set: (partial) => set(partial),
    }),
    {
      name: "backgammon-settings",
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<SettingsState>),
        ...urlOverrides(),
      }),
    },
  ),
);

export const ANIM_MS: Record<AnimSpeed, number> = {
  slow: 700,
  normal: 400,
  fast: 120,
};
