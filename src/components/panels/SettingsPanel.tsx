import { MATCH_LENGTHS } from "../../game/backgammon/constants";
import { useGame } from "../../store/gameStore";
import { useSettings } from "../../store/settingsStore";
import { t } from "../../lib/i18n";

/** Quick settings: board mode, difficulty, sound, speed, match options. */
export function SettingsPanel() {
  const s = useSettings();
  const gameRecord = useGame((g) => g.gameRecord);
  const lang = s.language;

  function exportGame() {
    const blob = new Blob([JSON.stringify(gameRecord, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backgammon-game.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel">
      <h3>{t(lang, "settings")}</h3>
      <div className="settings-grid">
        <label>
          {t(lang, "board3d")} / {t(lang, "board2d")}
          <span
            className="mode-toggle"
            role="group"
            aria-label="Modo de tablero"
          >
            <button
              className={s.boardMode === "3d" ? "active" : ""}
              onClick={() => s.set({ boardMode: "3d" })}
              aria-pressed={s.boardMode === "3d"}
            >
              3D
            </button>
            <button
              className={s.boardMode === "2d" ? "active" : ""}
              onClick={() => s.set({ boardMode: "2d" })}
              aria-pressed={s.boardMode === "2d"}
              data-testid="mode-2d"
            >
              2D
            </button>
          </span>
        </label>

        <label>
          {t(lang, "difficulty")}
          <select
            value={s.difficulty}
            onChange={(e) =>
              s.set({ difficulty: e.target.value as typeof s.difficulty })
            }
            data-testid="difficulty"
          >
            <option value="beginner">{t(lang, "beginner")}</option>
            <option value="intermediate">{t(lang, "intermediate")}</option>
            <option value="expert">{t(lang, "expert")}</option>
          </select>
        </label>

        <label>
          {t(lang, "playAs")}
          <select
            value={s.playerColor}
            onChange={(e) =>
              s.set({ playerColor: e.target.value as typeof s.playerColor })
            }
            data-testid="player-color"
          >
            <option value="white">{t(lang, "whites")}</option>
            <option value="black">{t(lang, "blacks")}</option>
            <option value="random">{t(lang, "randomColor")}</option>
          </select>
        </label>

        <label>
          {t(lang, "matchLength")}
          <select
            value={s.matchLength}
            onChange={(e) => s.set({ matchLength: Number(e.target.value) })}
          >
            {MATCH_LENGTHS.map((n) => (
              <option key={n} value={n}>
                {n} {t(lang, "points")}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t(lang, "animSpeed")}
          <select
            value={s.animSpeed}
            onChange={(e) =>
              s.set({ animSpeed: e.target.value as typeof s.animSpeed })
            }
          >
            <option value="slow">{t(lang, "slow")}</option>
            <option value="normal">{t(lang, "normal")}</option>
            <option value="fast">{t(lang, "fast")}</option>
          </select>
        </label>

        <label>
          {t(lang, "sound")}
          <input
            type="checkbox"
            checked={s.soundOn}
            onChange={(e) => s.set({ soundOn: e.target.checked })}
          />
        </label>

        <label>
          {t(lang, "showHints")}
          <input
            type="checkbox"
            checked={s.showHints}
            onChange={(e) => s.set({ showHints: e.target.checked })}
          />
        </label>

        <label>
          {t(lang, "cube")}
          <input
            type="checkbox"
            checked={s.cubeEnabled}
            onChange={(e) => s.set({ cubeEnabled: e.target.checked })}
          />
        </label>

        <label>
          {t(lang, "reduceMotion")}
          <input
            type="checkbox"
            checked={s.reducedMotion}
            onChange={(e) => s.set({ reducedMotion: e.target.checked })}
          />
        </label>

        <label>
          {t(lang, "seeded")}
          <input
            type="number"
            min={0}
            placeholder="—"
            value={s.seed ?? ""}
            onChange={(e) =>
              s.set({
                seed: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>

        <label title="URL de un motor experto externo (GNUbg/wildbg vía HTTP). Ver docs/engine-research.md">
          Motor experto (URL)
          <input
            type="text"
            placeholder="https://…"
            value={s.expertUrl}
            onChange={(e) => s.set({ expertUrl: e.target.value.trim() })}
          />
        </label>

        <label>
          {t(lang, "language")}
          <select
            value={s.language}
            onChange={(e) =>
              s.set({ language: e.target.value as typeof s.language })
            }
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>

        <button className="btn" onClick={exportGame}>
          {t(lang, "exportGame")}
        </button>

        <button
          className="btn"
          onClick={() => {
            void fetch("/api/logout", { method: "POST" }).finally(() => {
              window.location.href = "/login";
            });
          }}
        >
          {lang === "es" ? "Cerrar sesión" : "Log out"}
        </button>
        <p className="note">
          {lang === "es"
            ? "La dificultad se aplica al instante. Color, longitud de partida, cubo y semilla se aplican al iniciar una nueva partida."
            : "Difficulty applies immediately. Color, match length, cube and seed apply when a new match starts."}
        </p>
      </div>
    </div>
  );
}
