/**
 * RED test: When episode is selected for a due card, the quiz should show
 * that due card, NOT a new card. Rating "again" on a due card should NOT
 * decrement the "new" counter.
 *
 * This test reproduces the bug using only handler calls (no state file).
 *
 * Bug scenario: A tag contains multiple vocab items. The episode is selected
 * because vocab-001 has a card in the againQueue. But the quiz incorrectly
 * shows a new card from vocab-002 (same tag) instead of the due card.
 *
 * Root cause: getQuizCardForTag must check againQueue cards FIRST before
 * falling through to new/due card selection. If it doesn't, the locked
 * vocabId mechanism (lockedVocabIds) filters out the partner card of the
 * again card, potentially leaving only new cards in availableTagCards.
 */

const path = require('path');

async function runTest() {
  const controllerPath = path.resolve(__dirname, 'src/controller/controller.js');
  const { getProps, Handlers } = await import(controllerPath);

  const env = {
    time: {
      getDay: () => 0,
      getTimestamp: () => Date.now(),
      getDayStart: () => 0,
      getDaysSinceEpoch: () => 100,
    },
    speakThai: null,
    content: {},
    checkForUpdates: null,
    downloadFile: null,
  };

  function apply(s, updates) {
    if (!updates || Object.keys(updates).length === 0) return s;
    return { ...s, ...updates };
  }

  // ===================== TEST DATA =====================
  // A tag with TWO vocab items. The episode is selected because
  // card-001-te (vocab-001, thai-eng) is in the againQueue.
  // card-002-te (vocab-002, thai-eng) is a NEW card.
  // When entering vocab_review, the quiz MUST show card-001-te
  // (the due/again card), NOT card-002-te (the new card).
  const episodes = [
    {
      id: 'ep_test',
      title: 'Test Episode',
      acts: [
        {
          tag: 'tag_mixed', // This tag has both vocab-001 and vocab-002
          lines_before: [
            { char: 'char_n', line: 'Welcome.', character: 'char_n', place: 'place_p', dialogue: 'Welcome.', stage_directions: [] },
          ],
          lines_after: [
            { char: 'char_n', line: 'Continue.', character: 'char_n', place: 'place_p', dialogue: 'Continue.', stage_directions: [] },
          ],
          decision: {
            line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] },
            choices: [
              { pass_outcome: { subplot: 'main', delta: 1, line: 'Done' } },
            ],
          },
          consequence: {},
        },
      ],
    },
  ];

  const vocabItems = [
    { id: 'vocab-001', thai: 'สวัสดี', english: 'hello', phonetics: 'sa-wat-dii' },
    { id: 'vocab-002', thai: 'ขอบคุณ', english: 'thank you', phonetics: 'khop-khun' },
  ];

  // 4 cards: 2 directions per vocab item
  const cards = [
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', phonetics: 'sa-wat-dii' },
    { id: 'card-001-et', vocabId: 'vocab-001', direction: 'eng-thai', front: 'hello', back: 'สวัสดี', phonetics: 'sa-wat-dii' },
    { id: 'card-002-te', vocabId: 'vocab-002', direction: 'thai-eng', front: 'ขอบคุณ', back: 'thank you', phonetics: 'khop-khun' },
    { id: 'card-002-et', vocabId: 'vocab-002', direction: 'eng-thai', front: 'thank you', back: 'ขอบคุณ', phonetics: 'khop-khun' },
  ];

  const tags = {
    'tag_mixed': ['vocab-001', 'vocab-002'],
  };

  // card-001-te: in againQueue (failed today, due NOW)
  // card-001-et: reviewed yesterday, interval=6 (not due until day 106)
  // card-002-te: NEVER reviewed (new card)
  // card-002-et: NEVER reviewed (new card)
  const cardStats = {
    'card-001-te': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 99, failedToday: true },
    'card-001-et': { repetitions: 2, interval: 6, ef: 2.5, lastReviewed: 99, failedToday: false },
  };
  // card-002-te and card-002-et have NO stats => they are NEW cards

  const againQueue = ['card-001-te']; // The due card that should be shown

  let state = {
    episodes,
    vocabItems,
    cards,
    tags,
    cardStats,
    againQueue,
    againDelayCounter: 0,
    newCardsRatedToday: 0,
    dateshift: 0,
    currentView: 'welcome',
    currentEpisodeId: null,
    currentActIndex: 0,
    currentLineIndex: 0,
    actPhase: 'lines_before',
    showingAnswer: false,
    vocabReviewCardId: null,
    episodePlays: {},
    episodesPlayedToday: [],
    currentCardIndex: 0,
    pageIndex: 0,
    isSettingsOpen: false,
    subplotScores: {},
    toast: null,
    cmsBaseUrl: 'https://q4kgqw3jj72wa.kimi.page',
    characters: {},
    places: {},
    subplots: { main: { name: 'Main' } },
  };

  console.log('\n=== RED TEST: Due card should be shown, not new card ===\n');
  console.log(`Episode: ${state.episodes[0].id}, Act tag: tag_mixed`);
  console.log(`AgainQueue: ${JSON.stringify(state.againQueue)}`);
  console.log(`Tag vocab items: ${JSON.stringify(tags.tag_mixed)}`);
  console.log(`Card-001-te (vocab-001): AGAIN (failed today)`);
  console.log(`Card-002-te (vocab-002): NEW (never reviewed)`);

  // Get counters before
  const propsBefore = getProps(state, env);
  console.log(`\nCounters BEFORE: Due=${propsBefore.dueCount}, New=${propsBefore.newCount}, Left=${propsBefore.leftCount}`);

  // Step 1: Start the episode
  state = apply(state, Handlers.onStartEpisode(state, env));
  console.log(`\nStarted episode: ${state.currentEpisodeId}`);

  // Step 2: Play through lines_before until vocab_review
  let safety = 0;
  while (state.actPhase !== 'vocab_review' && safety < 100) {
    const updates = Handlers.onTapNextLine(state, env);
    state = apply(state, updates);
    safety++;
  }

  const quizCardId = state.vocabReviewCardId;
  const quizCard = state.cards.find(c => c.id === quizCardId);
  const quizCardStats = quizCardId ? state.cardStats[quizCardId] : null;
  const isNewCard = !quizCardStats || quizCardStats.lastReviewed === null;
  const isAgainCard = state.againQueue.includes(quizCardId);

  console.log(`\n--- Quiz card shown: ${quizCardId} ---`);
  console.log(`  Is new card: ${isNewCard} (EXPECTED: false)`);
  console.log(`  Is again card: ${isAgainCard} (EXPECTED: true)`);
  console.log(`  Front: ${quizCard?.front || 'N/A'}`);

  // Step 3: Rate "again" (quality 1)
  const propsBeforeRating = getProps(state, env);
  console.log(`\nCounters BEFORE rating: Due=${propsBeforeRating.dueCount}, New=${propsBeforeRating.newCount}`);

  state = apply(state, Handlers.onRateCard(state, env, quizCardId, 1));

  const propsAfter = getProps(state, env);
  console.log(`Counters AFTER rating:  Due=${propsAfter.dueCount}, New=${propsAfter.newCount}`);

  const newDecremented = propsAfter.newCount < propsBeforeRating.newCount;

  console.log(`\n--- ASSERTIONS ---`);
  console.log(`Card shown is new card: ${isNewCard} (EXPECTED: false)`);
  console.log(`Card shown is again card: ${isAgainCard} (EXPECTED: true)`);
  console.log(`"New" counter decremented: ${newDecremented} (EXPECTED: false)`);

  if (isNewCard) {
    console.log('\n❌ FAIL: A NEW card was shown instead of the due (again) card');
    console.log(`  Expected: card-001-te (in againQueue)`);
    console.log(`  Got:      ${quizCardId} (new card, never reviewed)`);
    process.exit(1);
  } else if (!isAgainCard) {
    console.log('\n❌ FAIL: The card shown is not in the againQueue');
    console.log(`  Expected: card-001-te (in againQueue)`);
    console.log(`  Got:      ${quizCardId}`);
    process.exit(1);
  } else if (newDecremented) {
    console.log('\n❌ FAIL: The "new" counter decremented after rating a due card');
    console.log('  Rating a due card should NOT affect the new counter.');
    process.exit(1);
  } else {
    console.log('\n✅ PASS: Due (again) card was shown and "new" counter did not change');
    process.exit(0);
  }
}

runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
