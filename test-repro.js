/**
 * RED test: When episode is selected for a due card, the quiz should show
 * that due card, NOT a new card. Rating "again" on a due card should NOT
 * decrement the "new" counter.
 *
 * Uses the attached real user state to reproduce the bug.
 */

const fs = require('fs');
const path = require('path');

async function runTest() {
  const controllerPath = path.resolve(__dirname, 'app/src/controller/controller.js');
  const { getProps, Handlers } = await import(controllerPath);

  // Load the attached state
  const stateFile = fs.readFileSync('/mnt/agents/upload/state-1780526876069.md', 'utf8');
  let state = JSON.parse(stateFile);

  const env = {
    time: {
      getDay: () => 0,
      getTimestamp: () => Date.now(),
      getDayStart: () => 0,
      getDaysSinceEpoch: () => 20583, // Matches the state
    },
    speakThai: null,
    content: {},
    checkForUpdates: null,
    downloadFile: null,
  };

  function apply(s, updates) {
    // Filter out empty objects
    if (!updates || Object.keys(updates).length === 0) return s;
    return { ...s, ...updates };
  }

  // ===================== REWIND =====================
  // The attached state is at vocab_review showing a new card.
  // Rewind to the start of the act to reproduce the journey.
  state = {
    ...state,
    actPhase: 'lines_before',
    currentLineIndex: 0,
    vocabReviewCardId: null,
    showingAnswer: false,
    // Clear outcome from previous act
    outcomeLine: null,
    outcomePassed: undefined,
    outcomeDelta: undefined,
    outcomeSubplot: undefined,
  };

  console.log('\n=== RED TEST: Due card should be shown, not new card ===\n');
  console.log(`Episode: ${state.currentEpisodeId}, Act: ${state.currentActIndex}`);
  console.log(`AgainQueue: ${JSON.stringify(state.againQueue)}`);
  console.log(`AgainDelayCounter: ${state.againDelayCounter}`);

  // Get episode's first act tag
  const episode = state.episodes.find(e => e.id === state.currentEpisodeId);
  const act = episode.acts[state.currentActIndex];
  console.log(`Act tag: ${act.tag}`);

  // Check which cards are due vs new for this tag
  const tagVocabIds = (state.tags || {})[act.tag] || [];
  const tagCards = state.cards.filter(c => tagVocabIds.includes(c.vocabId));
  const againCardsForTag = tagCards.filter(c => state.againQueue.includes(c.id));
  const newCardsForTag = tagCards.filter(c => {
    const stats = state.cardStats[c.id];
    return !stats || stats.lastReviewed === null;
  });
  console.log(`Tag ${act.tag}: ${againCardsForTag.length} again cards, ${newCardsForTag.length} new cards`);

  // Get counters before
  const propsBefore = getProps(state, env);
  console.log(`\nCounters BEFORE: Due=${propsBefore.dueCount}, New=${propsBefore.newCount}, Left=${propsBefore.leftCount}`);

  // Step 1: Play through lines_before until vocab_review
  let safety = 0;
  while (state.actPhase !== 'vocab_review' && safety < 100) {
    const updates = Handlers.onTapNextLine(state, env);
    state = apply(state, updates);
    safety++;
  }

  const quizCardId = state.vocabReviewCardId;
  const quizCard = state.cards.find(c => c.id === quizCardId);
  const hasStats = quizCardId && state.cardStats[quizCardId];
  const isNewCard = !hasStats;
  const isAgainCard = state.againQueue.includes(quizCardId);

  console.log(`\nQuiz card shown: ${quizCardId}`);
  console.log(`  Is new card: ${isNewCard}`);
  console.log(`  Is again card: ${isAgainCard}`);
  if (quizCard) {
    console.log(`  Front: ${quizCard.front}`);
  }

  // Step 2: Rate "again" (quality 1 per SM-2 convention)
  const propsBeforeRating = getProps(state, env);
  console.log(`\nCounters BEFORE rating: Due=${propsBeforeRating.dueCount}, New=${propsBeforeRating.newCount}, Left=${propsBeforeRating.leftCount}`);

  state = apply(state, Handlers.onRateCard(state, env, quizCardId, 1));

  const propsAfter = getProps(state, env);
  console.log(`Counters AFTER rating:  Due=${propsAfter.dueCount}, New=${propsAfter.newCount}, Left=${propsAfter.leftCount}`);

  // ASSERT: The card shown should be a due card (the again card), not a new card
  // When a due card is rated "again", the "new" counter should NOT decrement
  // (because we didn't consume a new card)
  const newDecremented = propsAfter.newCount < propsBeforeRating.newCount;

  console.log(`\n--- ASSERTIONS ---`);
  console.log(`Card shown is new card: ${isNewCard} (EXPECTED: false)`);
  console.log(`"New" counter decremented: ${newDecremented} (EXPECTED: false)`);

  if (isNewCard || newDecremented) {
    console.log('\n❌ FAIL: A new card was shown instead of the due card');
    console.log('  The episode was selected for an again card (card-415-4.-thai-eng)');
    console.log('  but the quiz showed a new card (card-415-2.-thai-eng) instead.');
    console.log('  Rating "again" on a new card decrements the "new" counter.');
    console.log('  Expected: the due (again) card should have been shown.');
    process.exit(1);
  } else {
    console.log('\n✅ PASS: Due card was shown and "new" counter did not change');
    process.exit(0);
  }
}

runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
