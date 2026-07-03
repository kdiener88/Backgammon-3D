import type { GameState, Player } from "./types";
import { pipsToOff } from "./constants";
import { ownCount } from "./moveGeneration";

const BAR_PIPS = 25;

/** Total pips the player still needs to bear off all checkers. */
export function pipCount(
  state: Pick<GameState, "points" | "bar">,
  player: Player,
): number {
  let total = state.bar[player] * BAR_PIPS;
  for (let i = 0; i < state.points.length; i++) {
    total += ownCount(state.points, player, i) * pipsToOff(player, i);
  }
  return total;
}
