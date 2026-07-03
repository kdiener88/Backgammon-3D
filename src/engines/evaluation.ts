import type { Player } from "../game/backgammon/types";
import {
  HOME_RANGE,
  NUM_POINTS,
  OPPONENT,
  pipsToOff,
  relativePoint,
} from "../game/backgammon/constants";
import { opponentCount, ownCount } from "../game/backgammon/moveGeneration";

/** Position snapshot evaluated by the engines. */
export interface BoardLike {
  points: number[];
  bar: Record<Player, number>;
  off: Record<Player, number>;
}

/**
 * Probability (out of 36 rolls) that a single checker at distance `d` gets
 * hit, ignoring intermediate blocking. Standard backgammon shot table.
 */
const HIT_CHANCES: Record<number, number> = {
  1: 11,
  2: 12,
  3: 14,
  4: 15,
  5: 15,
  6: 17,
  7: 6,
  8: 6,
  9: 5,
  10: 3,
  11: 2,
  12: 3,
  15: 1,
  16: 1,
  18: 1,
  20: 1,
  24: 1,
};

function hitChance(distance: number): number {
  return (HIT_CHANCES[distance] ?? 0) / 36;
}

/** Value in pips of holding a made point, by mover-relative point number. */
const POINT_VALUE: Record<number, number> = {
  1: 0.5,
  2: 1.5,
  3: 2.5,
  4: 5.0,
  5: 6.0,
  6: 4.0,
  7: 4.5,
  8: 2.0,
  9: 1.5,
  10: 1.5,
  11: 1.5,
  12: 1.0,
  13: 1.0,
  14: 1.0,
  15: 1.0,
  16: 1.0,
  17: 1.0,
  18: 1.5,
};

/** Anchor value (a made point inside the opponent's home board). */
const ANCHOR_VALUE: Record<number, number> = {
  19: 3.5,
  20: 5.0,
  21: 5.0,
  22: 3.0,
  23: 2.0,
  24: 2.0,
};

function pipCountOf(board: BoardLike, player: Player): number {
  let total = board.bar[player] * 25;
  for (let i = 0; i < NUM_POINTS; i++) {
    total += ownCount(board.points, player, i) * pipsToOff(player, i);
  }
  return total;
}

/** Number of made points (2+ checkers) in the player's home board. */
function homeBoardPoints(board: BoardLike, player: Player): number {
  const [lo, hi] = HOME_RANGE[player];
  let n = 0;
  for (let i = lo; i <= hi; i++) {
    if (ownCount(board.points, player, i) >= 2) n++;
  }
  return n;
}

/** True if the two sides can still make contact (not a pure race). */
export function hasContact(board: BoardLike, player: Player): boolean {
  if (board.bar.white > 0 || board.bar.black > 0) return true;
  // Rearmost white checker vs foremost black checker: white travels toward
  // index 0, black toward 23. Contact exists while any white checker sits
  // ahead (higher index) of any black checker.
  let whiteRear = -1;
  for (let i = NUM_POINTS - 1; i >= 0; i--) {
    if (ownCount(board.points, "white", i) > 0) {
      whiteRear = i;
      break;
    }
  }
  let blackRear = NUM_POINTS;
  for (let i = 0; i < NUM_POINTS; i++) {
    if (ownCount(board.points, "black", i) > 0) {
      blackRear = i;
      break;
    }
  }
  void player;
  return whiteRear > blackRear;
}

/**
 * Total expected cost (in pips) of the player's blots being hit.
 * Cost of a hit = pips lost (checker returns to the bar) inflated by the
 * opponent's home-board strength (harder re-entry).
 */
function blotRisk(board: BoardLike, player: Player): number {
  const opp = OPPONENT[player];
  const oppHome = homeBoardPoints(board, opp);
  let risk = 0;
  for (let i = 0; i < NUM_POINTS; i++) {
    if (ownCount(board.points, player, i) !== 1) continue;
    // Combine hit probabilities from every opposing checker that can reach.
    let missAll = 1;
    for (let j = 0; j < NUM_POINTS; j++) {
      if (opponentCount(board.points, player, j) === 0) continue;
      const distance = player === "white" ? i - j : j - i;
      if (distance <= 0) continue;
      missAll *= 1 - hitChance(distance);
    }
    if (board.bar[opp] > 0) {
      // Checkers on the bar re-enter into the blot's zone.
      const entryDistance = player === "white" ? NUM_POINTS - i : i + 1;
      if (entryDistance >= 1 && entryDistance <= 6) {
        missAll *= 1 - hitChance(entryDistance);
      }
    }
    const pHit = 1 - missAll;
    const pipsLost = 25 - pipsToOff(player, i);
    risk += pHit * (pipsLost + 4 + oppHome * 2);
  }
  return risk;
}

/** Bonuses for made points, anchors, primes and structure. */
function structureScore(board: BoardLike, player: Player): number {
  let score = 0;
  let primeLen = 0;
  let bestPrime = 0;
  let primeEndRp = 0;

  for (let rp = 1; rp <= NUM_POINTS; rp++) {
    // Convert mover-relative point back to a board index.
    const index = player === "white" ? rp - 1 : NUM_POINTS - rp;
    const made = ownCount(board.points, player, index) >= 2;
    if (made) {
      score += POINT_VALUE[rp] ?? 0;
      score += ANCHOR_VALUE[rp] ?? 0;
      primeLen++;
      if (primeLen > bestPrime) {
        bestPrime = primeLen;
        primeEndRp = rp;
      }
    } else {
      primeLen = 0;
    }

    // Stacking penalty: more than 4 checkers pile up dead pips.
    const count = ownCount(board.points, player, index);
    if (count > 4) score -= (count - 4) * 0.6;
  }

  if (bestPrime >= 3) {
    let bonus = (bestPrime - 2) * (bestPrime - 2) * 2.0;
    // A prime is far more valuable with enemy checkers trapped behind it.
    const opp = OPPONENT[player];
    let trapped = board.bar[opp] > 0;
    if (!trapped) {
      for (let rp = primeEndRp + 1; rp <= NUM_POINTS; rp++) {
        const index = player === "white" ? rp - 1 : NUM_POINTS - rp;
        if (opponentCount(board.points, player, index) > 0) {
          trapped = true;
          break;
        }
      }
    }
    if (trapped) bonus *= 2;
    score += bonus;
  }

  return score;
}

export interface EvalBreakdown {
  race: number;
  structure: number;
  blotRisk: number;
  bar: number;
  off: number;
  total: number;
}

/**
 * Static evaluation of a position from `player`'s point of view, in
 * pip-equivalents. Higher is better for `player`. Pure function of the board.
 */
export function evaluateBoard(board: BoardLike, player: Player): EvalBreakdown {
  const opp = OPPONENT[player];
  const ownPip = pipCountOf(board, player);
  const oppPip = pipCountOf(board, opp);
  const contact = hasContact(board, player);

  const race = oppPip - ownPip;
  const off = (board.off[player] - board.off[opp]) * 3;

  if (!contact) {
    // Pure race: pips, borne-off checkers and home distribution decide.
    let distribution = 0;
    for (const p of [player, opp] as Player[]) {
      const [lo, hi] = HOME_RANGE[p];
      let waste = 0;
      for (let i = lo; i <= hi; i++) {
        const c = ownCount(board.points, p, i);
        if (c > 3) waste += (c - 3) * 0.4;
      }
      distribution += p === player ? -waste : waste;
    }
    const total = race + off + distribution;
    return { race, structure: distribution, blotRisk: 0, bar: 0, off, total };
  }

  const structure = structureScore(board, player) - structureScore(board, opp);
  const risk = blotRisk(board, player) - blotRisk(board, opp);

  // Opponent checkers on the bar: tempo plus entry pain against our board.
  const ownHome = homeBoardPoints(board, player);
  const oppHome = homeBoardPoints(board, opp);
  const bar =
    board.bar[opp] * (4 + ownHome * 2.0) -
    board.bar[player] * (4 + oppHome * 2.0);

  const total = race * 0.35 + structure + bar + off - risk;
  return { race: race * 0.35, structure, blotRisk: -risk, bar, off, total };
}

/** Rough win probability from a pip-equivalent score. */
export function winProbabilityFromScore(score: number): number {
  return 1 / (1 + Math.exp(-score / 22));
}

/** Rough cubeless equity in [-1, 1]. */
export function equityFromScore(score: number): number {
  return Math.tanh(score / 30);
}

/**
 * Builds a short Spanish explanation of a chosen play by comparing the
 * position before and after (hits, points made, entries, bear-offs, races).
 */
export function describePlay(
  before: BoardLike,
  after: BoardLike,
  player: Player,
  moves: {
    from: number | "bar";
    to: number | "off";
    die: number;
    hit: boolean;
  }[],
): string {
  if (moves.length === 0) return "Sin jugadas legales: pierde el turno.";
  const parts: string[] = [];
  const opp = OPPONENT[player];

  if (moves.some((m) => m.hit)) parts.push("pega una ficha rival");
  if (moves.some((m) => m.from === "bar")) parts.push("entra desde la barra");

  const bornOff = after.off[player] - before.off[player];
  if (bornOff > 0) parts.push(`saca ${bornOff} ficha${bornOff > 1 ? "s" : ""}`);

  // Newly made points, reported in the mover's own numbering.
  const newPoints: number[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    if (
      ownCount(after.points, player, i) >= 2 &&
      ownCount(before.points, player, i) < 2
    ) {
      newPoints.push(relativePoint(player, i));
    }
  }
  if (newPoints.length > 0) {
    parts.push(`hace punto en el ${newPoints.join(" y el ")}`);
  }

  if (parts.length === 0) {
    const beforeBlots = countBlots(before, player);
    const afterBlots = countBlots(after, player);
    if (afterBlots < beforeBlots) parts.push("asegura sus fichas");
    else if (!hasContact(after, player)) parts.push("corre hacia casa");
    else parts.push("avanza posicionalmente");
  }
  void opp;

  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

function countBlots(board: BoardLike, player: Player): number {
  let n = 0;
  for (let i = 0; i < NUM_POINTS; i++) {
    if (ownCount(board.points, player, i) === 1) n++;
  }
  return n;
}
