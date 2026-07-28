# Thai RPG PWA — Frontend Agent Skill

> **SELF-UPDATE RULE**: Every agent working on this project MUST update this skill file before finishing. Add anything you learned, any user instructions given, any tricky bugs found, and any deployment changes. Think of this file as the project's collective memory — the next agent starts fresh with only this file and the code. Delete outdated info. This rule applies to YOU right now — update this file before you finish your task.

## Project Overview

Thai RPG is a **Progressive Web App (PWA)** for learning Thai vocabulary through an interactive RPG adventure. Users read narrative episodes, review vocabulary cards (using SM-2 spaced repetition), and make story choices that affect subplot scores.

**Tech stack**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
**Architecture**: MVC — `controller.js` (business logic), `Store.tsx` (state management + data loading), `View.tsx` (UI rendering)
**Repo**: [`https://github.com/kire321/thai-rpg`](https://github.com/kire321/thai-rpg)

***

## Agentic Workflow

1. Refamiliarize yourself with the project in this fresh context
2. Complete the task. Most of the time, this will entail starting with a red user journey test (see below)
3. Update this skill file. The next task will come in a new context window, so anything you want to remember needs to go in this file. Think about the movie "momento".
   * add anything I told you that could be helpful in the future:
     * phrases that suggest ongoing or repeated tasks: "always bla bla", "never bla bla", "remember to bla bla"
     * general advice: "this is an especially tricky bug, try bla bla"
     * specs or user requirements at a medium level of detail: not the one specific bug you fixed in this task, but do include medium-detailed user stories or features that I mentioned
   * delete anything that turned out to be outdated or misleading
   * add anything you learned that would be helpful in the future
4. Deploy to cloudflare.
5. Push your code and changes and the changes to this skill file to github.
6. Write your reply following the **Writing Your Reply** section below.

## GitHub Access (PAT vs MCP)

Two ways to access GitHub, in order of preference:

1. **User-provided fine-grained PAT via plain `git` over HTTPS (preferred when available)**: use `https://x-access-token:<PAT>@github.com/kire321/thai-rpg.git` in one-off `git clone`/`fetch`/`push` commands. Advantages over the MCP plugin: works when the MCP server fails to connect (it has); pushes files straight from local disk — the MCP `create_or_update_file` requires retyping entire file contents into tool parameters, which is slow and error-prone for large files like this skill file; keeps local git in sync so `git checkout` is safe. **SECURITY: never save the PAT in git config, never write it to any file, never commit or publish it anywhere — use it only inline in one-off commands, and scrub it from the remote URL afterwards (`git remote set-url origin https://github.com/kire321/thai-rpg.git`).**
2. **GitHub MCP plugin**: fine for browsing, reads, and small file updates when connected. It commits without touching local git — after any MCP push, the local repo is stale; re-sync (`git fetch` + `git reset --hard`) before any `git checkout`, or tracked files silently revert to old commits (this once broke a build by reverting `src/types/index.ts`).
3. **GitHub REST API fallback (2026-07-28)**: shell `git clone`/`push` to github.com is flaky from the sandbox (HTTP/2 framing errors, timeouts); `api.github.com` REST is reliable — tarball: `https://codeload.github.com/kire321/thai-rpg/tar.gz/refs/heads/master`; file updates: `PUT /repos/kire321/thai-rpg/contents/{path}` (base64 content, needs current blob sha). NOTE: the fine-grained PAT needs **Workflows: write** to create files under `.github/workflows/` (separate from Actions: write, which dispatch needs) — the user granted both on 2026-07-28 (check with the `x-accepted-github-permissions` response header, it names the exact missing permission). Two more Actions-relay gotchas, both verified: `POST .../actions/workflows/{file}/dispatches` 404s unless the workflow file ALSO exists on the DEFAULT branch (`main` here, not `master`); run logs download via `results-receiver.actions.githubusercontent.com` (reachable from the sandbox) after a 302 from `.../actions/runs/{id}/logs`. To pass secrets into a run: dispatch inputs + `echo "::add-mask::$VALUE"` as the first step.

## Writing Your Reply

When you reply, don't claim to have completed the user's objective. Instead:

* describe in technical detail what you did (most of your reply should be dedicated to this section)
* [if you think the task isn't finished yet] ask the user for information to help you complete the task
* [if you think the task is finished] ask the user if their objective was completed (briefly restate the objective from the prompt to avoid referring to "your objective" in abstract terms)
* suggest further actions you could do that might help the user's objective

**2026-07-28 correction**: the Vite app lives at the REPO ROOT (`package.json`, `vite.config.ts`, `src/`, `public/`) — there is no `app/` folder. Controller tests: `node src/test/test.mjs` (44 tests, no browser). Playwright offline tests: `src/test/test-*.mjs` (need cms-mirror.py harness). The structure below is aspirational/outdated.

## Directory Structure

```
app/src/
  controller/controller.js   — ALL business logic (handlers, getProps, SM-2, episode selection)
  model/Store.tsx            — React component: wires controller + View, loads CMS data
  view/View.tsx              — ALL UI components (pure, receives props from getProps)
  types/index.ts             — TypeScript type definitions
  components/ui/             — shadcn/ui components (auto-generated, don't modify)
  data/                      — Bundled fallback data (episodes.json, vocab_items.json, etc.)
app/public/
  sw.js                      — Service Worker (must bump CACHE_NAME on every deploy)
  episodes.json              — Episode data (narrative lines, choices, acts, tags)
  vocab_items.json           — Vocabulary items (Thai word + English translation + tags)
  characters.json            — Character definitions (name, description, picture)
  places.json                — Place definitions (name, description, picture)
  tags.json                  — Tag definitions (tag ID → vocab item IDs)
test-*.js                    — User journey tests (run with `node test-*.js`)
```

***

## Architecture: How It Works

### MVC Flow

```
User action → Store.tsx calls Handlers[event](state, env) → returns state updates
                                      ↓
                           controller.js processes business logic
                                      ↓
                           getProps(state, env) → View.tsx renders
```

**Key rule**: The View is pure — it only renders `props` returned by `getProps()`. The controller is the brain. All state mutations go through handlers.

### State Shape (important fields)

```javascript
{
  // Content
  episodes: [...],           // Episode objects (acts, lines, choices)
  vocabItems: [...],         // Vocabulary items
  cards: [...],              // Generated cards (thai-eng + eng-thai per vocab)
  tags: { tagId: [vocabIds] },
  tagMeta: { tagId: { name, description, picture } },
  characters: { charId: { name, description, picture } },
  places: { placeId: { name, description, picture } },

  // Card review (SM-2)
  cardStats: { cardId: { repetitions, interval, ef, lastReviewed, failedToday } },
  againQueue: [cardIds],     // Cards rated "again" today
  againDelayCounter: number, // Counts down between again cards
  newCardsRatedToday: number, // NEW cards rated today (replaces broken heuristic)

  // Episode progress
  episodePlays: { episodeId: playCount },
  episodesPlayedToday: [episodeIds], // Excluded from selection
  subplotScores: { subplotId: score },

  // Current session
  currentView: 'welcome' | 'episode',
  currentEpisodeId: string,
  currentActIndex: number,
  currentLineIndex: number,
  actPhase: 'lines_before' | 'vocab_review' | 'lines_after' | 'choice' | 'outcome',
  vocabReviewCardId: string | null,  // LOCKED card for vocab review
  showingAnswer: boolean,
  dateshift: number,  // 0=today, 1=tomorrow, etc. For testing.

  // Settings
  cmsBaseUrl: string,
  isSettingsOpen: boolean,
  toast: string | null,
}
```

### Episode Structure

```javascript
{
  id: 'ep_001',
  title: 'Episode Title',
  acts: [
    {
      tag: 'tag_001',              // Tag linking to vocab
      lines_before: [              // Narrative lines before vocab review
        {
          character: 'char_narrator',
          place: 'place_ship',
          dialogue: 'The text to display',
          stage_directions: ['Optional stage direction'],
          // CMS corruption: some lines also have:
          //   char: 'char_narrator',     // ← correct character
          //   line: 'The real text',     // ← correct dialogue
          //   dialogue: '[None]',        // ← corrupted!
          //   character: 'char_bandit',  // ← corrupted!
        }
      ],
      lines_after: [...],          // Narrative after vocab review
      decision: {                  // Choice point
        line: { dialogue: 'What do you do?' },
        choices: [
          {
            difficulty: 0,         // 0=easy, 1=medium, 2=hard
            pass_outcome: { subplot: 'main', delta: 1, line: 'Success!' },
            fail_outcome: { subplot: 'main', delta: -1, line: 'Failure!' },
          },
          // ...more choices
        ],
      },
      consequence: {},
    },
    // ...more acts
  ],
}
```

**Critical**: ~250/340 episodes have `dialogue: "[None]"` — the real text is in the `line` field. The controller's `normalizeLine()` function handles this transparently. Do NOT fix the data — fix the code.

***

## Testing Strategy (Critical)

### ONLY user journey tests. NO unit tests.

Every test simulates **user actions** by calling handlers, then asserts against **`getProps`**. This is the project's testing philosophy.

### Test Pattern

```javascript
const { getProps, Handlers } = await import('./app/src/controller/controller.js');

// Helper: apply state updates
function apply(state, updates) {
  if (!updates || Object.keys(updates).length === 0) return state;
  return { ...state, ...updates };
}

// Helper: play until vocab review
function playUntilVocabReview(state) {
  let s = state;
  while (s.actPhase !== 'vocab_review') {
    s = apply(s, Handlers.onTapNextLine(s, env));
  }
  return s;
}

// Test: simulate user actions, assert via getProps
let state = makeBaseState();
state = apply(state, Handlers.onStartEpisode(state, env));
state = playUntilVocabReview(state);

const props = getProps(state, env);
console.assert(props.currentActTag === 'Greetings', 'Should show human-readable tag');
```

### Always Include These Test Data Patterns

**1. Realistic CMS data** (not synthetic): Include lines with `dialogue: "[None]"`, `character: "char_bandit"`, and the correct `char`/`line` fallbacks. This catches data-format regressions that perfect synthetic data misses.

**2. Due cards**: Set `lastReviewed: yesterday, interval: 1` to create due cards.

**3. Again queue**: Put cards in `againQueue` to test re-review flow.

### Test Files

| File                           | What it tests                                                     |
| ------------------------------ | ----------------------------------------------------------------- |
| `test-counters.js`             | New/due/done counters, tag display, due date format, skill checks |
| `test-cms-data-format.js`      | CMS corruption: [None] dialogue, wrong character                 |
| `test-offline-cached-data.js`  | Cached data normalization                                         |
| `test-episode-selection-v2.js` | Episode selection: most-due, played-today exclusion               |
| `test-repro.js`                | Due card shown instead of new card                                |
| `test-user-journey.js`         | Full 2-day activity simulation                                    |
| `test-diagnostics.js`          | Diagnostic displays share code paths                              |

### SW Cache Testing with Playwright

To reproduce image caching bugs, use Playwright + local HTTP server:

```javascript
// test-sw-cache-repro pattern:
// 1. Serve the built app on localhost
// 2. Open Chromium headless, load the page
// 3. Navigate to episode with images (SW caches them)
// 4. Use page.route('**/*', route => route.abort('internetdisconnected'))
//    to simulate offline (blocks at browser level)
// 5. Reload the page / trigger image re-render
// 6. Check if images load from SW cache
```

Key files for SW cache testing:
- `test-cache-repro.html` — test page with controls
- `test-cache-repro-sw.js` — minimal SW with detailed logging
- `test-sw-v1.js` / `test-sw-v2.js` / `test-sw-v3.js` — SW versions for cache migration testing
- `test-image.png` — local 1x1 PNG for CORS-free testing
- `test-sw-fix-verified.mjs` — Playwright test that verifies the fix

### Running Tests

```bash
cd /mnt/agents/output  # or wherever the project is
node test-counters.js
# Run ALL tests:
for f in test-*.js; do echo "=== $f ==="; node "$f" 2>&1 | tail -3; done
```

### TDD Workflow (Required)

1. **RED**: Write a test that simulates the bug. Run it — confirm it fails.
2. **GREEN**: Fix the code in `controller.js`. Run the test — confirm it passes.
3. **ALL**: Run ALL test suites to ensure no regressions.
4. **BUILD**: `npm run build` in `app/` — must succeed.
5. **PUSH**: Use the GitHub plugin.
6. **DEPLOY**: Use Cloudflare plugin.

***

## Key Controller Functions

### `getProps(state, env)` → View props

The single source of truth for what the View renders. ALL diagnostic data, counters, and current state flows through here. If you need to expose something to the UI, add it to `getProps`.

### Handlers (in `Handlers` object)

| Handler                                   | Triggered by                                 |
| ----------------------------------------- | -------------------------------------------- |
| `onStartEpisode(state, env)`              | "Start Episode" button                       |
| `onTapNextLine(state, env)`               | "Next" button during narrative               |
| `onTapNextScenario(state, env)`           | "Next Scenario" (fast forward) header button |
| `onRateCard(state, env, cardId, quality)` | Card rating buttons (quality 1-4)            |
| `onTapChoice(state, env, choiceIndex)`    | Choice button in decision                    |
| `onOutcomeDone(state, env)`               | "Continue" after outcome                     |
| `onVocabReviewDone(state, env)`           | "Skip" during vocab review                   |
| `onShowAnswer(state, env)`                | "Show Answer" button                         |
| `onTapGear(state, env)`                   | Settings gear icon                           |
| `onCloseSettings(state, env)`             | Close settings drawer                        |
| `onExportState(state, env)`               | "Export State" button                        |
| `onImportState(state, env, content)`      | "Import State" file select                   |
| `onIncrementDateshift(state, env)`        | Dateshift + button                           |
| `onDecrementDateshift(state, env)`        | Dateshift - button                           |
| `onTapResetState(state, env)`             | "Reset State" button                         |
| `onChangeCmsBase(state, env, url)`        | CMS URL input change                         |
| `onCheckForUpdates(state, env)`           | "Check for Updates" button                   |
| `onClearToast(state, env)`                | Toast dismiss                                |

### SM-2 Spaced Repetition

Cards are scheduled using SM-2:

* Quality 1 ("again"): interval=1, rep=0, card enters `againQueue`
* Quality 3 ("good"): interval=6 after first rep
* Quality 4 ("easy"): interval=8 after first rep

### Episode Selection Algorithm (v2)

1. Find most overdue card (again cards = most urgent)
2. Find tags containing that card's vocabId
3. Find episodes whose **first act** uses one of those tags
4. **Exclude episodes in `episodesPlayedToday`**
5. **Prioritize episodes reviewing the most due cards**
6. Tiebreak: least-played overall

Key function: `countDueCardsInEpisode()` shares code path with diagnostics.

***

## Known CMS Data Issues (Don't Fix Data, Fix Code)

| Issue                                    | Where                           | Fix Location                                      |
| ---------------------------------------- | ------------------------------- | ------------------------------------------------- |
| `dialogue: "[None]"`                     | 250/340 episodes                | `normalizeLine()` in `getCurrentLine()`           |
| `character: "char_bandit"`               | All lines in corrupted episodes | `normalizeLine()` prefers `char` over `character` |
| `stage_directions` as string             | Some episodes                   | `normalizeLine()` converts to string array        |
| `tags` as array `[{id, vocab_item_ids}]` | CMS format                      | `tagsArrayToMap()` in Store.tsx                   |

`normalizeLine()` runs at render time (in `getCurrentLine`), NOT at data load time. This ensures cached/offline data is also fixed.

***

## Deployment

### Cloudflare Pages (Primary)

The project is deployed to Cloudflare Pages as `thai-rpg`.
**Production URL**: `https://thai-rpg.pages.dev`

**Deployment method** (verified working — follow this exactly, do NOT try to upload assets to Cloudflare Pages directly):

The production site is a thin Cloudflare Pages `_worker.js` that proxies every request to a `*.kimi.page` URL hosting the built app. Deploying = deploy the new build to kimi.page, then point the proxy at the new URL.

1. **Bump SW cache version**: Edit `app/public/sw.js` — change `CACHE_NAME` and update `BUILD_VERSION` comment.
2. **Build**: `cd app && npm install && npm run build` — must succeed with zero errors. Note: the build embeds a timestamp (`__APP_VERSION__`), so the JS bundle filename changes every build.
3. **Deploy static files**: Use `mshtools-website_version_manager` with `action: "build_version"`, `type: "static"`, `project_dir` = the project root (containing `dist/` after the build). The tool returns a version ID; **the preview URL (`https://<id-or-slug>.kimi.page`) is shown on the frontend version card — you need that exact URL for the next step.** If the tool result shows no URL, get it from the version card before touching Cloudflare; do not guess URL patterns (wildcard `*.kimi.page` hosts return 404 for other tenants).
4. **Update the Cloudflare Pages proxy** via Cloudflare MCP `execute` (the `/pages/assets/*` upload-token flow and direct worker-version PUTs do NOT work — see pitfalls below):
   a. Compute the asset hash: `sha256(_worker.js)` as hex, truncated to 32 chars.
   b. `POST /accounts/{accountId}/workers/scripts/pages-worker--16090577-production/assets-upload-session` with body `{"manifest": {"/_worker.js": {"hash": "<hash32>", "size": <bytes>}}}` → returns a JWT (audience `api.workers.cloudflare.com`).
   c. Upload the asset **from a local shell** (the MCP execute sandbox blocks egress to `api.workers.cloudflare.com`):
      `curl -X POST "https://api.workers.cloudflare.com/client/v4/accounts/{accountId}/workers/assets/upload?base64=true" -H "Authorization: Bearer <jwt>" -F "<hash32>=@worker.b64;type=application/javascript;filename=<hash32>"` where `worker.b64` is the base64-encoded `_worker.js`. Retry a few times on HTTP 522.
   d. `POST /accounts/{accountId}/pages/projects/thai-rpg/deployments` as multipart/form-data with a single field `manifest` = `{"/_worker.js": "<hash32>"}` (JSON, path keys have a leading slash). **The new deployment goes LIVE immediately.**
   e. Verify `https://thai-rpg.pages.dev`: `sw.js` shows the new `CACHE_NAME`, the bundle path referenced by `index.html` returns 200, `/icon-512x512.png` returns 200. If anything fails, roll back: `POST /accounts/{accountId}/pages/projects/thai-rpg/deployments/{previous-deployment-id}/rollback` (site recovers in ~20s).
5. **Push code**: Use GitHub MCP to push changes to the `master` branch.

**Proxy `_worker.js`** (only the target URL changes between deploys):

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = 'https://<deploy-url>.kimi.page' + url.pathname + url.search;
    return fetch(new Request(target, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    }));
  },
};
```

**Pitfalls (all verified, do not retry these):**
- `GET .../pages/projects/thai-rpg/upload-token` returns a JWT that `/pages/assets/check-missing` and `/pages/assets/upload` reject (8000013) — the wrangler Pages direct-upload flow is dead for this auth scheme.
- Uploading assets via the Workers assets-upload-session and referencing them in a Pages deployment manifest serves 500s — Pages cannot see the Workers asset store. Only `_worker.js` (the proxy) works this way because Pages Functions load it from that store.
- `PUT`ing a version directly to the backing worker `pages-worker--16090577-production` succeeds but receives no `pages.dev` traffic — Pages pins traffic to its canonical Pages deployment.
- Creating ANY Pages deployment makes it live instantly, including a broken one. Always have the previous deployment ID ready for rollback.
- 2026-07-28 UPDATE: `api.workers.cloudflare.com` STILL 522s on every path/port — now confirmed from 5 independent networks (sandbox, web-fetch tool, codetabs proxy, allorigins EU, and a Cloudflare-Worker-based proxy which timed out entirely), so this IS Cloudflare-side, not our egress. Verified dead ends, do not retry: `--resolve` to other Cloudflare anycast IPs → 403/1034 (edge IP restricted, zones pinned to anycast ranges); the same upload path on `api.cloudflare.com` → 401 (cfwau_ JWT rejected there); `/pages/assets/check-missing` + `/pages/assets/upload` with the real account API token → 8000013 (they only accept the Pages upload-token JWT, which is itself rejected — that whole flow is dead); `PUT /workers/scripts/*` → 10405 for this auth scheme; the account has NO workers.dev subdomain, so no relay Worker can be stood up. 2026-07-28 ~18:20Z: the GitHub Actions relay was BUILT AND RUN (workflow on relay-upload, dispatched via REST; run 30350096809) — Azure runners get **522 too** (probe and upload both; response body 'error code: 522'). SIX networks across multiple continents all 522: this is a genuine global outage of `api.workers.cloudflare.com`, unlisted on cloudflarestatus.com. NO network relay can help. Only paths: (1) wait for Cloudflare — a cron job in the user's Kimi chat retries every 2h from the sandbox and completes the whole deploy automatically; (2) the account owner reports the outage to Cloudflare (support ticket / community forum) to get it acknowledged; (3) user runs the upload curl from their own machine (near-zero odds given 6 networks, but free).
- 2026-07-26: `api.workers.cloudflare.com` (the asset-upload host) returned persistent HTTP 522s for 2+ days across sessions — even `GET /` 522s, while `api.cloudflare.com` works fine and the status page shows no Workers incident. If the upload step 522s, don't burn tokens on tight retry loops: schedule a retry for later (e.g., cron reminder) and do other work meanwhile. The upload-session JWT expires 1 hour after issuance — mint a fresh one each retry round.

### In-flight deploy (2026-07-28) — READ FIRST

A complete rebuild is ready but NOT yet live:

- website_version_manager version **9e43e10** ("Thai RPG offline-image fix rebuild", type static): master code (offline-image fixes) + bundled fallbacks overlaid from the live site (`episodes.json` 35KB, `vocab_items.json` 75KB, `icon-512x512.png` 940KB) + `CACHE_NAME` `thai-rpg-2026-07-28-01`. `node src/test/test.mjs`: 44/44 pass. **IMPORTANT: those 3 files are NOT in git** — master's `public/` has only tiny fixtures and an EMPTY `vocab_items.json`. Overlay procedure: download them from `https://thai-rpg.pages.dev/{episodes.json,vocab_items.json,icon-512x512.png}` into `public/` before building.
- The kimi.page deploy `y4um3s6faazh4.kimi.page` (previous agent) is INCOMPLETE — `/episodes.json` and `/icon-512x512.png` return 404 there (built from git `public/` only). Do NOT point the proxy at it.
- Preview URL (user provided): **https://z4vwnuwfhj43i.kimi.page** — verified complete. `_worker.js` hash `8a6fe1b27a9a7ef9118f9678653cdd4a`, size 387 (base64 in sandbox at /mnt/agents/output/deploy/worker.b64).
- Blocked: `api.workers.cloudflare.com` GLOBAL 522 outage (see pitfalls — even Azure/GitHub Actions 522s; relay scaffolding deleted after proving this). Cron retries every 2h from the sandbox; runbook + `_worker.js` + `worker.b64` in `/mnt/agents/output/deploy/STATE.md`.
- If a bad deployment ever goes live, roll back to deployment `bdb9ff79-4f62-4c10-bc14-89ef093f6c88` (live as of 2026-07-28).
- When deployed: delete the cron job, delete this section, delete the GitHub branch `relay-upload`.

### Deployment Checklist

1. Bump SW cache version in `app/public/sw.js`
2. `npm install && npm run build` — zero errors
3. `mshtools-website_version_manager` `build_version` (`type: "static"`) → get the `*.kimi.page` preview URL from the version card
4. Update proxy `_worker.js` with the new URL and deploy via the 5-step Cloudflare procedure above
5. Verify live site (sw.js CACHE_NAME, bundle 200, icon 200); roll back on failure
6. Push to GitHub master

***

## Common Bugs and Their Fixes

### Broken images after app backgrounding (mobile) — FULL root cause chain (2026-07-19)

This bug kept "being fixed" and coming back because there were FOUR stacked causes. All four are now fixed and covered by Playwright tests (`src/test/test-offline-images.mjs` — start with this one).

**Cause 1 — Prefetch races SW control, then lies about it.** `prefetchImages()` fired right after content load without ensuring the page was SW-controlled. On first visits / slow SW startup / SW restarts, the image fetches bypassed the SW entirely (never cached), yet the log claimed "Prefetched 20/20" — it only counted fetch resolutions, and the SW's offline 503 responses also RESOLVE fetches, so even offline prefetches logged success. **Never trust a prefetch log; verify cache membership via the Cache API.**

**Cause 2 — Cache gaps are permanent.** Aborted navigations, flaky network, and eviction leave some images uncached; nothing ever re-checked. The user's device had 21/27 images cached for weeks; the missing ones (narrator.png, khrueang_market.png) broke whenever an offline line referenced them. **Fix: verify-and-repair loop** — `ensureImagesCached()` in Store.tsx runs on content load, on `online`, and on every foreground return; it does a cheap gap check and re-caches missing images via the SW's `CACHE_URLS` message handler.

**Cause 3 — `Vary: Origin` makes cached entries invisible to other request kinds.** The CMS sends `Vary: Origin`. Cache matching compares the REQUEST's Origin header: `<img crossorigin>` requests carry Origin, page `cache.match(url)` string lookups carry none, SW-constructed `new Request(url)` carry none. An entry written via one path is a MISS for the others — images that ARE in the cache still 503 offline. **Fix: strip `Vary` when writing (`stripVaryHeader` in sw.js), match with `{ignoreVary: true}` when reading (both sw.js and Store's verification).**

**Cause 4 (previously fixed) — old caches deleted on activate.** Stay vigilant: never delete old caches on activate; `findInAnyCache()` searches all `thai-rpg*` caches and migrates hits into the current one.

**Repo archaeology worth knowing**: commit 2b0c7d3 ("Merge fubar + image cache retry fix") was NOT a real merge — it took fubar's controller/View but kept the OLD 175-line Store.tsx, silently dropping fubar's 992-line Store (content loading for episodes/characters/places, image prefetch). The production app was deployed from an uncommitted hybrid tree (fubar Store + fubar controller + master View + master sw.js). On 2026-07-19 the fubar Store/controller/types were restored onto master, so master now matches production again. Fubar's user-journey tests (`src/test/test-*.mjs`) were also restored; `test-bugs.mjs` (SM-2 preview: expected 50d got 40d) and `test-episode-flow.mjs` (outcome stage_directions array) were ALREADY failing on fubar's controller before this fix — pre-existing, not regressions.

**Offline test harness** (`src/test/`): `cms-mirror.py` serves a local copy of the CMS with failure injection (`/__control__?block=a.png,b.png`, `?offline=1`) — this fails fetches for BOTH page and SW, which Playwright's `route.abort` CANNOT do (Playwright does not intercept SW-initiated fetches, and its offline emulation behaves differently from real airplane mode). Populate the mirror from the live CMS (download the 6 JSONs + all `picture` images), serve `dist/` on :8088 and the mirror on :9001, then run `node src/test/test-offline-images.mjs` (full user journey), `test-first-visit.mjs` (prefetch/SW race), `test-legacy-cache.mjs` (old-cache compat). Seed `cmsBaseUrl` via `addInitScript` into `thai-rpg-state`.

### "[None]" dialogue when offline

**Cause**: Service Worker served stale cached JS. The old bundle didn't have `normalizeLine()`.
**Fix**: Bumped `CACHE_NAME` in `sw.js`. The controller fix (`normalizeLine()`) was already correct — it just wasn't reaching users because of stale SW cache.

### Counter bugs (new/due/done)

**Cause**: `isFirstAttemptedToday(stats, today)` used heuristic `repetitions <= 1`. After "again" (rep=0) then "good" (rep=1), due cards were misclassified as "new".
**Fix**: Replaced with explicit `newCardsRatedToday` counter, incremented in `onRateCard` when `lastReviewed === null` (truly new card).

### Episode selection picks episodes with no due cards

**Cause**: `getNextEpisode` only checked first act's tag and returned least-played. It didn't consider how many due cards the episode reviews.
**Fix**: v2 algorithm — `countDueCardsInEpisode()` prioritizes episodes with most due cards, excludes `episodesPlayedToday`.

### Front/back card mismatch

**Cause**: `getProps` recomputed the card on every render. Opening settings drawer triggered re-render → different card.
**Fix**: `vocabReviewCardId` in state — card is locked when entering `vocab_review`, only changes after rating.

***

## Important Lessons Learned

1. **Always use realistic test data**: Include CMS corruption (`[None]` dialogue, wrong characters) in tests. Perfect synthetic data misses real-world bugs.
2. **Always run ALL tests before shipping**: A test for feature A can catch regressions in feature B.
3. **Bump SW cache on every deploy**: Static `CACHE_NAME` means browsers never get new JS. The cache name must change.
4. **Don't fix data, fix code**: CMS data is messy and will stay messy. Handle it at render time with `normalizeLine()`.
5. **No unit tests, only user journey tests**: The project tests by simulating handlers and asserting `getProps`. This catches integration issues that unit tests miss.
6. **Unified code paths**: Episode selection and diagnostic displays must share the same functions (`getNextEpisode`, `countDueCardsInEpisode`). If they diverge, diagnostics lie.
7. **SW cache: never delete old caches on activate**: Deleting old caches before the new cache is populated breaks offline images. Search all caches and migrate entries in background.
8. **Reproduce before fixing**: The broken images bug had a partial fix (retry on visibilitychange) that masked the real issue. Only a full Playwright reproduction revealed that old caches were being deleted.
9. **`<img crossorigin="anonymous">` creates CORS-mode requests**: The SW must handle CORS responses properly. Opaque responses (status 0) from no-cors fetches are cacheable but may not display with `crossorigin="anonymous"`.
10. **`Vary: Origin` breaks Cache API matching across request kinds**: `<img crossorigin>` (Origin present), `cache.match(url)` (no Origin), and SW-built `new Request(url)` (no Origin) are three different cache keys when the response has `Vary: Origin`. Strip `Vary` on write AND use `ignoreVary` on read.
11. **Playwright cannot intercept service-worker fetches**: `context.route()` and `setOffline()` do not affect requests the SW makes itself, and emulation differs from real airplane mode. For faithful offline tests, run a local origin you can actually kill (see `cms-mirror.py`).
12. **Verify, don't log**: any "prefetch succeeded" claim must be backed by a Cache API membership check. A `fetch()` that resolves is not evidence of caching — the SW's offline 503 also resolves.
13. **Merges can silently drop files**: 2b0c7d3 dropped fubar's Store.tsx and master shipped a broken hybrid for weeks. After any merge, diff the tree against BOTH parents and against what's actually deployed.

***

## User's Feature Requests & Priorities

* **Vocab learning**: Core feature — SM-2 spaced repetition, thai-eng + eng-thai cards
* **Episode narrative**: RPG story with acts, choices, consequences
* **Offline-first**: Works without network via Service Worker + Cache API
* **Diagnostics**: Due date, act tag, episode selection info visible in UI
* **Subplot scores**: Choices affect story branches
* **Skill checks**: Choices should have difficulty and risk of failure
* **PWA**: Installable, works offline, updates via SW
