// test-blank-screen.mjs — Reproduction test for blank screen after check-for-updates + offline
// Scenario: user taps "Check for updates", then disables wifi and refreshes.
// Before fix: new index.html cached by SW references uncached JS bundles → blank screen
// After fix: SW never blindly caches new index.html; checkForUpdates just reloads;
//            app falls back to cache gracefully.

import { getProps, Handlers } from '../controller/controller.js';

const today = 19724;

const testEnv = {
  content: { pageTitles: ['Thai RPG'], vocabItems: [] },
  time: {
    getTimestamp: () => 1704067200000,
    getDayStart: () => 1704067200000,
    getDaysSinceEpoch: () => today,
  },
  loadContent: () => [],
  checkForUpdates: () => {},
  speakThai: (text) => {},
};

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

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
    failures.push({ name, error: error.message });
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
  }
}

// ============ REPRODUCTION TESTS ============

// Test 1: When loadAllContent can't get data, Store.render should show ErrorScreen not crash
runTest('GivenNoContent_WhenLoadFails_ThenGetPropsDoesNotCrash', () => {
  // State with NO content loaded yet (simulating post-refresh with empty cache)
  const state = {
    pageIndex: 0,
    isSettingsOpen: false,
    currentView: 'welcome',
    dateshift: 0,
    cmsBaseUrl: 'https://ipozfyeyt26ay.kimi.page',
    isLoading: false,
    loadError: 'Failed to load content. No cached data available.',
    vocabItems: undefined,
    episodes: undefined,
    cards: [],
    cardStats: {},
    cardQueue: [],
    againQueue: [],
    againDelayCounter: 0,
    episodePlays: {},
    subplotScores: {},
    showResetConfirm: false,
  };

  // getProps should NOT crash even with no content
  const props = getProps(state, testEnv);
  assert(props !== null, 'getProps should return something');
  assertEqual(props.currentView, 'welcome', 'Should be welcome view');
});

// Test 2: State with partial content (some cached) should still render
runTest('GivenPartialContent_WhenLoadFails_ThenGetPropsReturnsValidProps', () => {
  const state = {
    pageIndex: 0,
    isSettingsOpen: false,
    currentView: 'welcome',
    dateshift: 0,
    cmsBaseUrl: 'https://ipozfyeyt26ay.kimi.page',
    isLoading: false,
    loadError: null,
    vocabItems: [{ id: 'v1', thai: 'สวัสดี', english: 'hello' }],
    episodes: [{ id: 'ep_001', title: 'Test', acts: [] }],
    characters: { char_test: { id: 'char_test', name: 'Test' } },
    places: { place_test: { id: 'place_test', name: 'Test Place' } },
    subplots: {},
    tags: { tag_001: ['v1'] },
    cards: [{ id: 'card-v1', vocabId: 'v1', direction: 'eng-thai', front: 'hello', back: 'สวัสดี' }],
    cardStats: {},
    cardQueue: [],
    againQueue: [],
    againDelayCounter: 0,
    episodePlays: {},
    subplotScores: {},
    showResetConfirm: false,
  };

  const props = getProps(state, testEnv);
  assert(props !== null, 'getProps should return something');
  assertEqual(props.currentView, 'welcome', 'Should be welcome view');
  assertEqual(props.newCount, 10, 'New count should be 10 (default daily limit)');
});

// Test 3: When loadError is set, the view should show gear icon (not crash)
runTest('GivenLoadError_WhenGetProps_ThenShowGearIconAndCounters', () => {
  const state = {
    pageIndex: 0,
    isSettingsOpen: false,
    currentView: 'welcome',
    dateshift: 0,
    cmsBaseUrl: 'https://ipozfyeyt26ay.kimi.page',
    isLoading: false,
    loadError: 'Failed to load content. No cached data available.',
    vocabItems: undefined,
    episodes: undefined,
    cards: [],
    cardStats: {},
    cardQueue: [],
    againQueue: [],
    againDelayCounter: 0,
    episodePlays: {},
    subplotScores: {},
    showResetConfirm: false,
  };

  const props = getProps(state, testEnv);
  assert(props.showGearIcon === true, 'Should show gear icon even with error');
  assertEqual(props.currentView, 'welcome', 'Should be welcome view');
});

// Test 4: onCheckForUpdates handler should not send REFRESH_CACHE message
runTest('GivenCheckForUpdates_WhenHandlerRuns_ThenSetsNoState', () => {
  const state = {
    pageIndex: 0,
    isSettingsOpen: false,
    currentView: 'welcome',
    dateshift: 0,
  };

  const update = Handlers.onCheckForUpdates(state, testEnv);
  // The handler should return empty (no state change) — reload is handled by env function
  assert(Object.keys(update).length === 0, 'onCheckForUpdates should not modify state');
});

// ============ SUMMARY ============

console.log('\n' + '='.repeat(60));
console.log(`Tests run: ${testsRun}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);

if (testsFailed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('\nAll blank-screen reproduction tests passed! ✓');
  process.exit(0);
}
