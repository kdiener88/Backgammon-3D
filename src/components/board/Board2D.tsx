import { useEffect, useMemo, useRef, useState } from "react";
import type { Move, Player } from "../../game/backgammon/types";
import { relativePoint } from "../../game/backgammon/constants";
import { ownCount } from "../../game/backgammon/moveGeneration";
import { HUMAN, currentLegalMoves, useGame } from "../../store/gameStore";
import { useSettings } from "../../store/settingsStore";
import { t } from "../../lib/i18n";
import {
  BAR_W,
  BAR_X,
  CHECKER_R,
  COL_W,
  TRAY_X,
  VIEW_H,
  VIEW_W,
  barPos,
  checkerPos,
  hitTest,
  isTopRow,
  locCoords,
  pointCenterX,
  trayRect,
} from "./geometry";

interface Flight {
  key: number;
  player: Player;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** Premium 2D SVG board: click-to-move, drag-to-move, hints, ARIA. */
export function Board2D() {
  const game = useGame((s) => s.match.game);
  const selected = useGame((s) => s.selected);
  const hintMoves = useGame((s) => s.hintMoves);
  const aiThinking = useGame((s) => s.aiThinking);
  const select = useGame((s) => s.select);
  const moveChecker = useGame((s) => s.moveChecker);
  const lang = useSettings((s) => s.language);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{
    from: number | "bar";
    x: number;
    y: number;
  } | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const prevMovesRef = useRef(0);
  const flightKey = useRef(0);

  const legal = useMemo(() => {
    void game; // legal moves change exactly when the game state object does
    return currentLegalMoves(useGame.getState());
  }, [game]);
  const humanCanAct =
    game.phase === "moving" && game.turn === HUMAN && !aiThinking;

  const sources = useMemo(() => {
    const set = new Set<number | "bar">();
    if (humanCanAct) for (const m of legal) set.add(m.from);
    return set;
  }, [legal, humanCanAct]);

  const destinations = useMemo(() => {
    const set = new Set<number | "off">();
    if (selected !== null) {
      for (const m of legal) if (m.from === selected) set.add(m.to);
    }
    return set;
  }, [legal, selected]);

  const hint = useMemo(() => {
    if (!hintMoves || hintMoves.length === 0) return null;
    return hintMoves[0];
  }, [hintMoves]);

  // Checker flight animation: fires whenever a move lands on the board.
  useEffect(() => {
    const count = game.turnMoves.length;
    if (count > prevMovesRef.current && count > 0) {
      const move: Move = game.turnMoves[count - 1];
      const player = game.turn;
      const stackAtTarget =
        move.to === "off"
          ? 0
          : Math.max(ownCount(game.points, player, move.to) - 1, 0);
      const fromPos =
        move.from === "bar"
          ? barPos(player, 0)
          : checkerPos(
              move.from,
              Math.max(ownCount(game.points, player, move.from), 0),
            );
      const toPos = locCoords(move.to, player, stackAtTarget);
      const key = ++flightKey.current;
      setFlights((f) => [...f, { key, player, from: fromPos, to: toPos }]);
      setTimeout(() => {
        setFlights((f) => f.filter((x) => x.key !== key));
      }, 320);
    }
    prevMovesRef.current = count;
  }, [game]);

  function svgPoint(e: { clientX: number; clientY: number }): {
    x: number;
    y: number;
  } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((e.clientY - rect.top) / rect.height) * VIEW_H,
    };
  }

  function tryMove(
    from: number | "bar",
    to: number | "bar" | "off" | null,
  ): boolean {
    if (to === null || to === "bar") return false;
    const match = legal.find((m) => m.from === from && m.to === to);
    if (!match) return false;
    moveChecker(from, to);
    return true;
  }

  function onLocClick(loc: number | "bar" | "off") {
    if (!humanCanAct) return;
    if (selected !== null && loc !== "bar" && tryMove(selected, loc)) return;
    if (loc !== "off" && sources.has(loc)) {
      select(selected === loc ? null : loc);
    } else {
      select(null);
    }
  }

  /**
   * Pointer-down on a checker. Routes through the same move/select logic as
   * point clicks so checkers never swallow a click aimed at their point:
   * with a selection active, clicking a checker on a legal destination
   * (own stack or opposing blot) executes the move.
   */
  function onCheckerPointerDown(
    loc: number | "bar",
    player: Player,
    e: React.PointerEvent,
  ) {
    if (!humanCanAct) return;
    if (
      selected !== null &&
      selected !== loc &&
      loc !== "bar" &&
      tryMove(selected, loc)
    ) {
      select(null);
      return;
    }
    if (player !== HUMAN || !sources.has(loc)) {
      select(null);
      return;
    }
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    select(loc);
    const p = svgPoint(e);
    setDrag({ from: loc, x: p.x, y: p.y });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = svgPoint(e);
    setDrag({ ...drag, x: p.x, y: p.y });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const p = svgPoint(e);
    const target = hitTest(p.x, p.y);
    const moved = target !== drag.from && tryMove(drag.from, target);
    if (moved) select(null);
    setDrag(null);
  }

  const triangles = [];
  for (let i = 0; i < 24; i++) {
    const cx = pointCenterX(i);
    const top = isTopRow(i);
    const baseY = top ? 24 : VIEW_H - 24;
    const apexY = top ? 254 : VIEW_H - 254;
    const half = COL_W / 2 - 6;
    const isDest = destinations.has(i);
    const isHintTarget = hint !== null && hint.to === i;
    const color =
      i % 2 === (top ? 0 : 1) ? "var(--tri-light)" : "var(--tri-dark)";
    const pointNumber = relativePoint(HUMAN, i);
    const white = ownCount(game.points, "white", i);
    const black = ownCount(game.points, "black", i);
    const label =
      `${lang === "es" ? "Punto" : "Point"} ${pointNumber}: ` +
      (white > 0
        ? `${white} ${lang === "es" ? "fichas tuyas" : "of your checkers"}`
        : black > 0
          ? `${black} ${lang === "es" ? "fichas de la máquina" : "machine checkers"}`
          : lang === "es"
            ? "vacío"
            : "empty");
    triangles.push(
      <g
        key={`pt-${i}`}
        className={`point ${isDest ? "point-target" : ""} ${isHintTarget ? "hint-glow" : ""}`}
        role="button"
        aria-label={label}
        tabIndex={humanCanAct && (sources.has(i) || isDest) ? 0 : -1}
        onClick={() => onLocClick(i)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onLocClick(i);
          }
        }}
      >
        <polygon
          className="point-tri"
          points={`${cx - half},${baseY} ${cx + half},${baseY} ${cx},${apexY}`}
          fill={color}
          opacity={0.92}
        />
        {isDest && (
          <circle
            cx={cx}
            cy={top ? 60 : VIEW_H - 60}
            r={10}
            fill="var(--gold-bright)"
            opacity={0.95}
          />
        )}
      </g>,
    );
  }

  const checkers = [];
  for (let i = 0; i < 24; i++) {
    for (const player of ["white", "black"] as Player[]) {
      const count = ownCount(game.points, player, i);
      for (let k = 0; k < Math.min(count, 5); k++) {
        const { x, y } = checkerPos(i, k);
        const topOfStack = k === Math.min(count, 5) - 1;
        const isSel = selected === i && player === HUMAN && topOfStack;
        const isHintSrc =
          hint !== null && hint.from === i && player === HUMAN && topOfStack;
        const isDraggedAway =
          drag?.from === i && player === HUMAN && topOfStack;
        checkers.push(
          <g
            key={`c-${i}-${player}-${k}`}
            className={`checker ${player === HUMAN ? "own" : ""} ${isSel ? "selected" : ""} ${isHintSrc ? "hint-glow" : ""}`}
            opacity={isDraggedAway ? 0.25 : 1}
            onPointerDown={(e) => onCheckerPointerDown(i, player, e)}
          >
            <Checker x={x} y={y} player={player} />
            {topOfStack && count > 5 && (
              <text
                x={x}
                y={y + 5}
                textAnchor="middle"
                fontSize={18}
                fontWeight={700}
                fill={player === "white" ? "#241a10" : "#ece2cd"}
              >
                {count}
              </text>
            )}
          </g>,
        );
      }
    }
  }

  const barCheckers = [];
  for (const player of ["white", "black"] as Player[]) {
    const count = game.bar[player];
    for (let k = 0; k < Math.min(count, 4); k++) {
      const { x, y } = barPos(player, k);
      const topOfStack = k === Math.min(count, 4) - 1;
      const isSel = selected === "bar" && player === HUMAN && topOfStack;
      barCheckers.push(
        <g
          key={`bar-${player}-${k}`}
          className={`checker ${player === HUMAN ? "own" : ""} ${isSel ? "selected" : ""}`}
          opacity={
            drag?.from === "bar" && player === HUMAN && topOfStack ? 0.25 : 1
          }
          onPointerDown={(e) => onCheckerPointerDown("bar", player, e)}
        >
          <Checker x={x} y={y} player={player} />
          {topOfStack && count > 4 && (
            <text
              x={x}
              y={y + 5}
              textAnchor="middle"
              fontSize={18}
              fontWeight={700}
              fill={player === "white" ? "#241a10" : "#ece2cd"}
            >
              {count}
            </text>
          )}
        </g>,
      );
    }
  }

  const whiteTray = trayRect("white");
  const blackTray = trayRect("black");
  const offIsDest = destinations.has("off");

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="application"
      aria-label={lang === "es" ? "Tablero de backgammon" : "Backgammon board"}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setDrag(null)}
    >
      {/* Frame + felt */}
      <rect
        x={0}
        y={0}
        width={VIEW_W}
        height={VIEW_H}
        rx={14}
        fill="var(--wood-dark)"
      />
      <rect
        x={12}
        y={12}
        width={VIEW_W - 24}
        height={VIEW_H - 24}
        rx={10}
        fill="var(--wood)"
      />
      <rect
        x={24}
        y={20}
        width={BAR_X - 24 - 4}
        height={VIEW_H - 40}
        fill="var(--felt)"
      />
      <rect
        x={BAR_X + BAR_W + 4}
        y={20}
        width={TRAY_X - BAR_X - BAR_W - 12}
        height={VIEW_H - 40}
        fill="var(--felt)"
      />
      {/* Bar */}
      <rect
        x={BAR_X}
        y={12}
        width={BAR_W}
        height={VIEW_H - 24}
        fill="var(--wood-light)"
        rx={4}
      />
      <rect
        x={BAR_X}
        y={12}
        width={BAR_W}
        height={VIEW_H - 24}
        fill="url(#woodgrain)"
        opacity={0.35}
        rx={4}
      />
      {/* Off trays */}
      <g
        role="button"
        aria-label={lang === "es" ? "Sacar ficha (bear off)" : "Bear off tray"}
        tabIndex={offIsDest ? 0 : -1}
        className={offIsDest ? "point-target" : ""}
        onClick={() => onLocClick("off")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onLocClick("off");
        }}
      >
        <rect
          className="point-tri"
          x={whiteTray.x}
          y={whiteTray.y}
          width={whiteTray.w}
          height={whiteTray.h}
          rx={6}
          fill={offIsDest ? "var(--felt-light)" : "var(--wood-dark)"}
          stroke={offIsDest ? "var(--gold-bright)" : "#241610"}
          strokeWidth={offIsDest ? 2.5 : 1}
        />
        {Array.from({ length: game.off.white }, (_, k) => (
          <rect
            key={`ow-${k}`}
            x={whiteTray.x + 8}
            y={whiteTray.y + whiteTray.h - 16 - k * 18}
            width={whiteTray.w - 16}
            height={13}
            rx={4}
            fill="var(--checker-white)"
            stroke="var(--checker-white-edge)"
          />
        ))}
      </g>
      <g aria-hidden="true">
        <rect
          x={blackTray.x}
          y={blackTray.y}
          width={blackTray.w}
          height={blackTray.h}
          rx={6}
          fill="var(--wood-dark)"
          stroke="#241610"
        />
        {Array.from({ length: game.off.black }, (_, k) => (
          <rect
            key={`ob-${k}`}
            x={blackTray.x + 8}
            y={blackTray.y + 3 + k * 18}
            width={blackTray.w - 16}
            height={13}
            rx={4}
            fill="var(--checker-black)"
            stroke="var(--checker-black-edge)"
          />
        ))}
      </g>

      <defs>
        <linearGradient id="woodgrain" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a5030" />
          <stop offset="0.5" stopColor="#54351e" />
          <stop offset="1" stopColor="#7a5030" />
        </linearGradient>
        <radialGradient id="checkerWhiteG" cx="0.35" cy="0.3" r="1">
          <stop offset="0" stopColor="#fbf6e8" />
          <stop offset="1" stopColor="#cfc0a0" />
        </radialGradient>
        <radialGradient id="checkerBlackG" cx="0.35" cy="0.3" r="1">
          <stop offset="0" stopColor="#4d3a2b" />
          <stop offset="1" stopColor="#1c1410" />
        </radialGradient>
      </defs>

      {triangles}

      {/* Bar click zone (for entering from the bar) */}
      <rect
        x={BAR_X}
        y={12}
        width={BAR_W}
        height={VIEW_H - 24}
        fill="transparent"
        role="button"
        aria-label={t(lang, "bar")}
        tabIndex={sources.has("bar") ? 0 : -1}
        onClick={() => onLocClick("bar")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onLocClick("bar");
        }}
        style={{ cursor: sources.has("bar") ? "pointer" : "default" }}
      />

      {checkers}
      {barCheckers}

      {/* Flight animation overlay */}
      {flights.map((f) => (
        <FlightChecker key={f.key} flight={f} />
      ))}

      {/* Drag ghost */}
      {drag && (
        <g className="flight" opacity={0.9}>
          <Checker x={drag.x} y={drag.y} player={HUMAN} />
        </g>
      )}

      {/* Point numbers */}
      {Array.from({ length: 24 }, (_, i) => (
        <text
          key={`n-${i}`}
          x={pointCenterX(i)}
          y={isTopRow(i) ? 16 : VIEW_H - 6}
          textAnchor="middle"
          fontSize={11}
          fill="var(--text-muted)"
          aria-hidden="true"
        >
          {relativePoint(HUMAN, i)}
        </text>
      ))}
      <title>{aiThinking ? t(lang, "aiThinking") : ""}</title>
    </svg>
  );
}

function Checker({ x, y, player }: { x: number; y: number; player: Player }) {
  return (
    <>
      <circle
        cx={x}
        cy={y}
        r={CHECKER_R}
        fill={
          player === "white" ? "url(#checkerWhiteG)" : "url(#checkerBlackG)"
        }
        stroke={
          player === "white"
            ? "var(--checker-white-edge)"
            : "var(--checker-black-edge)"
        }
        strokeWidth={2}
      />
      <circle
        cx={x}
        cy={y}
        r={CHECKER_R - 7}
        fill="none"
        stroke={player === "white" ? "#b8a88866" : "#55402f88"}
        strokeWidth={1.5}
      />
    </>
  );
}

function FlightChecker({ flight }: { flight: Flight }) {
  const [pos, setPos] = useState(flight.from);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPos(flight.to));
    return () => cancelAnimationFrame(raf);
  }, [flight]);
  return (
    <g
      className="flight"
      style={{
        transform: `translate(${pos.x - flight.from.x}px, ${pos.y - flight.from.y}px)`,
        transition: "transform 280ms cubic-bezier(0.3, 0.9, 0.4, 1)",
      }}
    >
      <Checker x={flight.from.x} y={flight.from.y} player={flight.player} />
    </g>
  );
}
