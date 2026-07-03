import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { currentLegalMoves, useGame } from "./store/gameStore.ts";
import { useSettings } from "./store/settingsStore.ts";

if (import.meta.env.DEV) {
  // Debug hooks for development and E2E assertions.
  (window as unknown as Record<string, unknown>).__game = useGame;
  (window as unknown as Record<string, unknown>).__settings = useSettings;
  (window as unknown as Record<string, unknown>).__legalMoves = () =>
    currentLegalMoves(useGame.getState());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
