import type { Page } from "@playwright/test";

interface StoreMove {
  from: number | "bar";
  to: number | "off";
  die: number;
}

interface StoreSnapshot {
  phase: string;
  turn: string;
  aiThinking: boolean;
  dice: number[];
  turnMoves: number;
  historyLen: number;
  scoreWhite: number;
  scoreBlack: number;
  humanSide: "white" | "black";
}

/** Reads a compact snapshot of the game store (dev-only window hook). */
export async function snapshot(page: Page): Promise<StoreSnapshot> {
  return page.evaluate(() => {
    const g = (
      window as unknown as {
        __game: { getState: () => Record<string, never> };
      }
    ).__game.getState() as unknown as {
      match: {
        game: {
          phase: string;
          turn: string;
          dice: number[];
          turnMoves: unknown[];
        };
        score: { white: number; black: number };
      };
      aiThinking: boolean;
      history: unknown[];
      humanSide: "white" | "black";
    };
    return {
      phase: g.match.game.phase,
      turn: g.match.game.turn,
      aiThinking: g.aiThinking,
      dice: g.match.game.dice,
      turnMoves: g.match.game.turnMoves.length,
      historyLen: g.history.length,
      scoreWhite: g.match.score.white,
      scoreBlack: g.match.score.black,
      humanSide: g.humanSide,
    };
  });
}

export async function legalMoves(page: Page): Promise<StoreMove[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __legalMoves: () => StoreMove[] }
      ).__legalMoves() as StoreMove[],
  );
}

/** Clicks a board location through the real SVG UI. */
export async function clickLoc(
  page: Page,
  loc: number | "bar" | "off",
): Promise<void> {
  if (loc === "bar") {
    await page.click('rect[aria-label="Barra"]', { force: true });
  } else if (loc === "off") {
    await page.click('g[aria-label^="Sacar ficha"]', { force: true });
  } else {
    // aria-labels use the HUMAN's point numbering: index+1 for white,
    // 24-index when the human plays black.
    const { humanSide } = await snapshot(page);
    const pointNumber = humanSide === "white" ? loc + 1 : 24 - loc;
    await page.click(`g[aria-label^="Punto ${pointNumber}:"]`, {
      force: true,
    });
  }
  await page.waitForTimeout(120);
}

/**
 * Advances the match until it is the human's turn to move: rolls when
 * needed and waits out AI turns. Resolves with the game in 'moving' phase
 * for white (or gameOver).
 */
export async function ensureHumanMoving(page: Page): Promise<void> {
  for (let guard = 0; guard < 30; guard++) {
    const s = await snapshot(page);
    if (s.phase === "gameOver") return;
    if (!s.aiThinking && s.turn === s.humanSide && s.phase === "moving") return;
    if (!s.aiThinking && s.phase === "openingRoll") {
      await page.click('[data-testid="roll"]');
      await page.waitForTimeout(300);
      continue;
    }
    if (!s.aiThinking && s.turn === s.humanSide && s.phase === "rolling") {
      await page.click('[data-testid="roll"]');
      await page.waitForTimeout(300);
      continue;
    }
    await page.waitForTimeout(400);
  }
  throw new Error("human never reached the moving phase");
}

/** Plays every remaining legal move of the human turn through the UI. */
export async function playAllMoves(page: Page): Promise<void> {
  for (let guard = 0; guard < 8; guard++) {
    const moves = await legalMoves(page);
    if (moves.length === 0) return;
    const move = moves[0];
    await clickLoc(page, move.from);
    await clickLoc(page, move.to);
  }
}

/** Confirms the turn and waits until the AI finished responding. */
export async function confirmAndWaitForAi(page: Page): Promise<void> {
  await page.click('[data-testid="confirm"]');
  await page.waitForFunction(
    () => {
      const g = (
        window as unknown as {
          __game: {
            getState: () => {
              aiThinking: boolean;
              humanSide: string;
              match: { game: { turn: string; phase: string } };
            };
          };
        }
      ).__game.getState();
      return (
        !g.aiThinking &&
        (g.match.game.phase === "gameOver" ||
          (g.match.game.turn === g.humanSide &&
            g.match.game.phase === "rolling"))
      );
    },
    { timeout: 30_000 },
  );
}
