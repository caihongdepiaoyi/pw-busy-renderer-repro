// A/B control: the case #42936 FIXED — a pre-existing page whose renderer
// crashed. On 1.65.0 this should CONNECT, proving the fix is active and that
// the busy-renderer failure (repro-busy-renderer.mjs) is a distinct,
// still-open gap.
import { chromium } from 'playwright-core';

// Can be overridden via CDP_PORT env var in case the default port is taken
// by an already-running browser (would silently poison this repro).
const PORT = Number(process.env.CDP_PORT) || 9334;

async function waitForEndpoint(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  // Uses the Chromium downloaded by `npx playwright-core install chromium`.
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
  await waitForEndpoint();

  const user = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = await user.contexts()[0].newPage();
  await page.goto('about:blank');
  // Crash the renderer of this tab. Note: Page.crash never sends a response
  // (the renderer is gone), so do not await the command itself.
  const session = await page.context().newCDPSession(page);
  session.send('Page.crash').catch(() => {});
  await new Promise(r => setTimeout(r, 1000));

  const t0 = Date.now();
  try {
    const second = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 10000 });
    console.log('SECOND_CONNECT (crashed page): CONNECTED in', Date.now() - t0, 'ms — #42936 fix active (expected)');
    await second.close();
  } catch (e) {
    console.log('SECOND_CONNECT (crashed page):', e.constructor.name, 'after', Date.now() - t0, 'ms — UNEXPECTED');
  }

  await browser.close().catch(() => {});
  setTimeout(() => process.exit(0), 500);
})();
