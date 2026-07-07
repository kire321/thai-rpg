// test-bugs-3.mjs — TDD for final three bugs
// Bug 1: Again button label still shows "1d" instead of delay count
// Bug 2: After rating Again in vocab_review, should continue to narrative, not another card

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
  speakThai: (text) => { testEnv.lastSpoken = text; },
};

const testEpisodes = [
  {
    id: 'ep_001',
    title: 'The Resonance Route',
    acts: [
      {
        id: 'act_1',
        title: 'The Signal',
        lines_before: [
          { dialogue: 'The ship sails.', character: null, place: null, stage_directions: [] },
        ],
        tag: 'tag_008',
        lines_after: [
          { dialogue: 'After vocab review.', character: null, place: null, stage_directions: [] },
        ],
        decision: {
          line: { dialogue: 'Choose.', character: null, place: null, stage_directions: [] },
          choices: [{
            description: 'Go', difficulty: 'easy', subplot: 'subplot_freq',
            pass_outcome: { line: { dialogue: 'You went.', character: null, place: null, stage_directions: [] }, subplot: 'subplot_freq', delta: 1 }
          }]
        }
      }
    ]
  }
];

const testTags = { tag_008: ['v1', 'v2', 'v3'] };

const testCards = [
  { id: 'card-v1-eng-thai', vocabId: 'v1', direction: 'eng-thai', front: 'hello', back: 'สวัสดี' },
  { id: 'card-v1-thai-eng', vocabId: 'v1', direction: 'thai-eng', front: 'สวัสดี', back: 'hello' },
  { id: 'card-v2-eng-thai', vocabId: 'v2', direction: 'eng-thai', front: 'goodbye', back: 'ลาก่อน' },
  { id: 'card-v2-thai-eng', vocabId: 'v2', direction: 'thai-eng', front: 'ลาก่อน', back: 'goodbye' },
  { id: 'card-v3-eng-thai', vocabId: 'v3', direction: 'eng-thai', front: 'thank you', back: 'ขอบคุณ' },
  { id: 'card-v3-thai-eng', vocabId: 'v3', direction: 'thai-eng', front: 'ขอบคุณ', back: 'thank you' },
];

function makeVocabState(extra = {}) {
  return {
    episodes: testEpisodes,
    tags: testTags,
    cards: testCards,
    cardStats: {},
    currentView: 'episode',
    currentEpisodeId: 'ep_001',
    currentActIndex: 0,
    actPhase: 'vocab_review',
    showingAnswer: false,
    ...extra,
  };
}

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

// ==================== BUG 1: Again label shows delay, not "1d" ====================

runTest('Bug1_GivenVocabReview_WhenAgainPreview_ThenShowsDelayWithoutD', () => {
  const state = makeVocabState();
  state.againDelayCounter = 2;
  const props = getProps(state, testEnv);

  // The schedulePreview.again should be the delay count (2)
  assertEqual(props.schedulePreview.again, 2,
    `Again preview should be 2 (delay count). Got: ${props.schedulePreview.again}`);

  // The View should be able to tell this is a delay count, not a day count
  // We need a flag or the value itself to indicate delay vs days
  assert(props.schedulePreview.againIsDelay === true,
    'schedulePreview should have againIsDelay=true when in vocab review with active delay');
});

runTest('Bug1_GivenNoDelay_WhenAgainPreview_ThenShows1Day', () => {
  // In standalone quiz mode (not vocab_review), Again should show 1d
  const state = makeVocabState({ actPhase: 'lines_before' });
  const props = getProps(state, testEnv);

  assertEqual(props.schedulePreview.again, 1,
    'In non-quiz mode, Again should show SM-2 interval (1)');
  assert(props.schedulePreview.againIsDelay !== true,
    'againIsDelay should NOT be true outside vocab review');
});

runTest('Bug1_GivenStandaloneQuiz_WhenAgainPreview_ThenShowsDayInterval', () => {
  const state = {
    ...makeVocabState(),
    currentView: 'quiz',
    actPhase: 'quiz',
    cardStats: { 'card-v1-eng-thai': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: today - 1 } },
  };
  const props = getProps(state, testEnv);

  assertEqual(props.schedulePreview.again, 1,
    `Standalone quiz Again should show 1d. Got: ${props.schedulePreview.again}`);
  assert(props.schedulePreview.againIsDelay !== true,
    'againIsDelay should be false in standalone quiz');
});

// ==================== BUG 2: Rate Again → continue to narrative ====================

runTest('Bug2_GivenVocabReview_WhenRateAgain_ThenGoesToLinesAfter', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';

  // Rate "Again" in vocab_review
  const update = Handlers.onRateCard(state, testEnv, cardId, 1);

  assertEqual(update.actPhase, 'lines_after',
    `After rating in vocab_review, should move to lines_after. Got: ${update.actPhase}`);
  assertEqual(update.currentLineIndex, 0,
    `Should reset line index to 0. Got: ${update.currentLineIndex}`);
});

runTest('Bug2_GivenVocabReview_WhenRateGood_ThenAlsoGoesToLinesAfter', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';

  // Rate "Good" in vocab_review
  const update = Handlers.onRateCard(state, testEnv, cardId, 4);

  assertEqual(update.actPhase, 'lines_after',
    `After rating Good in vocab_review, should move to lines_after. Got: ${update.actPhase}`);
});

runTest('Bug2_GivenVocabReview_WhenRateAgain_ThenShowsNarrativeLine', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';

  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };

  const props = getProps(state, testEnv);
  assertEqual(props.actPhase, 'lines_after', 'Should be in lines_after');
  assert(props.currentLine !== null, 'Should show a narrative line');
  assert(props.currentLine.dialogue.includes('After vocab'),
    `Should show lines_after content. Got: ${props.currentLine?.dialogue}`);
});

runTest('Bug2_GivenStandaloneQuiz_WhenRateAgain_ThenStaysInQuiz', () => {
  // In standalone quiz mode, rating should NOT change actPhase
  let state = {
    ...makeVocabState(),
    currentView: 'quiz',
    actPhase: 'quiz',
  };
  const cardId = 'card-v1-eng-thai';

  const update = Handlers.onRateCard(state, testEnv, cardId, 1);

  assert(update.actPhase === undefined || update.actPhase === 'quiz',
    `Standalone quiz should NOT change phase. Got: ${update.actPhase}`);
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
  console.log('\nAll bug reproduction tests passed! ✓');
  process.exit(0);
}
