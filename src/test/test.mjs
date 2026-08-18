// test.mjs - Comprehensive test suite for Thai RPG SM-2 Spaced Repetition
// Tests for controller.js - ESM, no compilation needed

import { getProps, Handlers, sm2Schedule, countDueCardsInEpisode } from '../controller/controller.js';

// ============ TEST ENVIRONMENT ============

const testVocabItems = [
  { id: '402-1.', thai: 'มีเรื่องจะบอก(นะ)', phonetics: 'mii rʉ̂ang jà bɔ̀ɔk', english: 'I have something to tell you.' },
  { id: '402-2.', thai: 'จะลองดู(ค่ะ)', phonetics: 'jà lɔɔng-duu', english: "I'll try it." },
  { id: '402-3.', thai: 'ทุกคนรู้จักมัน', phonetics: 'túk-kon rúu-jàk', english: 'Everyone knows it!' },
];

const testEnv = {
  content: {
    pageTitles: ['Thai RPG', 'Lesson 1', 'Lesson 2'],
    vocabItems: testVocabItems,
  },
  time: {
    getTimestamp: () => 1704067200000,
    getDayStart: () => 1704067200000,
    getDaysSinceEpoch: () => 19724,
  },
  downloadFile: (filename, content) => {
    testEnv.lastDownload = { filename, content };
  },
  checkForUpdates: () => {
    testEnv.updateChecked = true;
  },
  loadContent: () => testVocabItems,
  saveContent: (items) => { testEnv.savedContent = items; },
  speakThai: (text) => { testEnv.lastSpoken = text; },
};

// Test result tracking
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Base TestCase class
class TestCase {
  constructor() {
    this.state = {};
  }

  run() {
    throw new Error('run() must be implemented by subclass');
  }
}

// Helper to create state with loaded content
function stateWithContent(extra = {}) {
  let state = { isSettingsOpen: false };
  const update = Handlers.onLoadContent(state, testEnv);
  state = { ...state, ...update };
  return { ...state, ...extra };
}

// Helper: make only target card due today, others due far in future
function makeOnlyCardDue(state, cardId) {
  const allCards = state.cards || [];
  const cardStats = { ...(state.cardStats || {}) };
  for (const card of allCards) {
    if (card.id !== cardId) {
      cardStats[card.id] = { repetitions: 99, interval: 999, ef: 2.5, lastReviewed: 19724 };
    }
  }
  return { ...state, cardStats };
}

// ============ ORIGINAL TESTS (33 tests) ============

// --- Settings Drawer Tests ---
class GivenSettingsIsClosed extends TestCase {
  constructor() { super(); this.state = { isSettingsOpen: false }; }
}

class WhenITapGearSettingsOpens extends GivenSettingsIsClosed {
  run() {
    this.state = { ...this.state, ...Handlers.onTapGear(this.state, testEnv) };
    const props = getProps(this.state, testEnv);
    assertEqual(props.isSettingsOpen, true, 'Settings should be open after tapping gear');
  }
}

class GivenSettingsIsOpen extends TestCase {
  constructor() { super(); this.state = { isSettingsOpen: true }; }
}

class WhenITapCloseSettingsCloses extends GivenSettingsIsOpen {
  run() {
    this.state = { ...this.state, ...Handlers.onCloseSettings(this.state, testEnv) };
    const props = getProps(this.state, testEnv);
    assertEqual(props.isSettingsOpen, false, 'Settings should be closed after onCloseSettings');
  }
}

class WhenISwipeDownSettingsCloses extends GivenSettingsIsOpen {
  run() {
    this.state = { ...this.state, ...Handlers.onSwipeDownSettings(this.state, testEnv) };
    const props = getProps(this.state, testEnv);
    assertEqual(props.isSettingsOpen, false, 'Settings should be closed after swipe down');
  }
}

// --- Content Loading Tests ---
class GivenIHaveNoCachedContent_WhenILoadContent_ThenVocabItemsAreLoaded extends TestCase {
  run() {
    this.state = Handlers.onLoadContent(this.state, testEnv);
    assert(this.state.vocabItems.length > 0, 'Vocab items should be loaded');
    assertEqual(this.state.vocabItems[0].thai, 'มีเรื่องจะบอก(นะ)', 'First item should have Thai text');
  }
}

class GivenContentIsLoaded_WhenICheckForNewContent_ThenNewContentIsLoaded extends TestCase {
  run() {
    this.state = { vocabItems: [], contentVersion: 0 };
    testEnv.newContent = [{ id: 'new-1', thai: 'ใหม่', english: 'new' }];
    this.state = { ...this.state, ...Handlers.onCheckForNewContent(this.state, testEnv) };
    assert(this.state.vocabItems.length > 0, 'New content should be loaded');
    assert(testEnv.updateChecked, 'checkForUpdates should be called');
  }
}

class GivenAVocabItem_WhenCardsAreGenerated_ThenTwoCardsExist extends TestCase {
  run() {
    this.state = stateWithContent();
    const cards = this.state.cards || [];
    const itemCards = cards.filter(c => c.vocabId === '402-1.');
    assertEqual(itemCards.length, 2, 'Should have 2 cards per vocab item');
  }
}

// --- Card Generation Tests ---
class GivenAVocabItem_WhenGeneratingCards_ThenEngToThaiCardExists extends TestCase {
  run() {
    this.state = stateWithContent();
    const cards = this.state.cards || [];
    const engToThai = cards.find(c => c.vocabId === '402-1.' && c.direction === 'eng-thai');
    assert(engToThai !== undefined, 'Eng=>Thai card should exist');
    assertEqual(engToThai.front, 'I have something to tell you.', 'Front should be English');
  }
}

class GivenAVocabItem_WhenGeneratingCards_ThenThaiToEngCardExists extends TestCase {
  run() {
    this.state = stateWithContent();
    const cards = this.state.cards || [];
    const thaiToEng = cards.find(c => c.vocabId === '402-1.' && c.direction === 'thai-eng');
    assert(thaiToEng !== undefined, 'Thai=>Eng card should exist');
    assertEqual(thaiToEng.front, 'มีเรื่องจะบอก(นะ)', 'Front should be Thai');
  }
}

class GivenAThaiToEngCard_WhenShowingFront_ThenThaiIsShown extends TestCase {
  run() {
    this.state = stateWithContent();
    const cards = this.state.cards || [];
    const card = cards.find(c => c.direction === 'thai-eng');
    assert(card !== undefined, 'Should find a Thai=>Eng card');
    assert(card.front.includes('มี') || card.front.includes('จะ') || card.front.includes('ทุก'), 
      `Thai front should contain Thai text, got: ${card.front}`);
  }
}

class GivenAnEngToThaiCard_WhenShowingFront_ThenEnglishIsShown extends TestCase {
  run() {
    this.state = stateWithContent();
    const cards = this.state.cards || [];
    const card = cards.find(c => c.direction === 'eng-thai');
    assert(card !== undefined, 'Should find an Eng=>Thai card');
    const isEnglish = /^[A-Za-z0-9\s'().!?,/-]+$/.test(card.front) && card.front.split(/\s+/).length >= 2;
    assert(isEnglish, `English front should be English text, got: ${card.front}`);
  }
}

class GivenAThaiToEngCard_WhenShowingFront_ThenPhoneticsAreHidden extends TestCase {
  run() {
    const props = getProps({ ...stateWithContent(), currentView: 'quiz', showingAnswer: false }, testEnv);
    assert(props.quizMode === true, 'Should be in quiz mode');
    assert(props.showPhonetics === false, 'Phonetics should be hidden on front');
  }
}

// --- Quiz UI Tests ---
class GivenACardIsDue_WhenShowingTheCard_ThenDueDateIsDisplayed extends TestCase {
  run() {
    this.state = stateWithContent();
    const props = getProps({ ...this.state, currentView: 'quiz' }, testEnv);
    assert(props.dueDate !== undefined, 'Due date should be displayed');
  }
}

class GivenACardFront_WhenIShowAnswer_ThenTheBackIsShown extends TestCase {
  run() {
    this.state = stateWithContent({ currentView: 'quiz', showingAnswer: false });
    this.state = { ...this.state, ...Handlers.onShowAnswer(this.state, testEnv) };
    assert(this.state.showingAnswer === true, 'Should be showing answer');
  }
}

class GivenACardFront_WhenShowingAnswer_ThenPhoneticsAreShown extends TestCase {
  run() {
    const props = getProps({ ...stateWithContent(), currentView: 'quiz', showingAnswer: true }, testEnv);
    assert(props.showPhonetics === true, 'Phonetics should be shown on answer');
  }
}

// --- SM-2 Scheduling Tests ---
class GivenANewCard_WhenIRateGood_ThenIntervalIs1Day extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 4) };
    const stats = this.state.cardStats[cardId];
    assertEqual(stats.interval, 1, 'First success should have interval = 1 day');
    assertEqual(stats.repetitions, 1, 'Should have 1 repetition');
  }
}

class GivenACardWith1Success_WhenIRateGood_ThenIntervalIs6Days extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 4) };
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 4) };
    const stats = this.state.cardStats[cardId];
    assertEqual(stats.interval, 6, 'Second success should have interval = 6 days');
    assertEqual(stats.repetitions, 2, 'Should have 2 repetitions');
  }
}

class GivenACardWith2Successes_WhenIRateGood_ThenIntervalIsPreviousTimesEF extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 4) };
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 4) };
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 4) };
    const stats = this.state.cardStats[cardId];
    const expectedInterval = Math.ceil(6 * stats.ef);
    assertEqual(stats.interval, expectedInterval, `Third success interval should be 6 * EF = ${expectedInterval}`);
    assertEqual(stats.repetitions, 3, 'Should have 3 repetitions');
  }
}

class GivenACard_WhenIRateAgain_ThenRepetitionsResetTo0 extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 4) };
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 4) };
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 1) };
    const stats = this.state.cardStats[cardId];
    assertEqual(stats.repetitions, 0, 'Repetitions should reset to 0 after failure');
    assertEqual(stats.interval, 1, 'Interval should be 1 day after failure');
  }
}

class GivenACard_WhenIRateEasy_ThenEFIncreases extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    const initialEF = 2.5;
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 5) };
    const stats = this.state.cardStats[cardId];
    assert(stats.ef > initialEF, `EF should increase from ${initialEF}, got ${stats.ef}`);
  }
}

class GivenACard_WhenIRateHard_ThenEFDecreases extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    const initialEF = 2.5;
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 3) };
    const stats = this.state.cardStats[cardId];
    assert(stats.ef < initialEF, `EF should decrease from ${initialEF}, got ${stats.ef}`);
  }
}

class GivenACardWithLowEF_WhenIRateHard_ThenEFStaysAt1_3 extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = { ...this.state, cardStats: { [cardId]: { repetitions: 5, interval: 10, ef: 1.31, dueDate: 19724 } } };
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 3) };
    const stats = this.state.cardStats[cardId];
    assert(stats.ef >= 1.3, `EF should not go below 1.3, got ${stats.ef}`);
  }
}

// --- Header Counters Tests ---
class GivenNoReviewsToday_WhenILookAtHeader_ThenNewCounterIs10 extends TestCase {
  run() {
    this.state = stateWithContent();
    const props = getProps(this.state, testEnv);
    assertEqual(props.newCount, 10, 'New count should be 10');
  }
}

class GivenCardsNeverAttempted_WhenILookAtHeader_ThenLeftCounterShowsThem extends TestCase {
  run() {
    this.state = stateWithContent();
    const props = getProps(this.state, testEnv);
    assert(props.leftCount > 0, 'Left count should show never-attempted cards');
  }
}

// --- Dateshift Tests ---
class GivenDateshiftIs0_WhenILookAtSettings_ThenDateshiftCounterShows0 extends TestCase {
  run() {
    this.state = stateWithContent();
    const props = getProps(this.state, testEnv);
    assertEqual(props.dateshift, 0, 'Dateshift should be 0 by default');
  }
}

class GivenIClickPlus_WhenDateshiftIs0_ThenDateshiftBecomes1 extends TestCase {
  run() {
    this.state = stateWithContent({ dateshift: 0 });
    this.state = { ...this.state, ...Handlers.onIncrementDateshift(this.state, testEnv) };
    assertEqual(this.state.dateshift, 1, 'Dateshift should become 1');
  }
}

class GivenDateshiftIsNonZero_WhenILookAtHeader_ThenDateshiftIsShown extends TestCase {
  run() {
    this.state = stateWithContent({ dateshift: 3 });
    const props = getProps(this.state, testEnv);
    assert(props.showDateshift === true, 'Dateshift should be shown when non-zero');
    assertEqual(props.dateshift, 3, 'Dateshift value should be 3');
  }
}

// --- Schedule Preview Tests ---
class GivenANewCard_WhenIRateGood_ThenButtonShows1Day extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = makeOnlyCardDue(this.state, cardId);
    this.state.cardStats[cardId] = { repetitions: 0, interval: 0, ef: 2.5, lastReviewed: null };
    const props = getProps(this.state, testEnv);
    assert(props.schedulePreview !== null, 'Schedule preview should be provided');
    assertEqual(props.schedulePreview.good, 1, 'Good should show 1 day for new card');
  }
}

class GivenACardWith1Success_WhenIRateGood_ThenButtonShows6Days extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = makeOnlyCardDue(this.state, cardId);
    this.state.cardStats[cardId] = { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 19720 };
    const props = getProps(this.state, testEnv);
    assert(props.schedulePreview !== null, 'Schedule preview should exist');
    assertEqual(props.schedulePreview.good, 6, 'Good should show 6 days after first success');
  }
}

class GivenACardWith2Successes_WhenIRateGood_ThenButtonShowsInterval extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = makeOnlyCardDue(this.state, cardId);
    this.state.cardStats[cardId] = { repetitions: 2, interval: 6, ef: 2.5, lastReviewed: 19715 };
    const props = getProps(this.state, testEnv);
    assert(props.schedulePreview !== null, 'Schedule preview should exist');
    assert(props.schedulePreview.good > 6, `Good should show > 6 days, got ${props.schedulePreview.good}`);
  }
}

// --- "Again" Rating Tests ---
class GivenANewCard_WhenIRateAgain_ThenCardIsDueToday extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 1) };
    const stats = this.state.cardStats[cardId];
    assert(stats !== undefined, 'Stats should exist');
    const props = getProps(this.state, testEnv);
    assert(props.dueCount > 0 || this.state.againQueue?.includes(cardId), 
      'Card rated Again should be due again today or in again queue');
  }
}

class GivenACardRatedAgain_WhenILookAtCounters_ThenDueCounterIncrements extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 1) };
    assert(this.state.againQueue?.includes(cardId), 'Card should be in again queue');
  }
}

// --- Card Shuffling Tests ---
class GivenCardsAreLoaded_WhenISeeCards_ThenDirectionsAreShuffled extends TestCase {
  run() {
    this.state = stateWithContent();
    const cards = this.state.cards || [];
    const firstFive = cards.slice(0, 5);
    const allSameDirection = firstFive.every(c => c.direction === firstFive[0].direction);
    assert(!allSameDirection, 'First 5 cards should not all be the same direction (shuffled)');
  }
}

// ============ BUG FIX TESTS (Round 2) ============

// --- Fix 1: Only speak Thai text ---

class GivenThaiToEngFront_WhenDisplayed_ThenThaiIsSpoken extends TestCase {
  run() {
    testEnv.lastSpoken = null;
    this.state = stateWithContent({ currentView: 'quiz', showingAnswer: false });
    const thaiEngCard = this.state.cards.find(c => c.direction === 'thai-eng');
    assert(thaiEngCard !== undefined, 'Should find Thai=>Eng card');
    this.state = makeOnlyCardDue(this.state, thaiEngCard.id);
    this.state.cardStats[thaiEngCard.id] = { repetitions: 0, interval: 0, ef: 2.5 };
    this.state = { ...this.state, ...Handlers.onShowCard(this.state, testEnv) };
    assert(testEnv.lastSpoken !== null, `Thai should be spoken. Last spoken: ${testEnv.lastSpoken}`);
    assert(isThaiText(testEnv.lastSpoken), `Should speak Thai text, got: ${testEnv.lastSpoken}`);
  }
}

class GivenEngToThaiBack_WhenDisplayed_ThenThaiIsSpoken extends TestCase {
  run() {
    testEnv.lastSpoken = null;
    this.state = stateWithContent({ currentView: 'quiz', showingAnswer: false });
    const engThaiCard = this.state.cards.find(c => c.direction === 'eng-thai');
    assert(engThaiCard !== undefined, 'Should find Eng=>Thai card');
    this.state = makeOnlyCardDue(this.state, engThaiCard.id);
    this.state.cardStats[engThaiCard.id] = { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 19720 };
    this.state = { ...this.state, ...Handlers.onShowAnswer(this.state, testEnv) };
    assert(testEnv.lastSpoken !== null, `Thai should be spoken. Last spoken: ${testEnv.lastSpoken}`);
    assert(isThaiText(testEnv.lastSpoken), `Should speak Thai text, got: ${testEnv.lastSpoken}`);
  }
}

class GivenThaiToEngBack_WhenDisplayed_ThenEnglishIsNotSpoken extends TestCase {
  run() {
    testEnv.lastSpoken = null;
    this.state = stateWithContent({ currentView: 'quiz', showingAnswer: false });
    const thaiEngCard = this.state.cards.find(c => c.direction === 'thai-eng');
    assert(thaiEngCard !== undefined, 'Should find Thai=>Eng card');
    this.state = makeOnlyCardDue(this.state, thaiEngCard.id);
    this.state.cardStats[thaiEngCard.id] = { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 19720 };
    this.state = { ...this.state, ...Handlers.onShowAnswer(this.state, testEnv) };
    // The back of Thai=>Eng is English - should NOT be spoken
    assert(testEnv.lastSpoken === null || isThaiText(testEnv.lastSpoken), 
      `English text should NOT be spoken. Last spoken: ${testEnv.lastSpoken}`);
  }
}

class GivenEngToThaiFront_WhenDisplayed_ThenEnglishIsNotSpoken extends TestCase {
  run() {
    testEnv.lastSpoken = null;
    this.state = stateWithContent({ currentView: 'quiz', showingAnswer: false });
    const engThaiCard = this.state.cards.find(c => c.direction === 'eng-thai');
    assert(engThaiCard !== undefined, 'Should find Eng=>Thai card');
    this.state = makeOnlyCardDue(this.state, engThaiCard.id);
    this.state.cardStats[engThaiCard.id] = { repetitions: 0, interval: 0, ef: 2.5 };
    this.state = { ...this.state, ...Handlers.onShowCard(this.state, testEnv) };
    // The front of Eng=>Thai is English - should NOT be spoken
    assert(testEnv.lastSpoken === null, 
      `English text should NOT be spoken. Last spoken: ${testEnv.lastSpoken}`);
  }
}

// --- Fix 2: Stats lookup with vocabId fallback ---

class GivenOldFormatState_WhenStatsKeyedByVocabId_ThenSchedulePreviewIsCorrect extends TestCase {
  run() {
    // Simulate old-format state where cardStats are keyed by vocabId
    this.state = stateWithContent();
    const cardId = 'card-402-1.-thai-eng';
    const vocabId = '402-1.';
    const today = 19724;
    
    // Set up cardStats: target card keyed by vocabId (old format), others keyed by cardId and far in future
    const cardStats = {};
    for (const card of this.state.cards) {
      if (card.vocabId === vocabId) {
        // Target card: keyed by vocabId, due today
        cardStats[vocabId] = { repetitions: 5, interval: 20, ef: 2.5, lastReviewed: today - 20 };
      } else {
        // Other cards: far in the future
        cardStats[card.id] = { repetitions: 99, interval: 999, ef: 2.5, lastReviewed: today };
      }
    }
    this.state = { ...this.state, cardStats };
    
    const props = getProps(this.state, testEnv);
    // Should find stats via vocabId fallback
    assert(props.schedulePreview !== null, 'Schedule preview should exist');
    assert(props.currentCard !== null, 'Should have a current card');
    assert(props.schedulePreview.good > 6, 
      `Should show real interval, not 1d. Got good: ${props.schedulePreview.good}d`);
    assertEqual(props.schedulePreview.good, Math.ceil(20 * 2.5), 
      'Good should show interval * EF for a mature card');
  }
}

class GivenOldFormatState_WhenStatsKeyedByVocabId_ThenAgainShows1Day extends TestCase {
  run() {
    this.state = stateWithContent();
    const vocabId = '402-1.';
    this.state.cardStats = {
      [vocabId]: { repetitions: 5, interval: 20, ef: 2.5, lastReviewed: 19710 }
    };
    const props = getProps(this.state, testEnv);
    assert(props.schedulePreview !== null, 'Schedule preview should exist');
    assertEqual(props.schedulePreview.again, 1, 'Again should reset to 1 day');
  }
}

// --- Fix 3: "Again" cards delayed by a few cards ---

class GivenACardRatedAgain_WhenINextCard_ThenDifferentCardIsShown extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    const initialCardIndex = this.state.cards.findIndex(c => c.id === cardId);
    
    // Rate "Again"
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 1) };
    
    // Get next card
    const nextCard = this.getCurrentCard(this.state, testEnv);
    
    // Should be a different card (not the Again card)
    assert(nextCard === null || nextCard.id !== cardId, 
      'Card rated Again should NOT come up immediately. Got: ' + (nextCard?.id || 'null'));
  }
  
  getCurrentCard(state, env) {
    const cards = state.cards || [];
    if (cards.length === 0) return null;
    const today = env.time.getDaysSinceEpoch() + (state.dateshift || 0);
    const stats = state.cardStats || {};
    const againQueue = state.againQueue || [];
    const dueCards = cards.filter(card => {
      const cardStats = stats[card.id] || stats[card.vocabId];
      const isInAgainQueue = againQueue.includes(card.id);
      if (isInAgainQueue) return false; // Don't show again cards immediately
      if (!cardStats) return true;
      if (cardStats.repetitions === 0 && !cardStats.lastReviewed) return true;
      const dueDate = (cardStats.lastReviewed || 0) + (cardStats.interval || 0);
      return dueDate <= today;
    });
    if (dueCards.length === 0) return null;
    const index = state.currentCardIndex || 0;
    return dueCards[index % dueCards.length];
  }
}

class GivenMultipleCardsRatedAgain_WhenTheyComeUp_ThenOtherCardsInBetween extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardIds = ['card-402-1.-eng-thai', 'card-402-2.-thai-eng'];
    
    // Rate two cards "Again"
    for (const cardId of cardIds) {
      this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 1) };
    }
    
    // Both should be in again queue
    assertEqual(this.state.againQueue.length, 2, 'Both cards should be in again queue');
    
    // But they shouldn't be shown until other cards have been shown
    // The againDelayCounter should track this
    assert(this.state.againDelayCounter !== undefined, 'againDelayCounter should exist');
  }
}

// ============ Reset State Tests ============

class GivenSettingsDrawerIsOpen_WhenILookForReset_ThenButtonExists extends TestCase {
  run() {
    this.state = stateWithContent();
    const props = getProps(this.state, testEnv);
    assert(props.showResetConfirm !== undefined, 'showResetConfirm should be defined in props');
  }
}

class GivenITapReset_WhenConfirmationShown_ThenDialogAppears extends TestCase {
  run() {
    this.state = stateWithContent();
    this.state = { ...this.state, ...Handlers.onTapResetState(this.state, testEnv) };
    assert(this.state.showResetConfirm === true, 'Reset confirmation dialog should be shown');
  }
}

class GivenConfirmationShown_WhenITapCancel_ThenDialogCloses extends TestCase {
  run() {
    this.state = stateWithContent({ showResetConfirm: true });
    this.state = { ...this.state, ...Handlers.onCancelReset(this.state, testEnv) };
    assert(this.state.showResetConfirm === false, 'Reset confirmation dialog should be closed');
    // Cards should still exist
    assert(this.state.cards && this.state.cards.length > 0, 'Cards should not be reset');
  }
}

class GivenConfirmationShown_WhenITapConfirm_ThenStateResets extends TestCase {
  run() {
    this.state = stateWithContent();
    const cardId = 'card-402-1.-eng-thai';
    // Add some card stats and again queue
    this.state = { ...this.state, ...Handlers.onRateCard(this.state, testEnv, cardId, 4) };
    this.state = { ...this.state, showResetConfirm: true };
    
    assert(this.state.cardStats && Object.keys(this.state.cardStats).length > 0, 'Should have card stats before reset');
    
    // Confirm reset
    this.state = { ...this.state, ...Handlers.onConfirmReset(this.state, testEnv) };
    
    // Card stats should be cleared
    assert(Object.keys(this.state.cardStats).length === 0, 'Card stats should be empty after reset');
    // Again queue should be empty
    assert(!this.state.againQueue || this.state.againQueue.length === 0, 'Again queue should be empty');
    // Cards should still exist
    assert(this.state.cards && this.state.cards.length > 0, 'Cards should remain after reset');
    // Should go back to welcome view
    assertEqual(this.state.currentView, 'welcome', 'Should return to welcome view');
    // Reset confirm should be closed
    assert(this.state.showResetConfirm === false, 'Reset confirm dialog should be closed');
  }
}

// ============ HELPERS ============

function isThaiText(text) {
  if (!text) return false;
  // Thai Unicode range: U+0E00 to U+0E7F
  return /[\u0E00-\u0E7F]/.test(text);
}

// ============ SEGMENTED EPISODES (segments JSON format) ============

// A segmented act: narrative and tag segments interleaved. Each tag segment
// becomes one "virtual act": lines_before = narrative since previous tag,
// lines_after = narrative until next tag; decision only on the last one.
const segmentedEpisode = {
  id: 'ep_seg',
  title: 'Segmented Episode',
  acts: [
    {
      id: 'act_1',
      title: 'Segmented Act',
      segments: [
        { type: 'narrative', lines: [
          { character: 'char_narrator', dialogue: 'Opening line.', stage_directions: [] },
        ] },
        { type: 'tag', tag: 'tag_091' },
        { type: 'narrative', lines: [
          { character: 'char_narrator', dialogue: 'Middle line.', stage_directions: [] },
        ] },
        { type: 'tag', tag: 'tag_402' },
        { type: 'narrative', lines: [
          { character: 'char_narrator', dialogue: 'Closing line.', stage_directions: [] },
        ] },
      ],
      decision: {
        line: { character: 'char_narrator', dialogue: 'What do you do?', stage_directions: [] },
        choices: [
          { text: 'Choice A', pass_outcome: { line: { dialogue: 'Pass.' } }, fail_outcome: { line: { dialogue: 'Fail.' } } },
        ],
      },
    },
  ],
};

function stateWithSegmentedEpisode(extra = {}) {
  return {
    ...stateWithContent(),
    episodes: [segmentedEpisode],
    currentEpisodeId: 'ep_seg',
    currentView: 'episode',
    currentActIndex: 0,
    currentLineIndex: 0,
    actPhase: 'lines_before',
    ...extra,
  };
}

class GivenSegmentedAct_WhenViewingFirstVirtualAct_ThenLinesBeforeTagShown extends TestCase {
  run() {
    const state = stateWithSegmentedEpisode();
    const props = getProps(state, testEnv);
    assertEqual(props.currentLine?.dialogue, 'Opening line.', 'First virtual act shows pre-tag narrative');
  }
}

class GivenSegmentedAct_WhenAdvancingPastFirstQuiz_ThenSecondVirtualActStarts extends TestCase {
  run() {
    // Finish lines_before of virtual act 0 (1 line) → vocab_review phase
    let state = stateWithSegmentedEpisode({ currentLineIndex: 1 });
    let update = Handlers.onTapNextLine(state, testEnv);
    assertEqual(update.actPhase, 'vocab_review', 'After lines_before comes vocab review');

    // Rate the quiz card, then advance through lines_after (1 line)
    state = { ...state, ...update };
    const cardId = state.vocabReviewCardId;
    update = Handlers.onRateCard(state, testEnv, cardId, 'good');
    state = { ...state, ...update, actPhase: 'lines_after', currentLineIndex: 1 };
    update = Handlers.onTapNextLine(state, testEnv);
    // Virtual act 0 has no decision → advance straight to virtual act 1
    assertEqual(update.currentActIndex, 1, 'Advanced to second virtual act');
    assertEqual(update.actPhase, 'lines_before', 'Second virtual act starts at lines_before');
    const props = getProps({ ...state, ...update }, testEnv);
    assertEqual(props.currentLine?.dialogue, 'Middle line.', 'Second virtual act shows mid narrative');
  }
}

class GivenSegmentedAct_WhenReachingLastVirtualAct_ThenDecisionShown extends TestCase {
  run() {
    // Virtual act 1 (last): skip ahead to end of its lines_after
    const state = stateWithSegmentedEpisode({ currentActIndex: 1, actPhase: 'lines_after', currentLineIndex: 1 });
    const update = Handlers.onTapNextLine(state, testEnv);
    assertEqual(update.actPhase, 'choice', 'Last virtual act ends with the decision');
  }
}

class GivenSegmentedEpisode_WhenCountingDueCards_ThenAllSegmentTagsCounted extends TestCase {
  run() {
    const state = stateWithContent({
      tags: { tag_091: ['402-1.'], tag_402: ['402-2.'] },
      cardStats: {
        'card-402-1.-thai-eng': { repetitions: 2, interval: 1, ef: 2.5, lastReviewed: 19700 },
        'card-402-2.-thai-eng': { repetitions: 2, interval: 1, ef: 2.5, lastReviewed: 19700 },
      },
    });
    const count = countDueCardsInEpisode(segmentedEpisode, state, testEnv);
    assert(count >= 2, `Expected due cards from both segment tags, got ${count}`);
  }
}

// ============ TEST RUNNER ============

const allTests = [
  // Segmented episodes
  GivenSegmentedAct_WhenViewingFirstVirtualAct_ThenLinesBeforeTagShown,
  GivenSegmentedAct_WhenAdvancingPastFirstQuiz_ThenSecondVirtualActStarts,
  GivenSegmentedAct_WhenReachingLastVirtualAct_ThenDecisionShown,
  GivenSegmentedEpisode_WhenCountingDueCards_ThenAllSegmentTagsCounted,
  // Settings
  WhenITapGearSettingsOpens,
  WhenITapCloseSettingsCloses,
  WhenISwipeDownSettingsCloses,
  // Content
  GivenIHaveNoCachedContent_WhenILoadContent_ThenVocabItemsAreLoaded,
  GivenContentIsLoaded_WhenICheckForNewContent_ThenNewContentIsLoaded,
  GivenAVocabItem_WhenCardsAreGenerated_ThenTwoCardsExist,
  // Cards
  GivenAVocabItem_WhenGeneratingCards_ThenEngToThaiCardExists,
  GivenAVocabItem_WhenGeneratingCards_ThenThaiToEngCardExists,
  GivenAThaiToEngCard_WhenShowingFront_ThenThaiIsShown,
  GivenAnEngToThaiCard_WhenShowingFront_ThenEnglishIsShown,
  GivenAThaiToEngCard_WhenShowingFront_ThenPhoneticsAreHidden,
  // Quiz
  GivenACardIsDue_WhenShowingTheCard_ThenDueDateIsDisplayed,
  GivenACardFront_WhenIShowAnswer_ThenTheBackIsShown,
  GivenACardFront_WhenShowingAnswer_ThenPhoneticsAreShown,
  // SM-2
  GivenANewCard_WhenIRateGood_ThenIntervalIs1Day,
  GivenACardWith1Success_WhenIRateGood_ThenIntervalIs6Days,
  GivenACardWith2Successes_WhenIRateGood_ThenIntervalIsPreviousTimesEF,
  GivenACard_WhenIRateAgain_ThenRepetitionsResetTo0,
  GivenACard_WhenIRateEasy_ThenEFIncreases,
  GivenACard_WhenIRateHard_ThenEFDecreases,
  GivenACardWithLowEF_WhenIRateHard_ThenEFStaysAt1_3,
  // Counters
  GivenNoReviewsToday_WhenILookAtHeader_ThenNewCounterIs10,
  GivenCardsNeverAttempted_WhenILookAtHeader_ThenLeftCounterShowsThem,
  // Dateshift
  GivenDateshiftIs0_WhenILookAtSettings_ThenDateshiftCounterShows0,
  GivenIClickPlus_WhenDateshiftIs0_ThenDateshiftBecomes1,
  GivenDateshiftIsNonZero_WhenILookAtHeader_ThenDateshiftIsShown,
  // Schedule preview
  GivenANewCard_WhenIRateGood_ThenButtonShows1Day,
  GivenACardWith1Success_WhenIRateGood_ThenButtonShows6Days,
  GivenACardWith2Successes_WhenIRateGood_ThenButtonShowsInterval,
  // Again
  GivenANewCard_WhenIRateAgain_ThenCardIsDueToday,
  GivenACardRatedAgain_WhenILookAtCounters_ThenDueCounterIncrements,
  // Shuffle
  GivenCardsAreLoaded_WhenISeeCards_ThenDirectionsAreShuffled,
  // Fix 1: Speech
  GivenThaiToEngFront_WhenDisplayed_ThenThaiIsSpoken,
  GivenEngToThaiBack_WhenDisplayed_ThenThaiIsSpoken,
  GivenThaiToEngBack_WhenDisplayed_ThenEnglishIsNotSpoken,
  GivenEngToThaiFront_WhenDisplayed_ThenEnglishIsNotSpoken,
  // Fix 2: Stats lookup
  GivenOldFormatState_WhenStatsKeyedByVocabId_ThenSchedulePreviewIsCorrect,
  GivenOldFormatState_WhenStatsKeyedByVocabId_ThenAgainShows1Day,
  // Fix 3: Again delay
  GivenACardRatedAgain_WhenINextCard_ThenDifferentCardIsShown,
  GivenMultipleCardsRatedAgain_WhenTheyComeUp_ThenOtherCardsInBetween,
  // Reset State
  GivenSettingsDrawerIsOpen_WhenILookForReset_ThenButtonExists,
  GivenITapReset_WhenConfirmationShown_ThenDialogAppears,
  GivenConfirmationShown_WhenITapCancel_ThenDialogCloses,
  GivenConfirmationShown_WhenITapConfirm_ThenStateResets,
];

function runTests() {
  console.log('Running Thai RPG Test Suite...\n');
  
  for (const TestClass of allTests) {
    testsRun++;
    const testName = TestClass.name;
    
    try {
      const test = new TestClass();
      test.run();
      testsPassed++;
      console.log(`✓ ${testName}`);
    } catch (error) {
      testsFailed++;
      failures.push({ name: testName, error: error.message });
      console.log(`✗ ${testName}`);
      console.log(`  Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Tests run: ${testsRun}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  
  if (testsFailed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('\nAll tests passed! ✓');
    process.exit(0);
  }
}

runTests();
export { runTests, TestCase, testEnv };
