// test-bugs.mjs - TDD reproduction and verification for reported bugs
// Bug 4: All rating buttons show "1d" during vocab review
// Bug 5: "Again" rated card reappears immediately instead of continuing narrative

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

// ============ TEST DATA ============

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

// ============ TEST RUNNER ============

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

// ============ BUG 4: All buttons show "1d" ============

// Test 4a: A card with NO stats should show 1d for all ratings (correct behavior)
runTest('GivenNewCardInVocabReview_WhenSchedulePreview_ThenAllShow1Day', () => {
  const state = makeVocabState();
  const props = getProps(state, testEnv);
  
  assert(props.currentCard !== null, 'Should have a quiz card');
  assert(props.schedulePreview !== null, 'Should have schedule preview');
  
  // For a brand new card, Hard/Good/Easy show 1 day (correct SM-2 behavior)
  // Again shows the delay count (2 cards) since we're in vocab review
  assertEqual(props.schedulePreview.again, 2, 'Again should show delay count (2) in vocab review');
  assert(props.schedulePreview.againIsDelay === true, 'againIsDelay should be true in vocab review');
  assertEqual(props.schedulePreview.hard, 1, 'Hard should show 1d for new card');
  assertEqual(props.schedulePreview.good, 1, 'Good should show 1d for new card');
  assertEqual(props.schedulePreview.easy, 1, 'Easy should show 1d for new card');
});

// Test 4b: A card WITH stats should show DIFFERENT intervals for different ratings
runTest('GivenMatureCardInVocabReview_WhenSchedulePreview_ThenDifferentIntervals', () => {
  // Set up a mature card (5 repetitions, interval 20 days, reviewed 20 days ago)
  const cardStats = {
    'card-v1-eng-thai': { repetitions: 5, interval: 20, ef: 2.5, lastReviewed: today - 20 },
  };
  const state = makeVocabState({ cardStats });
  const props = getProps(state, testEnv);
  
  assert(props.currentCard !== null, 'Should have a quiz card');
  assert(props.schedulePreview !== null, 'Should have schedule preview');
  
  // For a mature card, different ratings should show different intervals
  const preview = props.schedulePreview;
  
  // Again shows delay count (2) in vocab review, not SM-2 interval
  assertEqual(preview.again, 2, 'Again should show delay count (2) in vocab review');
  assert(preview.againIsDelay === true, 'againIsDelay should be true');
  
  // Hard, Good, Easy should show the next interval based on current interval * EF
  // With interval=20, ef=2.5: next interval = ceil(20 * 2.5) = 50
  const expectedNext = Math.ceil(20 * 2.5);
  
  assert(preview.hard === expectedNext, `Hard should show ${expectedNext}d, got ${preview.hard}d`);
  assert(preview.good === expectedNext, `Good should show ${expectedNext}d, got ${preview.good}d`);
  
  // Easy should be same or slightly higher (EF increases)
  assert(preview.easy >= expectedNext, `Easy should be >= ${expectedNext}d, got ${preview.easy}d`);
  
  // Not all should be 1
  assert(preview.good !== 1, `Good should NOT be 1d for mature card, got ${preview.good}d`);
});

// Test 4c: After rating "Good" once, the card's own preview should show 6d (not 1d)
runTest('GivenCardRatedGoodOnce_WhenNextPreview_ThenShows6Days', () => {
  // Start with a state where v1 has 1 success already
  const cardStats = {
    'card-v1-eng-thai': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: today - 1 },
  };
  const state = makeVocabState({ cardStats });
  
  // Force quizCard to be the card-v1 (it's due today: lastReviewed=1 day ago, interval=1)
  const props = getProps(state, testEnv);
  
  assert(props.currentCard !== null, 'Should have a quiz card');
  assert(props.schedulePreview !== null, 'Should have schedule preview');
  
  // For a card with 1 success, next Good should show 6 days
  assertEqual(props.schedulePreview.good, 6, 
    `Good should show 6d after first success, got ${props.schedulePreview?.good}d`);
});

// Test 4d: Stats keyed by vocabId should still work (regression test for old bug)
runTest('GivenStatsKeyedByVocabId_WhenVocabReview_ThenSchedulePreviewCorrect', () => {
  // Old-format state: stats keyed by vocabId instead of cardId
  const cardStats = {
    'v1': { repetitions: 5, interval: 20, ef: 2.5, lastReviewed: today - 20 },
  };
  const state = makeVocabState({ cardStats });
  const props = getProps(state, testEnv);
  
  assert(props.currentCard !== null, 'Should find a card');
  assert(props.schedulePreview !== null, 'Should have schedule preview');
  
  // Should find stats via vocabId fallback
  const preview = props.schedulePreview;
  assert(preview.good !== 1, 
    `Should show real interval, not 1d. Got good: ${preview.good}d`);
  assertEqual(preview.good, Math.ceil(20 * 2.5), 
    'Good should show interval * EF for mature card');
});

// ============ BUG 5: Again card reappears immediately ============

// Test 5a: After rating "Again", the same card should NOT be shown next
runTest('GivenCardRatedAgain_WhenNextVocabCard_ThenDifferentCardShown', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';
  
  // Get initial card
  const initialProps = getProps(state, testEnv);
  const initialCard = initialProps.currentCard;
  assert(initialCard !== null, 'Should have initial card');
  
  // Rate "Again"
  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };
  
  // Get next card
  const nextProps = getProps(state, testEnv);
  const nextCard = nextProps.currentCard;
  
  // The next card should be different from the initial card
  assert(nextCard !== null, 'Should have a next card');
  assert(nextCard.id !== cardId, 
    `Next card should be different from "Again" card. Got: ${nextCard.id}`);
});

// Test 5b: After rating "Again", againDelayCounter should delay the card
runTest('GivenCardRatedAgain_WhenAgainDelayCounter_ThenCardDelayed', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';
  
  // Rate "Again"
  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };
  
  // Check that againDelayCounter is set
  assert(state.againDelayCounter > 0, 
    `againDelayCounter should be > 0, got ${state.againDelayCounter}`);
  
  // The card should be in againQueue
  assert(state.againQueue.includes(cardId), 
    'Card should be in againQueue');
  
  // Get next card - should NOT be the again card (delayed)
  const props = getProps(state, testEnv);
  assert(props.currentCard.id !== cardId, 
    `Should NOT show "Again" card immediately. Got: ${props.currentCard?.id}`);
});

// Test 5c: After showing N other cards, the "Again" card should come back
runTest('GivenAgainDelayed_WhenEnoughOtherCards_ThenAgainCardReturns', () => {
  let state = makeVocabState();
  const cardId = 'card-v1-eng-thai';
  
  // Rate "Again" (sets againDelayCounter to 2)
  state = { ...state, ...Handlers.onRateCard(state, testEnv, cardId, 1) };
  
  // Simulate showing 2 other cards (decrements counter)
  state = { ...state, againDelayCounter: 0 };
  
  // Now the again card should be shown
  const props = getProps(state, testEnv);
  assert(props.currentCard.id === cardId, 
    `Should show "Again" card after delay. Got: ${props.currentCard?.id}`);
});

// Test 5d: Narrative should continue after vocab review, not loop cards
runTest('GivenVocabReviewDone_WhenContinue_ThenNarrativeResumes', () => {
  let state = makeVocabState();
  
  // Tap "Continue Story" / onVocabReviewDone
  state = { ...state, ...Handlers.onVocabReviewDone(state, testEnv) };
  
  // Should transition to lines_after
  assertEqual(state.actPhase, 'lines_after', 'Should go to lines_after');
  
  const props = getProps(state, testEnv);
  assert(props.currentLine !== null, 'Should show narrative line');
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
