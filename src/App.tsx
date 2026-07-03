import { Suspense, lazy, useEffect } from "react";
import { Board2D } from "./components/board/Board2D";
import { Hud } from "./components/hud/Hud";
import { SettingsPanel } from "./components/panels/SettingsPanel";
import { useGame } from "./store/gameStore";
import { useSettings } from "./store/settingsStore";
import { t } from "./lib/i18n";

// The 3D board (three.js) loads lazily so the 2D experience stays light.
const Board3D = lazy(() =>
  import("./components/board/Board3D").then((m) => ({ default: m.Board3D })),
);

export default function App() {
  const boardMode = useSettings((s) => s.boardMode);
  const lang = useSettings((s) => s.language);
  const started = useGame((s) => s.started);
  const matchWinner = useGame((s) => s.match.matchWinner);
  const status = useGame((s) => s.status);
  const newMatch = useGame((s) => s.newMatch);
  const resumeAiIfNeeded = useGame((s) => s.resumeAiIfNeeded);

  // Resume an AI turn interrupted by a page reload.
  useEffect(() => {
    const timer = setTimeout(resumeAiIfNeeded, 400);
    return () => clearTimeout(timer);
  }, [resumeAiIfNeeded]);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          {t(lang, "appTitle")} <small>· vs IA</small>
        </h1>
        <span className="note" aria-hidden="true">
          {lang === "es"
            ? "Club nocturno de tablero"
            : "After-hours board club"}
        </span>
      </header>

      <main className="app-main">
        <section className="board-area" data-testid="board">
          {boardMode === "3d" ? (
            <Suspense fallback={<Board2D />}>
              <Board3D />
            </Suspense>
          ) : (
            <Board2D />
          )}

          {(!started || matchWinner) && (
            <div className="banner">
              <div className="banner-card">
                <h2>
                  {matchWinner
                    ? t(
                        lang,
                        matchWinner === "white" ? "youWinMatch" : "aiWinsMatch",
                      )
                    : t(lang, "appTitle")}
                </h2>
                {status === "youWinMatch" || status === "aiWinsMatch" ? null : (
                  <p className="note">
                    {lang === "es"
                      ? "Jugá contra la máquina: reglas completas, tres niveles de IA."
                      : "Play the machine: full rules, three AI levels."}
                  </p>
                )}
                <button
                  className="btn btn-primary"
                  onClick={newMatch}
                  data-testid="new-match"
                >
                  {t(lang, "newMatch")}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="side-panel">
          <Hud />
          <SettingsPanel />
        </aside>
      </main>
    </div>
  );
}
