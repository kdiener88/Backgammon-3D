import type { Move, Player } from "./types";
import { relativePoint } from "./constants";

/** One location in mover-relative notation ("24".."1", "bar", "off"). */
function loc(player: Player, l: number | "bar" | "off"): string {
  if (l === "bar") return "bar";
  if (l === "off") return "off";
  return String(relativePoint(player, l));
}

/** A single move, e.g. "24/18" or "8/5*". */
export function moveNotation(player: Player, move: Move): string {
  return `${loc(player, move.from)}/${loc(player, move.to)}${move.hit ? "*" : ""}`;
}

/**
 * Full-turn notation, e.g. "31: 8/5 6/5" or "55: 13/8(2) 8/3(2)".
 * Identical moves are collapsed with a count suffix.
 */
export function turnNotation(
  player: Player,
  roll: [number, number],
  moves: Move[],
): string {
  const rollPart = `${roll[0]}${roll[1]}`;
  if (moves.length === 0) return `${rollPart}: (no play)`;

  const parts: string[] = [];
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const m of moves) {
    const text = moveNotation(player, m);
    if (!counts.has(text)) order.push(text);
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  for (const text of order) {
    const n = counts.get(text)!;
    parts.push(n > 1 ? `${text}(${n})` : text);
  }
  return `${rollPart}: ${parts.join(" ")}`;
}
