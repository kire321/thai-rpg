# Thai RPG PWA — Frontend Agent Skill

> **SELF-UPDATE RULE**: Every agent working on this project MUST update this skill file before finishing. Add anything you learned, any user instructions given, any tricky bugs found, and any deployment changes. Think of this file as the project's collective memory — the next agent starts fresh with only this file and the code. Delete outdated info. This rule applies to YOU right now — update this file before you finish your task.


**2026-10-22 (episodesPlayedToday never expired → episode selection collapsed into due-blind fallback)**:

- **Symptom (user report)**: 4 episodes played, 32 quiz opportunities, only ~10 quizzes; most quizzes in the first episode before the overpressure valve kicked in, then 1-2 quizzes per episode. User asked to investigate whether segments broke prioritization (theory 1) or the design was weak (theory 2).
- **Finding 1 — the 2026-10-20 bug-4 fix IS live and working** (deployed CACHE_NAME `thai-rpg-2026-10-20-01` matches master; simulated playthrough of the user's exported state with current master picks due episodes, e.g. ep_151 with tag_178). The user's session largely predated that deploy — their state shows only 7 cards EVER rated (`cardStats` has 7 entries of 680 cards) because pre-fix selection always fell back to least-played → no due tags → overpressure valve skipped everything. That history also explains the thin due landscape.
- **Finding 2 — real remaining bug: `episodesPlayedToday` had NO day stamp and was never reset** (unlike `newCardsRatedToday`/`newCardsRatedTodayDay`). The list grew forever; the user's export had 12 entries spanning multiple days. Stale entries permanently excluded ever-more episodes from the candidate pool until selection always landed in the due-blind least-played fallback (which ignores due-ness entirely). Worse, the user's BEST episode (ep_011, 5 due cards) was blacklisted.
- **Fix**: read-side day check, same pattern as `newCardsRatedToday`: new helper `getEpisodesPlayedToday(state, env)` returns `[]` when `episodesPlayedTodayDay` is missing (legacy/exported states) or ≠ today; all writers (`advancePastLinesAfter`, `onTapNextScenario`, `onOutcomeDone`, `onIncrementDateshift`) stamp `episodesPlayedTodayDay` and build the list from the day-checked helper, so a legacy list self-heals (stale entries dropped) on first write. Readers (`getNextEpisode`, `getNextEpisodeInfo`) use the helper. `onConfirmReset` intentionally untouched.
- **Tests**: 2 new in `src/test/test.mjs` (59 total, all passing): stale/legacy played-today must not exclude the due episode (control: same-day stamp still excludes), and writer self-heal (legacy list → only current episode, day stamped).
- **Analysis method that worked**: parse the exported `state-*.md` (plain JSON) in node, import the REAL controller (`getNextEpisode`, `countDueCardsInEpisode`, `getTotalVirtualActs` are all exported), then simulate full playthroughs by calling `Handlers.onStartEpisode`/`onTapNextLine`/`onRateCard` in a loop — counts quizzes vs opportunities per episode with zero fixture drift. Script pattern saved at the analysis step; re-create from this description if needed.
- **e2e suites all pass** after CACHE_NAME bump to `thai-rpg-2026-10-22-01`.
- **Design weaknesses NOT fixed (user asked for suggestions first)**: (a) selection anchors on ONE most-overdue card's tags + FIRST act only — ep_011 with 5 due cards loses to a 2-due episode whose first act happens to match the again card's tag; (b) `countDueCardsInEpisode` counts only previously-reviewed cards, so with a young deck the ranking signal is ~0-2 everywhere; (c) the overpressure valve hard-skips new cards whenever due>0, so quiz frequency collapses to the due-backlog size (≈7 cards/day) instead of mixing in new cards.
- **Playwright setup note**: headless shell symlink path is `~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell` (`-linux64`, not `-64`) — playwright resolves that exact path; wrong dir name fails launch with "Executable doesn't exist".

**2026-10-20 (4-bug batch: segmented-act line duplication, blank outcome, drawer pull-to-refresh, episode selection ignoring segmented acts)**:

- **Bug 1 — "the three lines repeat before the second vocab review"**: `getVirtualAct` gave EVERY virtual act `lines_after` = narrative until the next tag — but that narrative is the NEXT virtual act's `lines_before`, so mid-act narrative played twice. Fix: only the LAST virtual act of a segmented act gets `lines_after` (trailing narrative to act end); others get `[]`. Companion fix: `advancePastLinesAfter(state, env)` helper (choice → next virtual act → episode complete, with proper `episodesPlayedToday` RETURN not in-place push) shared by `onTapNextLine` (lines_after branch AND the overpressure-skip path), `onVocabReviewDone`, and `onRateCard` — otherwise an act with empty lines_after lands the player on "No line to display".
- **Bug 2 — blank outcome card**: CMS `pass_outcome/fail_outcome.line` is a full LINE OBJECT; `onTapChoice` flattened it to `outcome.line.dialogue` (string) → `LineCard` read `.dialogue` off a string → blank card. Fix: store `normalizeLine(outcome.line)` (wrap legacy strings as `{dialogue}`); `getCurrentLine` outcome phase wraps legacy string `state.outcomeLine` for old exported states. CMS corruption pattern applies to outcome lines too (`[None]`/`char` fallbacks) — normalize, don't fix data.
- **Bug 3 — pulling the settings drawer down triggered native page refresh**: drawer had no overscroll containment and `onSwipeDownSettings` existed in the controller but was NEVER wired in the View. Fix in View.tsx `SettingsDrawer`: `overscroll-contain` on the panel (stops scroll chaining to the document), touch handlers (drag feedback via translateY, close via `onSwipeDown` = `getHandler('onSwipeDownSettings')` when pulled >80px from scrollTop 0), and `useEffect` setting `document.body.style.overscrollBehaviorY='none'; overflow='hidden'` while open (restored on close). Native pull-to-refresh still works when the drawer is closed, per user requirement. Note: native PTR can't be reproduced headlessly — covered by the controller handler test (`WhenISwipeDownSettingsCloses`) + manual device check.
- **Bug 4 — again-cards skipped next episode, every quiz skipped by overpressure valve. USER'S THEORY 1 CORRECT**: `getNextEpisode` step 3 checked `firstAct.tag` (flat field only); modern episodes are SEGMENTED (`act.tag === undefined`, tags in `act.segments`) → zero candidates → fallback to least-played → episode had no due-card tags → valve correctly skipped all quizzes. Fix: `getActTags(firstAct).some(t => matchingTags.includes(t))`. Verified against the user's exported state: with fix, selection picks e.g. ep_151 whose first act has tag_178 (an again card's tag). ALSO fixed: three `state.episodes.sort(...)` in-place mutations in `getNextEpisode` (mutates state inside a selector!) → `[...state.episodes].sort(...)`.
- **All 4 were CODE bugs, not CMS data bugs** — no CMS repo changes needed. The two texts that DO repeat in real content ("The choice is yours, Lek." as every act's decision prompt; "A boat nudges its post and settles." reused across acts) are data-level reuse, not flow bugs.
- **Tests**: 6 new tests in `src/test/test.mjs` (57 total, all passing): full-playthrough line-uniqueness test (collects every dialogue shown across a 2-tag segmented episode incl. choice/outcome phases — reproduces bug 1 exactly), outcome-object + corrupted-outcome + legacy-string-outcome tests, segmented-first-act episode-selection test (fallback episode has fewer plays but must NOT win), and a not-skipped-under-overpressure test. UPDATED 2 old tests that asserted `outcomeLine === 'Pass.'` (string contract) and the segmented-advance test (rating now advances straight past empty lines_after).
- **e2e suites all pass** (offline-images, first-visit, legacy-cache, image-version-cache) after CACHE_NAME bump to `thai-rpg-2026-10-20-01`.
- **Playwright setup notes**: full `playwright` package installed `--no-save` (not in package.json) + `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; chromium revision 1248 symlinks needed in TWO dirs — `chromium-1248/chrome-linux64/chrome` AND `chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell` (headless launch looks for the shell at that exact path) — plus `INSTALLATION_COMPLETE` markers. System chromium is `/usr/bin/chromium`.
- **CMS mirror gotcha**: on the deployed site, content images 404 at `/characters/x.png` — they live under **`/cms/characters/x.png`** (`picture` fields start with `/`, app prepends `cmsBaseUrl='/cms'`). When populating a mirror, download from `https://kire321.github.io/cms<picture>`. 48 pictures, ~4MB.
- **Exported state files** (`state-*.md` from "Export state") are plain JSON of the full state — parse directly to reproduce selection/flow bugs. `againQueue` + `cardStats.failedToday` identify the user's again cards; `episodesPlayedToday` matters for selection.

**2026-10-18 (image cache: version-tolerant serving + prune-after-verify — the "SW cache never updated" bug)**:
- **Symptom (user screenshots)**: fully offline device, 42 stale cached images (old pre-regen filenames like `chanida.png`), `narrator.png`/`grammar_mill.png` broken in BOTH unversioned and `?v=1792127212936` forms, SW stats all zeros, "retry pending" placeholders. Root causes: (1) the Oct-16 content regen renamed every image, so old-name entries were unreachable dead weight and the 2 new names were never cached (one transient prefetch failure = permanently broken offline, nothing ever re-checked); (2) `imageVersion` was bumped on EVERY fresh CMS read, orphaning every `?v=` entry and re-downloading all images on each launch; (3) the refresh path evicted entries BEFORE re-fetching, so a failed refresh left the cache EMPTY (worse than stale).
- **Fix (Store.tsx + sw.js)**: `imageVersion` bumps ONLY when `contentFingerprint(characters, places, tags)` (djb2, module-scope) changes — unchanged content keeps its stamp, zero re-downloads. sw.js `findInAnyCache` SERVES across `?v=` stamps (exact match, then `{ignoreVary, ignoreSearch}` fallback in current + legacy caches); the `CACHE_URLS` skip-check is the new query-SENSITIVE `findExactInAnyCache` (old variant present ≠ fresh version fetched). `pruneStaleImageVariants(currentUrls)` runs at the END of EVERY ensure pass — NOT gated on `contentChanged` (the bump pass usually can't download yet; gating on it meant stale variants NEVER got pruned) — and it deletes a superseded variant only when the EXACT current URL is already cached somewhere (interrupted refresh degrades to "serving old bytes", never "nothing"). Orphan paths (renamed away) are deleted unconditionally.
- **Prune bug that cost a day**: `currentByPath.set(pu.pathname, u)` stored the raw (relative) URL while `cache.keys()` returns absolute — every current entry mismatched and prune deleted the entire cache. Store `new URL(u, location.href).href`.
- **sw.js also caches any successful fetch on the fly** (generic fetch handler → `tryCachePut`), so rendering a screen self-heals gaps too, not just the ensure pass.
- **Store.waitForSWController timeout is 30s** (was 10s): on slow first installs the ensure used to give up and "direct prefetch" past the SW, caching nothing while logging success.
- **New user-journey test** `src/test/test-image-version-cache.mjs` (6 phases, same-origin harness below) replays the device state: v1 cache → regen with 2 unreachable images → online repair → offline with only old-variant entries (SW must serve old bytes for new stamps; truly-never-cached 503s) → online convergence (exactly the current 48, no stale variants) → unchanged-content stability (no churn). Run: `python3 src/test/test-origin-server.py 8089 dist /tmp/cms-mirror` + `node src/test/test-image-version-cache.mjs http://127.0.0.1:8089 /tmp/cms-mirror`.
- **`src/test/test-origin-server.py`** serves dist at `/` AND a writable CMS mirror at `/cms` (same origin → SW intercepts everything, the only faithful offline-image setup), with `/__control__?block=a.png,b.png|unblock=1|offline=1/0`. Mirror management: `installV1Content()` rewrites picture names to `v1_*` + copies files (models the rename regen); `installV2Content({touch})` restores pristine JSONs + optionally touches a name to change the fingerprint.
- **Content regen breaks image tests silently**: `khrueang_market.png` was REMOVED and `silent_zone.png` RENAMED to `silent_pond.png` in the Oct-16 batch. `test-offline-images.mjs` blocked khrueang → repair check failed on a file the app never requests; `test-legacy-cache.mjs` stored a 404 under the old name (`cache.put` stores ANY response). Both now use current names. **When an image-cache test fails weirdly, diff its hardcoded PNG names against live `/cms/{characters,places}.json` first.**
- **Test false-positive that masked a real miss**: `ks.some(k => k.includes('narrator.png'))` also matches `v1_narrator.png` orphans — require `/${name}` and exclude the `v1_` prefix. Similarly `'text=A, button:B'` does NOT union in Playwright (the `text=` engine swallows the comma — matches nothing); and a readiness check on "any #root content" passes on the LOADING screen, so a reload fires mid-fetch and aborts the first load. Wait for 'Start Episode' / a 'Next' button with `/loading/i` excluded.
- **Sandbox survival notes (2026-10-18 wipe)**: `/tmp` is wiped between turns AND `node_modules`/`dist` inside `/mnt/agents` were lost in a sandbox rebuild (project dir came back root-owned, non-git). npm scripts fail on the `/mnt/agents` mount (no exec bits) — run `node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build`; `node_modules` needs symlinks, so keep the working copy on `/tmp`. `pkill -f <pattern>` kills the invoking shell when the pattern appears in its own cmdline — kill by pidfile. The full `playwright` package runs via symlinks: `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` + `chromium_headless_shell-1248/.../chrome-headless-shell` → `/usr/bin/chromium`, plus `INSTALLATION_COMPLETE` marker files in both revision dirs (installed `--no-save`, not in package.json; older e2e tests import `playwright`, the new one imports `playwright-core`).
- **e2e servers**: app `python3 -m http.server 8088 --directory dist` + `python3 src/test/cms-mirror.py 9001 <mirror>` (cross-origin/CORS variant of the harness) for `test-offline-images/first-visit/legacy-cache.mjs`. `test-first-visit.mjs` must match with `{ignoreVary, ignoreSearch}` — entries are cached under stamped `?v=` URLs.

**2026-10-15 (content-refresh & scheme-alignment batch)**:
- **SUPERSEDED 2026-10-18 — the image-cache bullet below ("evicts all same-path cache entries before re-caching", bump on every fresh read) caused the "cache never updated" bug. Current design: fingerprint-gated bumps, serve-across-stamps, prune-after-verify. Kept for history only.**
- **Choice difficulty is a CMS STRING** (`'easy'|'medium'|'hard'`) — NOT a number. `onTapChoice` maps strings to rates {easy:0.85, medium:0.6, hard:0.35} (numbers 0|1|2 still accepted for backward compat); the View badge renders strings directly. Tests: `GivenEasyChoiceString_*`, `GivenHardChoiceString_*`, `GivenNumericDifficulty_*` in test.mjs. When writing new choice code, NEVER index into an array with `choice.difficulty`.
- **Bundled data JSONs REMOVED**: `public/{episodes,vocab_items,characters,places,tags,attributes}.json` are deleted and the local-file fallback in `Store.fetchFromCMS` is gone. Content now comes ONLY from the CMS (`/cms/*.json`) or the Cache API (`thai-rpg-content-v1`). Root-relative `*.json` fetches 404 by design — the CMS UI must keep fetching `/cms/*.json` (its old pitfall about hitting "the game's bundled fixture" is moot but the absolute-path rule stands).
- **Image cache invalidation on fresh content** (the "Chronicler still shows the old portrait" bug): the SW serves images cache-first and `CACHE_URLS` skips already-cached URLs, so a regenerated picture at the SAME path stayed stale forever. Fix in Store.tsx: `loadAllContent` detects any file fetched fresh from the CMS → bumps `state.imageVersion` → stamps every picture URL with `?v=<imageVersion>` (forces React to re-render with a new URL) and calls `ensureImagesCached(maps, forceRefresh=true)`, which evicts all same-path cache entries (`cache.delete(url, {ignoreSearch:true})`) before re-caching. Lesson: **any cache-first asset whose bytes can change under an unchanged URL needs versioned URLs + eviction on content refresh.**
- **Footer**: was `fixed bottom-12` (48px dead gap below it) — now `bottom-0`; container padding `pb-20` → `pb-14`. When adding fixed chrome, pin it flush and pad the scroll container by the chrome's actual height.
- Deployment section rewritten: GitHub Pages via the `kire321.github.io` publisher workflow is the ONLY deploy path (see SKILL-CMS.md §Deployment). Cloudflare/kimi.page instructions deleted.

## Project Overview

Thai RPG is a **Progressive Web App (PWA)** for learning Thai vocabulary through an interactive RPG adventure. Users read narrative episodes, review vocabulary cards (using SM-2 spaced repetition), and make story choices that affect attribute scores.

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
4. Deploy: push to master, dispatch the `kire321.github.io` publisher workflow, verify `https://kire321.github.io/` (see Deployment).
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

**2026-07-28 correction**: the Vite app lives at the REPO ROOT (`package.json`, `vite.config.ts`, `src/`, `public/`) — there is no `app/` folder. Controller tests: `node src/test/test.mjs` (48 tests, no browser). Playwright offline tests: `src/test/test-*.mjs` (need cms-mirror.py harness). The structure below is aspirational/outdated.

**2026-08-18 — segments JSON format merged from staging**: the `staging` branch's only useful feature was the "segments" episode format; everything else in the master↔staging diff was older/obsolete (staging had old SM-2 intervals, old episode-selection tiebreak, old image prefetch, kimi.page CMS base — do NOT resurrect any of it). Merged into master by hand-port (no git merge — the branches share no recent history):

- **Segments format**: an act may have `segments: [...]` instead of `lines_before/tag/lines_after`. Segments are `{type:'narrative', lines:[...]}` and `{type:'tag', tag:'tag_xxx'}` interleaved. Each tag segment yields one **virtual act**: its `lines_before` = narrative since the previous tag, `lines_after` = narrative until the next tag; only the LAST virtual act carries the act's `decision`. An act may also have `tags: string[]` (multi-tag, flat format).
- **Controller** (`src/controller/controller.js`): `getVirtualActCount` / `getTotalVirtualActs` / `getVirtualAct` / `getActAtIndex` / `getActTags` (all exported). `getCurrentAct` resolves through `getActAtIndex`, so `state.currentActIndex` is a VIRTUAL act index. `onTapNextLine` skips the choice phase for virtual acts with no decision (advances straight to the next virtual act); episode completion uses `getTotalVirtualActs`, not `episode.acts.length`. Quiz-card selection and the overpressure skip check collect vocab from ALL of an act's tags via `getActTags`.
- **Store** (`normalizeAct`): does NOT expand segments (controller does it on the fly — avoids double-normalization bugs with saved state), but DOES normalize `stage_directions` inside segment narrative lines.
- Tests: 4 segment tests at the bottom of `src/test/test.mjs` (search "SEGMENTED EPISODES").

## Directory Structure

```
app/src/
  controller/controller.js   — ALL business logic (handlers, getProps, SM-2, episode selection)
  model/Store.tsx            — React component: wires controller + View, loads CMS data
  view/View.tsx              — ALL UI components (pure, receives props from getProps)
  types/index.ts             — TypeScript type definitions
  components/ui/             — shadcn/ui components (auto-generated, don't modify)
app/public/
  sw.js                      — Service Worker (must bump CACHE_NAME on every deploy)
  icon-512x512.png, manifest.json — PWA shell assets
  (NO bundled data JSONs since 2026-10-15 — content comes only from the CMS
   at DEFAULT_CMS_BASE='/cms' or the Cache API; root-relative data fetches
   from the CMS UI therefore 404, which is the desired fail-loud behavior)
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
  attributeScores: { attributeId: score },

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
            pass_outcome: { attribute: 'main', delta: 1, line: 'Success!' },
            fail_outcome: { attribute: 'main', delta: -1, line: 'Failure!' },
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
6. **DEPLOY**: push to master and dispatch the GitHub Pages publisher workflow (see Deployment) — Cloudflare/kimi.page flow is obsolete.

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

### GitHub Pages (PRIMARY — 2026-07-30, canonical per SKILL-CMS.md)

The app is durably deployed at **`https://kire321.github.io/`** from repo `kire321/kire321.github.io` (master branch, legacy branch-based Pages — redeploys automatically on every push; no Pages API, no secrets, no Cloudflare, no kimi.page).

**Assembled by**: `.github/workflows/deploy-app.yml` in `kire321/kire321.github.io`. Each run: checks out `kire321/thai-rpg@master` + builds the game, copies `kire321/thai-rpg-content@master/public/` into the site folder `cms/`, builds the CMS editor UI from the content repo into `cms-ui/`, commits everything to master.

**Deploy procedure for frontend changes:**
1. Bump SW cache version in `public/sw.js` (`CACHE_NAME` + `BUILD_VERSION` comment).
2. `npm install && npm run build` — zero errors.
3. Push code to `thai-rpg` master.
4. Dispatch the publisher:
   ```
   curl -X POST -H "Authorization: Bearer <user's fine-grained PAT>" \
     https://api.github.com/repos/kire321/kire321.github.io/actions/workflows/deploy-app.yml/dispatches \
     -d '{"ref":"master"}'
   ```
   (or wait for the daily 04:23 UTC scheduled run).
5. Verify with cache-busters (GitHub Pages CDN caches 404s; expect ~1-2 min build lag): `https://kire321.github.io/sw.js?cb=$(date +%s)` shows the new CACHE_NAME; the JS bundle referenced by `index.html` returns 200; `/icon-512x512.png` 200; `/cms/episodes.json` 200.

**Pitfalls (verified live):**
- On a user Pages site (`*.github.io`), path `/<reponame>/` is RESERVED for that repo's project site — never put content in a repo-named folder.
- The old flow (kimi.page build + Cloudflare `_worker.js` proxy) is OBSOLETE: kimi.page URLs die with the agent instance that created them, and `api.workers.cloudflare.com` had a global HTTP 522 outage from 2026-07-26. Do not resurrect it. A `thai-rpg.pages.dev` proxy may still front the site as a plain passthrough to `kire321.github.io`.
- GitHub REST is reliable from the sandbox; shell git push is flaky (HTTP/2) — if push fails, retry or use the Contents/Trees APIs.

### Deployment Checklist

1. Bump SW cache version in `public/sw.js`
2. `npm install && npm run build` — zero errors
3. Push to `thai-rpg` master
4. Dispatch the publisher workflow (or wait for the 04:23 UTC run)
5. Verify `https://kire321.github.io/sw.js`, the bundle, and `/cms/episodes.json` with cache-busters

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
* **Attribute scores**: Choices affect story branches
* **Skill checks**: Choices should have difficulty and risk of failure
* **PWA**: Installable, works offline, updates via SW
