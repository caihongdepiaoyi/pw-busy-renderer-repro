# pw-busy-renderer-repro

Minimal reproduction for a follow-up to [microsoft/playwright#42936](https://github.com/microsoft/playwright/pull/42936):

> `connectOverCDP()` still hangs when a pre-existing page's renderer is **alive but busy** (main thread blocked by a long synchronous JavaScript task). #42936 fixed the *renderer-gone* cases (crashed / discarded pages) via `Inspector.targetCrashed`, but a busy renderer never crashes, so `Inspector.enable` is never answered and `CRBrowser.connect`'s unbounded `_waitForAllPagesToBeInitialized()` keeps waiting.

## Contents

| file | what it does |
|---|---|
| `repro-busy-renderer.mjs` | The bug: second `connectOverCDP()` against a browser with one busy tab → `TimeoutError` |
| `repro-crashed-page-control.mjs` | A/B control: same setup but the tab's renderer is *crashed* → connects in ~10 ms (proves the #42936 fix is active) |

## How to run

```bash
npm install
npx playwright-core install chromium   # one-time browser download

npm run busy      # expect: SECOND_CONNECT: TimeoutError after ~10000 ms — STILL HANGS
npm run crashed   # expect: SECOND_CONNECT (crashed page): CONNECTED in ~10 ms — #42936 fix active
```

No other dependencies; both scripts are single self-contained files using only `playwright-core`.

If the default debugging ports are occupied by an already-running browser on
your machine, override them — a stale listener would silently poison the
repro (client #1 would attach to that browser instead of ours):

```bash
CDP_PORT=9533 npm run busy
CDP_PORT=9534 npm run crashed
```

## Observed output (playwright-core 1.65.0, Chromium 158.0.8127.18 / chromium-1254, macOS 26.2 arm64)

```
$ npm run busy
endpoint ready: true
GET /json/version during hang: 3 ms, Browser: HeadlessChrome/158.0.8127.18
SECOND_CONNECT: TimeoutError after 10002 ms — STILL HANGS

$ npm run crashed
SECOND_CONNECT (crashed page): CONNECTED in 4 ms — #42936 fix active (expected)
```

During the hang, the browser-level HTTP endpoint (`/json/version`) and raw page-level WebSockets to *healthy* pages respond in a few ms — only the commands sent to the busy page's renderer (`Page.enable`, `Runtime.enable`, `Inspector.enable`, …) never return.

## Context

- #41093 — original report (NOT_PLANNED)
- #41714 / #42930 — Memory Saver discarded pages (fixed by #42936)
- #42730, #42882 — same symptom, closed when #42936 landed
- PR #42883 — a bounded-grace-period approach (superseded by the narrow #42936 fix)
