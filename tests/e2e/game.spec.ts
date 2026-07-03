import { expect, test } from "@playwright/test";
import {
  clickLoc,
  confirmAndWaitForAi,
  ensureHumanMoving,
  legalMoves,
  playAllMoves,
  snapshot,
} from "./helpers";

const URL = "/?seed=42&mode=2d&anim=fast";

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("loads the app with board and controls", async ({ page }) => {
  await expect(page).toHaveTitle(/Backgammon 3D/);
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("new-match")).toBeVisible();
});

test("full turn: roll, move, confirm, AI responds legally", async ({
  page,
}) => {
  await page.getByTestId("new-match").click();
  await ensureHumanMoving(page);

  // Dice are visible after rolling.
  await expect(page.locator(".die").first()).toBeVisible();

  await playAllMoves(page);
  const afterMoves = await snapshot(page);
  expect(afterMoves.dice.length).toBe(0);

  await confirmAndWaitForAi(page);
  const s = await snapshot(page);
  // Both turns recorded; the AI move passed store-side legality validation
  // (an illegal engine sequence would have been replaced or rejected).
  expect(s.historyLen).toBeGreaterThanOrEqual(2);
  expect(s.turn).toBe("white");
  await expect(page.getByTestId("history").locator("li")).toHaveCount(
    s.historyLen,
  );
});

test("undo restores the position within a turn", async ({ page }) => {
  await page.getByTestId("new-match").click();
  await ensureHumanMoving(page);

  const moves = await legalMoves(page);
  expect(moves.length).toBeGreaterThan(0);
  await clickLoc(page, moves[0].from);
  await clickLoc(page, moves[0].to);
  expect((await snapshot(page)).turnMoves).toBe(1);

  await page.getByTestId("undo").click();
  expect((await snapshot(page)).turnMoves).toBe(0);
});

test("difficulty can be changed mid-session", async ({ page }) => {
  await page.getByTestId("new-match").click();
  await page.getByTestId("difficulty").selectOption("expert");
  const value = await page.getByTestId("difficulty").inputValue();
  expect(value).toBe("expert");
  const stored = await page.evaluate(
    () =>
      (
        window as unknown as {
          __settings: { getState: () => { difficulty: string } };
        }
      ).__settings.getState().difficulty,
  );
  expect(stored).toBe("expert");
});

test("game persists across a reload", async ({ page }) => {
  await page.getByTestId("new-match").click();
  await ensureHumanMoving(page);
  await playAllMoves(page);
  await confirmAndWaitForAi(page);
  const before = await snapshot(page);
  expect(before.historyLen).toBeGreaterThanOrEqual(2);

  await page.reload();
  await expect(page.getByTestId("board")).toBeVisible();
  const after = await snapshot(page);
  expect(after.historyLen).toBe(before.historyLen);
  expect(after.phase).toBe(before.phase);
  expect(after.scoreWhite).toBe(before.scoreWhite);

  // The restored game remains playable.
  await ensureHumanMoving(page);
  const moves = await legalMoves(page);
  expect(moves.length).toBeGreaterThan(0);
});

test("AI keeps making only legal moves across several turns", async ({
  page,
}) => {
  await page.getByTestId("new-match").click();
  for (let turn = 0; turn < 3; turn++) {
    await ensureHumanMoving(page);
    const s = await snapshot(page);
    if (s.phase === "gameOver") break;
    await playAllMoves(page);
    await confirmAndWaitForAi(page);
  }
  const s = await snapshot(page);
  // Every applied move passed applyMoveToGame's legality validation; if the
  // AI had produced an illegal move the store would have thrown and the
  // turn count would stall.
  expect(s.historyLen).toBeGreaterThanOrEqual(4);
});
