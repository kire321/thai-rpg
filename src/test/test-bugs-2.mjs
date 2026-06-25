// test-bugs-2.mjs — TDD for three new bugs
// Bug 1: Again button should show delay count, not "1d", in vocab review
// Bug 2: New counter should decrease, Due should increase on Again rating
// Bug 3: Mirror card of same vocab shown after Again in vocab review

import { getProps, Handlers, sm2Schedule } from '../controller/controller.js';

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
          { dialogue: 'After vocab.', character: null, place: null, stage_directions: [] },
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

// ==================== BUG 1: Again button shows delay, not "1d" ====================

runTest('Bug1_GivenNewCardInVocabReview_WhenAgainPreview_ThenShowsDelayNot1Day', () => {
  const state = makeVocabState();
  // Simulate that a previous "Again" rating set againDelayCounter = 2
  state.againDelayCounter = 2;
  const props = getProps(state, testEnv);

  // In vocab review, the Again button should show the delay count (e.g. 2)
  // not the SM-2 interval (which is always 1 for Again)
  assert(props.schedulePreview !== null, 'Should have schedule preview');
  assertEqual(props.schedulePreview.again, 2,
    `Again should show delay count (2), not SM-2 interval. Got: ${props.schedulePreview.again}`);
});

runTest('Bug1_GivenMatureCardInVocabReview_WhenAgainPreview_ThenShowsDelayNot1Day', () => {
  const cardStats = {
    'card-v1-eng-thai': { repetitions: 5, interval: 20, ef: 2.5, lastReviewed: today - 20 },
  };
  const state = makeVocabState({ cardStats, againDelayCounter: 3 });
  const props = getProps(state, testEnv);

  // Even for mature cards, Again in vocab review should show delay
  assertEqual(props.schedulePreview.again, 3,
    `Again should show delay count (3), not 1d. Got: ${props.schedulePreview.again}`);
});

runTest('Bug1_GivenNoDelayCounter_WhenAgainPreview_ThenShows1Day', () => {
  // When there's no active againDelayCounter (not in a review session),
  // Again should still show 1d (standard SM-2)
  const state = makeVocabState({ actPhase: 'lines_before' });
  const props = getProps(state, testEnv);
  // In lines_before phase, quizMode is false, so schedulePreview uses currentCard
  // which might be null. Let's use a state where currentCard exists.
  const state2 = {
    ...state,
    currentView: 'quiz',
    cardStats: { 'card-v1-eng-thai': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: today - 1 } },
    againDelayCounter: 0,
  };
  const props2 = getProps(state2, testEnv);
  assertEqual(props2.schedulePreview.again, 1,
    `Without delay counter, Again should show 1d. Got: ${props2.schedulePreview.again}`);
});

// ==================== BUG 2: New decreases, Due increases on Again ====================

runTest('Bug2_GivenNewCard_WhenRatedAgain_ThenNewCounterDecreases', () => {
  let state = makeVocabState();
  const before = getProps(state, testEnv);
  const beforeNew = before.newCount;
  const beforeDue = before.dueCount;

  // Rate the first card "Again"
  const cardId = 'card-v1-eng-thai';
  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };

  const after = getProps(state, testEnv);
  const afterNew = after.newCount;
  const afterDue = after.dueCount;

  assert(afterNew < beforeNew,
    `New counter should decrease after rating Again. Before: ${beforeNew}, After: ${afterNew}`);
});

runTest('Bug2_GivenNewCard_WhenRatedAgain_ThenDueCounterIncreases', () => {
  let state = makeVocabState();
  const before = getProps(state, testEnv);
  const beforeDue = before.dueCount;

  const cardId = 'card-v1-eng-thai';
  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };

  const after = getProps(state, testEnv);
  const afterDue = after.dueCount;

  assert(afterDue > beforeDue,
    `Due counter should increase after rating Again. Before: ${beforeDue}, After: ${afterDue}`);
});

runTest('Bug2_GivenCardRatedAgain_WhenInAgainQueue_ThenCountedAsDueNotLeft', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';
  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };

  const props = getProps(state, testEnv);
  // The card is now in againQueue with repetitions=0.
  // It should be counted as "due", not "left".
  // leftCount should NOT include this card.
  assert(props.leftCount < 6,
    `Card in againQueue should NOT be in left count. leftCount: ${props.leftCount}`);
});

// ==================== BUG 3: Mirror card after Again ====================

runTest('Bug3_GivenCardRatedAgain_WhenNextQuizCard_ThenNotMirrorOfSameVocab', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';

  // Rate "Again"
  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };

  // Get next card from vocab review
  const props = getProps(state, testEnv);
  const nextCard = props.currentCard;

  assert(nextCard !== null, 'Should have a next card');
  assert(nextCard.vocabId !== 'v1',
    `Next card should NOT be same vocab (v1). Got: ${nextCard.id} (vocabId: ${nextCard.vocabId})`);
});

runTest('Bug3_GivenCardRatedAgain_WhenNextCard_ThenDifferentVocabShown', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';

  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };

  const props = getProps(state, testEnv);
  const nextCard = props.currentCard;

  // Should show v2 or v3, not v1
  assert(['v2', 'v3'].includes(nextCard.vocabId),
    `Next card should be v2 or v3, got: ${nextCard.vocabId}`);
});

runTest('Bug3_GivenEnoughOtherCards_WhenAgainDelayExpires_ThenOriginalCardReturns', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';

  // Rate "Again" (sets againDelayCounter = 2)
  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };

  // Simulate showing 2 other cards (decrement counter)
  // After 2 cards, the original card should come back
  state = { ...state, againDelayCounter: 0 };

  const props = getProps(state, testEnv);
  assertEqual(props.currentCard.id, cardId,
    `After delay expires, original card should return. Got: ${props.currentCard?.id}`);
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
