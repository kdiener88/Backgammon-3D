import { useMemo } from "react";
import { pipCount } from "../../game/backgammon/pipCount";
import { canOfferDouble } from "../../game/backgammon/rules";
import { currentLegalMoves, opponentOf, useGame } from "../../store/gameStore";
import { useSettings } from "../../store/settingsStore";
import { t } from "../../lib/i18n";

/** Side panel: status, controls, dice, stats, history, AI explanation. */
export function Hud() {
  const match = useGame((s) => s.match);
  const status = useGame((s) => s.status);
  const aiThinking = useGame((s) => s.aiThinking);
  const history = useGame((s) => s.history);
  const lastExplanation = useGame((s) => s.lastExplanation);
  const analysis = useGame((s) => s.analysis);
  const started = useGame((s) => s.started);
  const rollDice = useGame((s) => s.rollDice);
  const undoMove = useGame((s) => s.undoMove);
  const confirmTurn = useGame((s) => s.confirmTurn);
  const resignGame = useGame((s) => s.resignGame);
  const requestHint = useGame((s) => s.requestHint);
  const analyzePosition = useGame((s) => s.analyzePosition);
  const offerDoubleAction = useGame((s) => s.offerDoubleAction);
  const respondDouble = useGame((s) => s.respondDouble);
  const newMatch = useGame((s) => s.newMatch);
  const nextGame = useGame((s) => s.nextGame);
  const humanSide = useGame((s) => s.humanSide);
  const lang = useSettings((s) => s.language);
  const showHints = useSettings((s) => s.showHints);

  const game = match.game;
  const aiSide = opponentOf(humanSide);
  const legal = useMemo(() => {
    void game;
    return currentLegalMoves(useGame.getState());
  }, [game]);

  const isHumanMoving =
    game.phase === "moving" && game.turn === humanSide && !aiThinking;
  const canRoll =
    !aiThinking &&
    !match.matchWinner &&
    started &&
    (game.phase === "openingRoll" ||
      (game.phase === "rolling" && game.turn === humanSide));
  const canConfirm = isHumanMoving && legal.length === 0;
  const canUndo = isHumanMoving && game.turnMoves.length > 0;
  const pipsHuman = pipCount(game, humanSide);
  const pipsAi = pipCount(game, aiSide);

  const statusText = (() => {
    if (aiThinking) return t(lang, "aiThinking");
    if (game.phase === "doubleOffered" && game.cube.offeredBy === aiSide) {
      return `${t(lang, "ai")} ${t(lang, "doubleOffered")} (×${game.cube.value * 2})`;
    }
    switch (status) {
      case "yourTurn":
        return t(lang, "yourTurn");
      case "aiTurn":
        return t(lang, "aiTurn");
      case "danced":
        return t(lang, "danced");
      case "youWinGame":
        return `${t(lang, "youWinGame")} (${t(lang, game.winKind ?? "single")})`;
      case "aiWinsGame":
        return `${t(lang, "aiWinsGame")} (${t(lang, game.winKind ?? "single")})`;
      case "youWinMatch":
        return t(lang, "youWinMatch");
      case "aiWinsMatch":
        return t(lang, "aiWinsMatch");
      default:
        return started ? t(lang, "rollOpening") : t(lang, "newMatch");
    }
  })();

  return (
    <>
      <div
        className={`hud-status ${aiThinking ? "thinking" : ""}`}
        role="status"
        aria-live="polite"
      >
        {statusText}
        {match.isCrawfordGame && (
          <span className="note"> · {t(lang, "crawford")}</span>
        )}
      </div>

      {game.phase === "doubleOffered" && game.cube.offeredBy === aiSide && (
        <div className="panel">
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={() => void respondDouble(true)}
            >
              {t(lang, "take")} (×{game.cube.value * 2})
            </button>
            <button
              className="btn btn-danger"
              onClick={() => void respondDouble(false)}
            >
              {t(lang, "drop")}
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="btn-row">
          {!started || match.matchWinner ? (
            <button className="btn btn-primary" onClick={newMatch}>
              {t(lang, "newMatch")}
            </button>
          ) : game.phase === "gameOver" ? (
            <button className="btn btn-primary" onClick={nextGame}>
              {t(lang, "nextGame")}
            </button>
          ) : (
            <>
              <button
                className="btn btn-primary"
                onClick={rollDice}
                disabled={!canRoll}
                data-testid="roll"
              >
                {game.phase === "openingRoll"
                  ? t(lang, "rollOpening")
                  : t(lang, "roll")}
              </button>
              <button
                className="btn"
                onClick={confirmTurn}
                disabled={!canConfirm}
                data-testid="confirm"
              >
                {t(lang, "confirmTurn")}
              </button>
              <button
                className="btn"
                onClick={undoMove}
                disabled={!canUndo}
                data-testid="undo"
              >
                {t(lang, "undo")}
              </button>
            </>
          )}
        </div>
        {started && !match.matchWinner && game.phase !== "gameOver" && (
          <div className="btn-row" style={{ marginTop: 8 }}>
            {showHints && (
              <button
                className="btn"
                onClick={() => void requestHint()}
                disabled={!isHumanMoving || legal.length === 0}
              >
                {t(lang, "hint")}
              </button>
            )}
            <button
              className="btn"
              onClick={() => void analyzePosition()}
              disabled={!started}
            >
              {t(lang, "analysis")}
            </button>
            {match.cubeEnabled && (
              <button
                className="btn"
                onClick={() => void offerDoubleAction()}
                disabled={!canOfferDouble(match, humanSide) || aiThinking}
              >
                {t(lang, "double")} (×{game.cube.value * 2})
              </button>
            )}
            <button
              className="btn btn-danger"
              onClick={resignGame}
              disabled={aiThinking}
            >
              {t(lang, "resign")}
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>{t(lang, "dice")}</h3>
        <div className="dice-row" data-testid="dice">
          {game.rolled ? (
            <DiceFaces key={`${history.length}-${game.rolled.join("")}`} />
          ) : (
            <span className="note">—</span>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>
          {t(lang, "score")} · {match.matchLength} {t(lang, "points")}
          {match.cubeEnabled
            ? ` · ${t(lang, "cube")}: ×${game.cube.value}`
            : ""}
        </h3>
        <div className="stat-grid">
          <span className="head"></span>
          <span className="head">{t(lang, "you")}</span>
          <span className="head">{t(lang, "ai")}</span>
          <span className="head">{t(lang, "score")}</span>
          <span className="num" data-testid="score-human">
            {match.score[humanSide]}
          </span>
          <span className="num">{match.score[aiSide]}</span>
          <span className="head">{t(lang, "pips")}</span>
          <span className="num" data-testid="pips-human">
            {pipsHuman}
          </span>
          <span className="num">{pipsAi}</span>
          <span className="head">{t(lang, "bar")}</span>
          <span className="num">{game.bar[humanSide]}</span>
          <span className="num">{game.bar[aiSide]}</span>
          <span className="head">{t(lang, "off")}</span>
          <span className="num">{game.off[humanSide]}</span>
          <span className="num">{game.off[aiSide]}</span>
        </div>
      </div>

      {lastExplanation && (
        <div className="panel">
          <h3>{t(lang, "lastAiMove")}</h3>
          <p className="explanation" data-testid="explanation">
            {lastExplanation}
          </p>
        </div>
      )}

      {analysis && (
        <div className="panel">
          <h3>{t(lang, "analysis")}</h3>
          <div
            className="stat-grid"
            style={{ gridTemplateColumns: "1fr auto" }}
          >
            <span>{t(lang, "winChance")}</span>
            <span className="num">
              {Math.round(analysis.winProbability * 100)}%
            </span>
            <span>{t(lang, "equity")}</span>
            <span className="num">{analysis.equity.toFixed(2)}</span>
          </div>
          <p className="note">{t(lang, "analyzeNote")}</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="panel">
          <h3>{t(lang, "history")}</h3>
          <ol className="history-list" data-testid="history">
            {history.map((turn, i) => (
              <li key={i}>
                <span className="who">
                  {turn.player === humanSide ? t(lang, "you") : t(lang, "ai")}
                </span>
                <span>{turn.notation}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

function DiceFaces() {
  const game = useGame((s) => s.match.game);
  if (!game.rolled) return null;
  const [a, b] = game.rolled;
  const faces = a === b ? [a, a, a, a] : [a, b];
  // Remaining dice: count each face still available.
  const remaining = [...game.dice];
  return (
    <>
      {faces.map((face, i) => {
        const idx = remaining.indexOf(face);
        const used = idx === -1;
        if (!used) remaining.splice(idx, 1);
        return (
          <div
            key={i}
            className={`die ${used ? "used" : ""} rolling`}
            aria-label={`dado ${face}`}
          >
            {face}
          </div>
        );
      })}
    </>
  );
}
