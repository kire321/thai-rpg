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

**Deployment method** (verified working):
1. **Build**: `cd app && npm run build` — must succeed with zero errors.
2. **Deploy static files**: Use `mshtools-deploy_website` tool with `type: "static"` and `local_dir` pointing to `app/dist`. This uploads all built assets.
3. **Proxy to Cloudflare Pages**: The Cloudflare Pages project uses a `_worker.js` that proxies requests to the deploy_website URL. To update:
   - Use Cloudflare MCP `execute` to create a new deployment with updated `_worker.js`
   - The worker script: `export default { async fetch(request) { const url = new URL(request.url); const target = 'https://<deploy-url>.kimi.page' + url.pathname + url.search; return fetch(new Request(target, {method: request.method, headers: request.headers, body: request.body, redirect: 'follow'})); } };`
4. **Bump SW cache version**: Edit `app/public/sw.js` — change `CACHE_NAME` and update `BUILD_VERSION` comment.
5. **Push code**: Use GitHub MCP to push changes to the `master` branch.

**Alternative**: If the proxy worker approach is problematic, you can deploy files directly to Cloudflare Pages using the MCP `execute` tool with `rawBody: true` and a multipart form-data body. However, binary files (PNG) are difficult to upload this way — the proxy approach is more reliable.

### Deployment Checklist

1. Bump SW cache version in `app/public/sw.js`
2. `npm run build` — zero errors
3. `mshtools-deploy_website` to deploy static files
4. Update proxy worker via Cloudflare MCP if the deploy URL changed
5. Push to GitHub master

***

## Common Bugs and Their Fixes

### Broken images after app backgrounding (mobile)

**Cause**: `CachedImage` rendered a permanent `<div>` placeholder when `onError` fired. The `visibilitychange` handler tried to retry `<img>` elements, but failed images were replaced with `<div>` placeholders — so the handler could never find them to retry.
**Fix**: `CachedImage` now listens for a custom `'thai-rpg-retry-images'` event dispatched on `visibilitychange`. Failed images reset `loadFailed` state and remount with a new `key`. Added `ImageCacheDiagnostics` component in Settings drawer for debugging.

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

***

## User's Feature Requests & Priorities

* **Vocab learning**: Core feature — SM-2 spaced repetition, thai-eng + eng-thai cards
* **Episode narrative**: RPG story with acts, choices, consequences
* **Offline-first**: Works without network via Service Worker + Cache API
* **Diagnostics**: Due date, act tag, episode selection info visible in UI
* **Subplot scores**: Choices affect story branches
* **Skill checks**: Choices should have difficulty and risk of failure
* **PWA**: Installable, works offline, updates via SW
