// test-blank-screen-repro.mjs — Reproduce exact scenario: loaded content → offline → refresh
// Simulates the Store.tsx loadAllContent logic with mocks

// Mock localStorage
const mockStorage = new Map();
const localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, val),
  removeItem: (key) => mockStorage.delete(key),
};

// Mock fetch that fails (simulating offline after "check for updates")
const fetch = async (url, opts) => {
  throw new Error('Failed to fetch'); // Simulating offline
};

// Simulate loadState
function loadState() {
  try {
    const saved = localStorage.getItem('thai-rpg-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      delete parsed.cachedContent;
      return parsed;
    }
  } catch (e) {}
  return { pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0, cmsBaseUrl: 'https://ipozfyeyt26ay.kimi.page', toast: null };
}

// Simulate fetchFromCMS (simplified version matching Store.tsx)
async function fetchFromCMS(filename, cmsBaseUrl) {
  const cacheKey = `thai-rpg-cms-${filename}`;

  // Try CMS first
  try {
    const response = await fetch(`${cmsBaseUrl}/${filename}?t=${Date.now()}`);
    if (response.ok) {
      const data = await response.json();
      const isEmpty = (d) => {
        if (Array.isArray(d)) return d.length === 0;
        if (typeof d === 'object' && d !== null) return Object.keys(d).length === 0;
        return !d;
      };
      if (!isEmpty(data)) {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
        return { data, fromCache: false };
      }
    }
  } catch (e) {
    // Offline
  }

  // Fallback to localStorage cache
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.data) return { data: parsed.data, fromCache: true };
      return { data: parsed, fromCache: true };
    }
  } catch (e) {}

  return { data: null, fromCache: true };
}

// Simulate loadAllContent core logic
async function loadAllContent(state) {
  const filenames = ['vocab_items.json', 'episodes.json', 'characters.json', 'places.json', 'subplots.json', 'tags.json'];
  const results = await Promise.all(filenames.map(f => fetchFromCMS(f, state.cmsBaseUrl)));

  const cachedFiles = [];
  let vocabItems = results[0].data;
  if (results[0].fromCache) cachedFiles.push('vocabulary');
  let episodes = results[1].data;
  if (results[1].fromCache) cachedFiles.push('episodes');
  let characters = results[2].data;
  if (results[2].fromCache) cachedFiles.push('characters');
  let places = results[3].data;
  if (results[3].fromCache) cachedFiles.push('places');
  let subplots = results[4].data;
  if (results[4].fromCache) cachedFiles.push('subplots');
  let tags = results[5].data;
  if (results[5].fromCache) cachedFiles.push('tags');

  // Fallback to existing state
  const existing = loadState();
  if (!vocabItems) vocabItems = state.vocabItems || existing.vocabItems;
  if (!episodes)   episodes   = state.episodes   || existing.episodes;
  if (!characters) characters = state.characters || existing.characters;
  if (!places)     places     = state.places     || existing.places;
  if (!subplots)   subplots   = state.subplots   || existing.subplots;
  if (!tags)       tags       = state.tags       || existing.tags;

  // Check if we have essential data
  if (!vocabItems || !episodes) {
    return { isLoading: false, loadError: 'Failed to load content. No cached data available.', toast: null };
  }

  return {
    isLoading: false,
    loadError: null,
    vocabItems,
    episodes,
    characters,
    places,
    subplots,
    tags,
    toast: cachedFiles.length > 0
      ? `Failed to refresh ${cachedFiles.join(', ')}. Using cached content.`
      : null,
  };
}

// ============ TESTS ============

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}
function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `Expected ${expected}, got ${actual}`);
}
function runTest(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
  }
}

// SCENARIO 1: Content loaded, then offline refresh
// User loaded app online. Content is in localStorage.
// User taps "check for updates" (reloads page).
// User disables wifi, refreshes again.
// The app should use cached content, NOT show "No cached data available."

runTest('Scenario1_GivenContentInLocalStorage_WhenOfflineRefresh_ThenLoadsFromCache', async () => {
  // Step 1: Simulate first online load — content saved to localStorage
  const initialState = {
    pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0,
    cmsBaseUrl: 'https://ipozfyeyt26ay.kimi.page',
    vocabItems: [{ id: 'v1', thai: 'สวัสดี', english: 'hello' }],
    episodes: [{ id: 'ep_001', title: 'Test', acts: [] }],
    characters: { char_test: { id: 'char_test', name: 'Test' } },
    places: { place_test: { id: 'place_test', name: 'Place' } },
    subplots: {},
    tags: { tag_001: ['v1'] },
    cards: [{ id: 'card-v1', vocabId: 'v1', direction: 'eng-thai', front: 'hello', back: 'สวัสดี' }],
    cardStats: {},
    isLoading: false,
    loadError: null,
  };

  // Save to localStorage (simulating componentDidUpdate)
  localStorage.setItem('thai-rpg-state', JSON.stringify(initialState));

  // Also save CMS cache (simulating fetchFromCMS success)
  localStorage.setItem('thai-rpg-cms-vocab_items.json', JSON.stringify({ timestamp: Date.now(), data: initialState.vocabItems }));
  localStorage.setItem('thai-rpg-cms-episodes.json', JSON.stringify({ timestamp: Date.now(), data: initialState.episodes }));

  // Step 2: Simulate offline refresh — constructor loads from localStorage
  const constructorState = { ...loadState(), isLoading: true, loadError: null };

  assert(constructorState.vocabItems !== undefined, 'Constructor should have vocabItems from localStorage');
  assert(Array.isArray(constructorState.vocabItems), 'vocabItems should be an array');
  assertEqual(constructorState.vocabItems.length, 1, 'vocabItems should have 1 item');

  // Step 3: Simulate loadAllContent while offline
  const updates = await loadAllContent(constructorState);

  // CRITICAL: Should NOT show "No cached data available"
  assert(updates.loadError === null, `Should NOT have loadError. Got: ${updates.loadError}`);
  assert(updates.isLoading === false, 'Should not be loading');
  assert(updates.vocabItems !== null, 'Should have vocabItems');
  assert(updates.episodes !== null, 'Should have episodes');
  assert(updates.toast !== null, 'Should show toast about using cached content');
  assert(updates.toast.includes('Using cached content'), `Toast should mention cache. Got: ${updates.toast}`);
});

// SCENARIO 2: NO content in localStorage, offline — should show error
runTest('Scenario2_GivenNoContent_WhenOffline_ThenShowsError', async () => {
  // Clear all localStorage
  mockStorage.clear();

  const constructorState = { ...loadState(), isLoading: true, loadError: null };

  const updates = await loadAllContent(constructorState);

  assertEqual(updates.loadError, 'Failed to load content. No cached data available.', 'Should show error when no cache');
});

// SCENARIO 3: CMS cache exists but app state lost — should still work
runTest('Scenario3_GivenOnlyCMSCache_WhenOffline_ThenLoadsFromCMSCache', async () => {
  mockStorage.clear();

  // Only CMS cache exists (app state was cleared, but per-file cache remains)
  const vocabData = [{ id: 'v1', thai: 'สวัสดี', english: 'hello' }];
  const epData = [{ id: 'ep_001', title: 'Test', acts: [] }];
  localStorage.setItem('thai-rpg-cms-vocab_items.json', JSON.stringify({ data: vocabData }));
  localStorage.setItem('thai-rpg-cms-episodes.json', JSON.stringify({ data: epData }));

  const constructorState = { ...loadState(), isLoading: true, loadError: null };

  const updates = await loadAllContent(constructorState);

  assert(updates.loadError === null, `Should NOT have loadError. Got: ${updates.loadError}`);
  assert(updates.vocabItems !== null, 'Should have vocabItems from CMS cache');
  assert(updates.episodes !== null, 'Should have episodes from CMS cache');
});

// SCENARIO 4: The exact user bug — content loaded, "check for updates", offline, refresh
// After "check for updates" reload, the page fetches fresh content.
// Then offline refresh should use the saved state.
runTest('Scenario4_GivenContentLoadedThenReloaded_WhenOfflineRefresh_ThenLoadsFromSavedState', async () => {
  mockStorage.clear();

  // Simulate: user loaded app, content saved
  const savedState = {
    pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0,
    cmsBaseUrl: 'https://ipozfyeyt26ay.kimi.page',
    vocabItems: [{ id: '402-1.', thai: 'มีเรื่องจะบอก(นะ)', english: 'I have something to tell you.' }],
    episodes: [{ id: 'ep_001', title: 'The Resonance Route', acts: [{ id: 'act_1', title: 'The Signal', lines_before: [], tag: 'tag_008', lines_after: [], decision: { line: { dialogue: 'Choose.', character: null, place: null, stage_directions: [] }, choices: [] } }] }],
    characters: { char_narrator: { id: 'char_narrator', name: 'Narrator' } },
    places: { place_ship: { id: 'place_ship', name: 'Ship' } },
    subplots: { subplot_freq: { id: 'subplot_freq', name: 'Frequency Map' } },
    tags: { tag_008: ['402-1.'] },
    cards: [{ id: 'card-402-1.-eng-thai', vocabId: '402-1.', direction: 'eng-thai', front: 'I have something to tell you.', back: 'มีเรื่องจะบอก(นะ)' }],
    cardStats: {},
    isLoading: false,
    loadError: null,
  };
  localStorage.setItem('thai-rpg-state', JSON.stringify(savedState));

  // User taps "Check for updates" → page reloads
  // New Store constructor:
  const constructorState = { ...loadState(), isLoading: true, loadError: null };

  // Verify constructor has the saved content
  assert(constructorState.vocabItems !== undefined, 'Constructor should have vocabItems after reload');
  assert(constructorState.episodes !== undefined, 'Constructor should have episodes after reload');
  assert(Array.isArray(constructorState.vocabItems), 'vocabItems should be array');

  // User now disables wifi and refreshes
  // loadAllContent runs while offline
  const updates = await loadAllContent(constructorState);

  // SHOULD NOT show "No cached data available"
  assert(updates.loadError === null, `CRITICAL BUG: loadError should be null but got: ${updates.loadError}`);
  assert(updates.vocabItems !== null, 'Should have vocabItems');
  assert(updates.episodes !== null, 'Should have episodes');
  assert(updates.toast !== null, 'Should show toast');
});

// Run all async tests
(async () => {
  await runTest('Scenario1_GivenContentInLocalStorage_WhenOfflineRefresh_ThenLoadsFromCache',
    async () => {
      const initialState = {
        pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0,
        cmsBaseUrl: 'https://ipozfyeyt26ay.kimi.page',
        vocabItems: [{ id: 'v1', thai: 'สวัสดี', english: 'hello' }],
        episodes: [{ id: 'ep_001', title: 'Test', acts: [] }],
        characters: { char_test: { id: 'char_test', name: 'Test' } },
        places: { place_test: { id: 'place_test', name: 'Place' } },
        subplots: {},
        tags: { tag_001: ['v1'] },
        cards: [{ id: 'card-v1', vocabId: 'v1', direction: 'eng-thai', front: 'hello', back: 'สวัสดี' }],
        cardStats: {},
        isLoading: false,
        loadError: null,
      };
      localStorage.setItem('thai-rpg-state', JSON.stringify(initialState));
      localStorage.setItem('thai-rpg-cms-vocab_items.json', JSON.stringify({ timestamp: Date.now(), data: initialState.vocabItems }));
      localStorage.setItem('thai-rpg-cms-episodes.json', JSON.stringify({ timestamp: Date.now(), data: initialState.episodes }));

      const constructorState = { ...loadState(), isLoading: true, loadError: null };
      assert(constructorState.vocabItems !== undefined);
      assert(Array.isArray(constructorState.vocabItems));
      assertEqual(constructorState.vocabItems.length, 1);

      const updates = await loadAllContent(constructorState);
      assert(updates.loadError === null, `Should NOT have loadError. Got: ${updates.loadError}`);
      assert(updates.isLoading === false);
      assert(updates.vocabItems !== null);
      assert(updates.episodes !== null);
      assert(updates.toast !== null);
      assert(updates.toast.includes('Using cached content'));
    });

  await runTest('Scenario2_GivenNoContent_WhenOffline_ThenShowsError',
    async () => {
      mockStorage.clear();
      const constructorState = { ...loadState(), isLoading: true, loadError: null };
      const updates = await loadAllContent(constructorState);
      assertEqual(updates.loadError, 'Failed to load content. No cached data available.');
    });

  await runTest('Scenario3_GivenOnlyCMSCache_WhenOffline_ThenLoadsFromCMSCache',
    async () => {
      mockStorage.clear();
      const vocabData = [{ id: 'v1', thai: 'สวัสดี', english: 'hello' }];
      const epData = [{ id: 'ep_001', title: 'Test', acts: [] }];
      localStorage.setItem('thai-rpg-cms-vocab_items.json', JSON.stringify({ data: vocabData }));
      localStorage.setItem('thai-rpg-cms-episodes.json', JSON.stringify({ data: epData }));

      const constructorState = { ...loadState(), isLoading: true, loadError: null };
      const updates = await loadAllContent(constructorState);
      assert(updates.loadError === null, `Should NOT have loadError. Got: ${updates.loadError}`);
      assert(updates.vocabItems !== null);
      assert(updates.episodes !== null);
    });

  await runTest('Scenario4_GivenContentLoadedThenReloaded_WhenOfflineRefresh_ThenLoadsFromSavedState',
    async () => {
      mockStorage.clear();
      const savedState = {
        pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0,
        cmsBaseUrl: 'https://ipozfyeyt26ay.kimi.page',
        vocabItems: [{ id: '402-1.', thai: 'มีเรื่องจะบอก(นะ)', english: 'I have something to tell you.' }],
        episodes: [{ id: 'ep_001', title: 'The Resonance Route', acts: [{ id: 'act_1', title: 'The Signal', lines_before: [], tag: 'tag_008', lines_after: [], decision: { line: { dialogue: 'Choose.', character: null, place: null, stage_directions: [] }, choices: [] } }] }],
        characters: { char_narrator: { id: 'char_narrator', name: 'Narrator' } },
        places: { place_ship: { id: 'place_ship', name: 'Ship' } },
        subplots: { subplot_freq: { id: 'subplot_freq', name: 'Frequency Map' } },
        tags: { tag_008: ['402-1.'] },
        cards: [{ id: 'card-402-1.-eng-thai', vocabId: '402-1.', direction: 'eng-thai', front: 'I have something to tell you.', back: 'มีเรื่องจะบอก(นะ)' }],
        cardStats: {},
        isLoading: false,
        loadError: null,
      };
      localStorage.setItem('thai-rpg-state', JSON.stringify(savedState));

      const constructorState = { ...loadState(), isLoading: true, loadError: null };
      assert(constructorState.vocabItems !== undefined);
      assert(constructorState.episodes !== undefined);
      assert(Array.isArray(constructorState.vocabItems));

      const updates = await loadAllContent(constructorState);
      assert(updates.loadError === null, `CRITICAL BUG: loadError should be null but got: ${updates.loadError}`);
      assert(updates.vocabItems !== null);
      assert(updates.episodes !== null);
      assert(updates.toast !== null);
    });

  console.log('\n' + '='.repeat(60));
  console.log(`Tests run: ${testsRun}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    console.log('\nAll blank-screen reproduction tests passed! ✓');
    process.exit(0);
  }
})();
