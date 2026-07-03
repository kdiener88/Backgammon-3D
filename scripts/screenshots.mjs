/**
 * Captures README screenshots against a running dev server.
 * Usage: node scripts/screenshots.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5183';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${base}/?seed=42&mode=2d&anim=fast`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByTestId('new-match').click();

// Play a couple of turns so the board looks alive.
async function ensureHumanMoving() {
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => {
      const g = window.__game.getState();
      return { phase: g.match.game.phase, turn: g.match.game.turn, thinking: g.aiThinking };
    });
    if (s.phase === 'moving' && s.turn === 'white' && !s.thinking) return;
    if (!s.thinking && (s.phase === 'openingRoll' || (s.phase === 'rolling' && s.turn === 'white'))) {
      await page.getByTestId('roll').click();
    }
    await page.waitForTimeout(350);
  }
}
async function playTurn() {
  await ensureHumanMoving();
  for (let i = 0; i < 8; i++) {
    const moves = await page.evaluate(() => window.__legalMoves());
    if (moves.length === 0) break;
    await page.evaluate(() => {
      const g = window.__game.getState();
      const m = window.__legalMoves()[0];
      g.moveChecker(m.from, m.to);
    });
    await page.waitForTimeout(120);
  }
  await page.getByTestId('confirm').click();
  await page.waitForFunction(() => {
    const g = window.__game.getState();
    return !g.aiThinking && (g.match.game.phase === 'gameOver' || g.match.game.turn === 'white');
  }, { timeout: 30000 });
}

await playTurn();
await playTurn();
await ensureHumanMoving();
await page.waitForTimeout(400);
await page.screenshot({ path: 'docs/screenshot-2d.png' });

// 3D mode of the same position.
await page.evaluate(() => window.__settings.getState().set({ boardMode: '3d' }));
await page.waitForTimeout(2500); // lazy chunk + first render
await page.screenshot({ path: 'docs/screenshot-3d.png' });

await browser.close();
console.log('wrote docs/screenshot-2d.png and docs/screenshot-3d.png');
