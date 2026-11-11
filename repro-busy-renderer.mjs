// Repro: the second connectOverCDP() must resolve while a pre-existing tab's
// renderer main thread is busy in a long synchronous task.
//
// On 1.65.0 (contains #42936's Inspector.enable / crashed-page skip fix):
//   expected if the bug is fixed:      SECOND_CONNECT: CONNECTED in <few> ms
//   expected if the bug persists:      SECOND_CONNECT: TimeoutError after ~10000 ms
//
// Adapted from microsoft/playwright#42882's repro.
import { chromium } from 'playwright-core';

// Can be overridden via CDP_PORT env var in case the default port is taken
// by an already-running browser (a stale listener here would silently poison
// this repro: client #1 would attach to that browser instead of ours).
const PORT = Number(process.env.CDP_PORT) || 9333;

async function waitForEndpoint(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url + '/json/version'); if (r.ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  // 1. Launch a long-lived browser with a debugging port (our own browser instance).
  //    Uses the Chromium downloaded by `npx playwright-core install chromium`.
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
  const ok = await waitForEndpoint(`http://127.0.0.1:${PORT}`);
  console.log('endpoint ready:', ok);

  // 2. Client #1: connect, open a tab whose renderer becomes busy in for(;;).
  const user = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const busy = await user.contexts()[0].newPage();
  await busy.goto('data:text/html,<script>setTimeout(()=>{for(;;){}},100)</script>');
  await new Promise(r => setTimeout(r, 600));

  // Sanity check: browser-level HTTP endpoint is still alive during the hang.
  const tHttp = Date.now();
  const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  console.log('GET /json/version during hang:', Date.now() - tHttp, 'ms, Browser:', v.Browser);

  // 3. Client #2 (fresh connection attempt — this is where the hang shows up).
  const t0 = Date.now();
  try {
    const second = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 10000 });
    console.log('SECOND_CONNECT: CONNECTED in', Date.now() - t0, 'ms — bug fixed');
    await second.close();
  } catch (e) {
    console.log('SECOND_CONNECT:', e.constructor.name, 'after', Date.now() - t0, 'ms — STILL HANGS');
  }

  // 4. Cleanup: browser.close() sends Browser.close (process-level), does not wait for pages.
  await browser.close().catch(() => {});
  setTimeout(() => process.exit(0), 500);
})();
