/**
 * Shared 2D board geometry. ViewBox is 1040x640.
 * Orientation (human = white): white's home board is bottom-right, points
 * 1..6 bottom-right, 7..12 bottom-left, 13..18 top-left, 19..24 top-right.
 */
export const VIEW_W = 1040;
export const VIEW_H = 640;
export const BAR_X = 450;
export const BAR_W = 60;
export const TRAY_X = 940;
export const TRAY_W = 70;
export const COL_W = 70;
export const CHECKER_R = 25;

/** Column (0..11, left to right) occupied by a board index. */
export function columnOf(index: number): number {
  if (index >= 12) return index - 12; // top row: 13..24 left to right
  return 11 - index; // bottom row: 12..1 left to right
}

export function isTopRow(index: number): boolean {
  return index >= 12;
}

/** Center x of a column. */
export function colCenterX(col: number): number {
  const base = col < 6 ? 30 : 510;
  return base + (col % 6) * COL_W + COL_W / 2;
}

export function pointCenterX(index: number): number {
  return colCenterX(columnOf(index));
}

/** Stack position (center) of the k-th checker on a point. */
export function checkerPos(
  index: number,
  stackIdx: number,
): { x: number; y: number } {
  const x = pointCenterX(index);
  const step = CHECKER_R * 2 + 1;
  const capped = Math.min(stackIdx, 4);
  const y = isTopRow(index)
    ? 25 + CHECKER_R + 2 + capped * step
    : VIEW_H - 25 - CHECKER_R - 2 - capped * step;
  return { x, y };
}

/** Bar slot for a player's k-th hit checker (white top half, black bottom). */
export function barPos(
  player: "white" | "black",
  stackIdx: number,
): { x: number; y: number } {
  const x = BAR_X + BAR_W / 2;
  const step = CHECKER_R * 2 + 2;
  const capped = Math.min(stackIdx, 3);
  return player === "white"
    ? { x, y: 120 + capped * step }
    : { x, y: VIEW_H - 120 - capped * step };
}

/** Off-tray anchor. White tray bottom-right, black top-right. */
export function trayRect(player: "white" | "black"): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return player === "white"
    ? { x: TRAY_X, y: 330, w: TRAY_W, h: 285 }
    : { x: TRAY_X, y: 25, w: TRAY_W, h: 285 };
}

/** Rough coordinates for animating a move endpoint. */
export function locCoords(
  loc: number | "bar" | "off",
  player: "white" | "black",
  stackIdx: number,
): { x: number; y: number } {
  if (loc === "bar") return barPos(player, stackIdx);
  if (loc === "off") {
    const t = trayRect(player);
    return { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  }
  return checkerPos(loc, stackIdx);
}

/** Hit-test a pointer position (in viewBox units) to a board location. */
export function hitTest(x: number, y: number): number | "bar" | "off" | null {
  if (x >= TRAY_X - 5) return "off";
  if (x >= BAR_X && x <= BAR_X + BAR_W) return "bar";
  const top = y < VIEW_H / 2;
  let col: number;
  if (x >= 30 && x < 30 + 6 * COL_W) col = Math.floor((x - 30) / COL_W);
  else if (x >= 510 && x < 510 + 6 * COL_W)
    col = 6 + Math.floor((x - 510) / COL_W);
  else return null;
  return top ? 12 + col : 11 - col;
}
