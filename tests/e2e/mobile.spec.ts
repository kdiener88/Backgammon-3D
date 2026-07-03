import { expect, test } from "@playwright/test";
import { ensureHumanMoving, legalMoves } from "./helpers";

test("mobile: loads in 2D and can start playing", async ({ page }) => {
  await page.goto("/?seed=7&anim=fast");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByTestId("board")).toBeVisible();
  // Small screens default to the 2D SVG board.
  await expect(page.locator(".board-area svg")).toBeVisible();

  await page.getByTestId("new-match").click();
  await ensureHumanMoving(page);
  const moves = await legalMoves(page);
  expect(moves.length).toBeGreaterThan(0);

  // Core controls are reachable on a phone viewport.
  await expect(page.getByTestId("confirm")).toBeVisible();
  await expect(page.getByTestId("undo")).toBeVisible();
});
