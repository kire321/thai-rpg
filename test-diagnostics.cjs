/**
 * User Journey Tests for Diagnostic Displays
 *
 * These tests simulate user actions and assert that diagnostic props
 * are correctly populated via getProps. They verify that diagnostic
 * displays share code paths with episode selection and card selection.
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'src/controller/controller.js');
  const { getProps, Handlers, getMostOverdueCardInfo, getNextEpisode, getNextEpisodeInfo } = await import(controllerPath);

  const env = {
    time: {
      getDay: () => 0,
      getTimestamp: () => Date.now(),
      getDayStart: () => 0,
      getDaysSinceEpoch: () => 20583,
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

  function playUntilVocabReview(state) {
    let s = state;
    let safety = 0;
    while (s.actPhase !== 'vocab_review' && safety < 100) {
      s = apply(s, Handlers.onTapNextLine(s, env));
      safety++;
    }
    return s;
  }

  function playAfterVocabReview(state) {
    let s = state;
    let safety = 0;
    while (s.actPhase === 'lines_after' && safety < 100) {
      s = apply(s, Handlers.onTapNextLine(s, env));
      safety++;
    }
    if (s.actPhase === 'choice') {
      s = apply(s, Handlers.onTapChoice(s, env, 0));
    }
    if (s.actPhase === 'outcome') {
      s = apply(s, Handlers.onOutcomeDone(s, env));
    }
    return s;
  }

  let exitCode = 0;

  // ===================== TEST DATA =====================
  const episodes = [
    {
      id: 'ep_001',
      acts: [
        {
          tag: 'tag_001',
          lines_before: [
            { speaker: 'N', text: 'Welcome to the temple.' },
            { speaker: 'A', text: 'I need to find the abbot.' },
          ],
          lines_after: [
            { speaker: 'N', text: 'You walk toward the main hall.' },
          ],
          decision: { choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'You found him.' } }] },
          consequence: {},
        },
        {
          tag: 'tag_002',
          lines_before: [
            { speaker: 'B', text: 'Sawatdee khrap.' },
            { speaker: 'A', text: 'Sawatdee khrap.' },
          ],
          lines_after: [
            { speaker: 'N', text: 'You exchange greetings.' },
          ],
          decision: { choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Well done.' } }] },
          consequence: {},
        },
      ],
    },
    {
      id: 'ep_002',
      acts: [
        {
          tag: 'tag_001',
          lines_before: [
            { speaker: 'C', text: 'The temple is beautiful.' },
            { speaker: 'A', text: 'Yes, very peaceful.' },
          ],
          lines_after: [
            { speaker: 'N', text: 'You admire the architecture.' },
          ],
          decision: { choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'You appreciate it.' } }] },
          consequence: {},
        },
        {
          tag: 'tag_003',
          lines_before: [
            { speaker: 'D', text: 'Khun ja pai nai?' },
            { speaker: 'A', text: 'Pai wat.' },
          ],
          lines_after: [
            { speaker: 'N', text: 'You practice directions.' },
          ],
          decision: { choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Good practice.' } }] },
          consequence: {},
        },
      ],
    },
  ];

  const vocabItems = [
    { id: 'vocab-001', thai: 'สวัสดี', english: 'hello', tags: [] },
    { id: 'vocab-002', thai: 'ขอบคุณ', english: 'thank you', tags: [] },
    { id: 'vocab-003', thai: 'ใช่', english: 'yes', tags: [] },
  ];

  const cards = [
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', tags: [] },
    { id: 'card-001-et', vocabId: 'vocab-001', direction: 'eng-thai', front: 'hello', back: 'สวัสดี', tags: [] },
    { id: 'card-002-te', vocabId: 'vocab-002', direction: 'thai-eng', front: 'ขอบคุณ', back: 'thank you', tags: [] },
    { id: 'card-002-et', vocabId: 'vocab-002', direction: 'eng-thai', front: 'thank you', back: 'ขอบคุณ', tags: [] },
    { id: 'card-003-te', vocabId: 'vocab-003', direction: 'thai-eng', front: 'ใช่', back: 'yes', tags: [] },
    { id: 'card-003-et', vocabId: 'vocab-003', direction: 'eng-thai', front: 'yes', back: 'ใช่', tags: [] },
  ];

  const tags = {
    'tag_001': ['vocab-001'],
    'tag_002': ['vocab-002'],
    'tag_003': ['vocab-003'],
  };

  function makeBaseState() {
    return {
      episodes,
      vocabItems,
      cards,
      tags,
      cardStats: {},
      againQueue: [],
      againDelayCounter: 0,
      dateshift: 0,
      currentView: 'welcome',
      currentEpisodeId: null,
      currentActIndex: 0,
      currentLineIndex: 0,
      actPhase: 'lines_before',
      showingAnswer: false,
      vocabReviewCardId: null,
      episodePlays: {},
      currentCardIndex: 0,
      pageIndex: 0,
      isSettingsOpen: false,
      subplotScores: {},
      toast: null,
      cmsBaseUrl: 'https://example.com',
    };
  }

  // ===================== TEST 1: Quiz card shows act tag and due date =====================
  console.log('\n=== TEST 1: Quiz card shows act tag and due date ===\n');

  let state = makeBaseState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const props1 = getProps(state, env);

  console.log(`Act tag: ${props1.currentActTag}`);
  console.log(`Due date: ${props1.quizCardDueDate}`);
  console.log(`Card: ${props1.currentCard?.id}`);

  if (props1.currentActTag !== 'tag_001') {
    console.log(`  ❌ FAIL: currentActTag should be 'tag_001', got '${props1.currentActTag}'`);
    exitCode = 1;
  } else {
    console.log(`  ✅ currentActTag is correct`);
  }

  if (props1.quizCardDueDate !== 'New card') {
    console.log(`  ❌ FAIL: quizCardDueDate should be 'New card' for first review, got '${props1.quizCardDueDate}'`);
    exitCode = 1;
  } else {
    console.log(`  ✅ quizCardDueDate is 'New card' for first review`);
  }

  // ===================== TEST 2: Due card shows correct due date =====================
  console.log('\n=== TEST 2: Due card shows correct due date ===\n');

  // Rate the card "good" so it becomes due later
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));
  state = playAfterVocabReview(state);
  // Complete second act
  state = playUntilVocabReview(state);
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));
  state = playAfterVocabReview(state);

  // Now card-001-te has been reviewed, advance dateshift
  state = apply(state, Handlers.onIncrementDateshift(state, env));
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const props2 = getProps(state, env);
  console.log(`Card: ${props2.currentCard?.id}`);
  console.log(`Due date: ${props2.quizCardDueDate}`);
  console.log(`Act tag: ${props2.currentActTag}`);

  // The quiz card could be card-001-et (reverse direction) which is genuinely new,
  // or it could be a due card. Either way, verify the diagnostic info is populated.
  if (props2.quizCardDueDate === null || props2.quizCardDueDate === undefined) {
    console.log(`  ❌ FAIL: quizCardDueDate should not be null/undefined`);
    exitCode = 1;
  } else if (props2.currentActTag && props2.quizCardDueDate) {
    console.log(`  ✅ quizCardDueDate shows '${props2.quizCardDueDate}', currentActTag shows '${props2.currentActTag}'`);
  } else {
    console.log(`  ❌ FAIL: quizCardDueDate or currentActTag is missing`);
    exitCode = 1;
  }

  // ===================== TEST 3: Again card shows "Due now (again)" =====================
  console.log('\n=== TEST 3: Again card shows "Due now (again)" ===\n');

  state = makeBaseState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);
  // Rate "again" to put card in againQueue
  const firstCardId = state.vocabReviewCardId;
  state = apply(state, Handlers.onRateCard(state, env, firstCardId, 1));
  state = playAfterVocabReview(state);
  // Start new episode - should select episode for the again card
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const props3 = getProps(state, env);
  console.log(`Card: ${props3.currentCard?.id}`);
  console.log(`Due date: ${props3.quizCardDueDate}`);
  console.log(`Is again card: ${state.againQueue.includes(props3.currentCard?.id)}`);

  if (props3.quizCardDueDate !== 'Due now (again)') {
    console.log(`  ❌ FAIL: quizCardDueDate should be 'Due now (again)' for again card, got '${props3.quizCardDueDate}'`);
    exitCode = 1;
  } else {
    console.log(`  ✅ quizCardDueDate is 'Due now (again)' for again card`);
  }

  // ===================== TEST 4: mostOverdueCardInfo shares code path with episode selection =====================
  console.log('\n=== TEST 4: mostOverdueCardInfo shares code path with episode selection ===\n');

  state = makeBaseState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 1)); // again

  const props4 = getProps(state, env);
  const mostOverdue = props4.mostOverdueCardInfo;
  const nextEp = getNextEpisode(state, env);

  console.log(`Most overdue card: ${mostOverdue?.cardId}`);
  console.log(`Most overdue isAgain: ${mostOverdue?.isAgain}`);
  console.log(`Next episode first act tag: ${nextEp?.acts?.[0]?.tag}`);
  console.log(`Most overdue tags: ${JSON.stringify(mostOverdue?.tags)}`);

  if (!mostOverdue) {
    console.log(`  ❌ FAIL: mostOverdueCardInfo should not be null`);
    exitCode = 1;
  } else if (!mostOverdue.isAgain) {
    console.log(`  ❌ FAIL: mostOverdueCardInfo should identify the again card`);
    exitCode = 1;
  } else if (!mostOverdue.tags.includes(nextEp?.acts?.[0]?.tag)) {
    console.log(`  ❌ FAIL: mostOverdueCardInfo tags should include the next episode's first act tag`);
    console.log(`    This proves they share a code path - the same tag that drives episode selection`);
    console.log(`    should be in the most overdue card's tags.`);
    exitCode = 1;
  } else {
    console.log(`  ✅ mostOverdueCardInfo shares code path with episode selection`);
  }

  // ===================== TEST 5: nextEpisodeInfo shares code path with fast forward =====================
  console.log('\n=== TEST 5: nextEpisodeInfo shares code path with fast forward ===\n');

  const props5 = getProps(state, env);
  const nextEpInfo = props5.nextEpisodeInfo;

  // Simulate fast forward
  const ffUpdates = Handlers.onTapNextScenario(state, env);
  const ffEpisodeId = ffUpdates.currentEpisodeId;

  console.log(`nextEpisodeInfo.episodeId: ${nextEpInfo?.episodeId}`);
  console.log(`Fast forward episodeId: ${ffEpisodeId}`);

  if (!nextEpInfo) {
    console.log(`  ❌ FAIL: nextEpisodeInfo should not be null`);
    exitCode = 1;
  } else if (nextEpInfo.episodeId !== ffEpisodeId) {
    console.log(`  ❌ FAIL: nextEpisodeInfo.episodeId (${nextEpInfo.episodeId}) should match fast forward result (${ffEpisodeId})`);
    console.log(`    This proves they share a code path - the diagnostic display should show`);
    console.log(`    the exact same episode that fast forward would select.`);
    exitCode = 1;
  } else {
    console.log(`  ✅ nextEpisodeInfo shares code path with fast forward`);
  }

  // ===================== SUMMARY =====================
  console.log('\n========== SUMMARY ==========');
  if (exitCode) {
    console.log('❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
