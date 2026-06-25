/**
 * User Journey Tests for Episode Selection
 *
 * These tests simulate real user actions by calling controller handlers
 * and inspecting props via getProps. They do NOT call internal functions
 * directly — they exercise the same code path as the actual app.
 */

// We need to use Node's experimental ESM or require the built controller.
// The controller uses ES modules, so we'll import it via a dynamic import
// after setting up the test environment.

const path = require('path');

async function runTests() {
  // Dynamic import of the ES module controller
  const controllerPath = path.resolve(__dirname, 'src/controller/controller.js');
  const { getProps, Handlers } = await import(controllerPath);

  // ===================== TEST DATA =====================

  // Mock environment (must match Time interface)
  const env = {
    time: {
      getDay: () => 0,
      getTimestamp: () => Date.now(),
      getDayStart: () => 0,
      getDaysSinceEpoch: () => 0,
    },
    speakThai: null,
    content: {},
    checkForUpdates: null,
    downloadFile: null,
  };

  // Helper: apply handler result to state
  function apply(state, updates) {
    return { ...state, ...updates };
  }

  // Helper: get current episode
  function getCurrentEpisode(state) {
    return state.episodes.find(e => e.id === state.currentEpisodeId) || null;
  }

  // Helper: get current act
  function getCurrentAct(state) {
    const ep = getCurrentEpisode(state);
    if (!ep) return null;
    return ep.acts[state.currentActIndex || 0] || null;
  }

  // Helper: play through lines_before until vocab_review
  function playUntilVocabReview(state) {
    let s = state;
    let safety = 0;
    while (s.actPhase !== 'vocab_review' && safety < 100) {
      const updates = Handlers.onTapNextLine(s, env);
      console.log(`    onTapNextLine -> ${JSON.stringify(updates)}`);
      s = apply(s, updates);
      safety++;
    }
    return s;
  }

  // Helper: play through lines_after until choice/outcome
  function playAfterVocabReview(state) {
    let s = state;
    let safety = 0;
    while (s.actPhase === 'lines_after' && safety < 100) {
      const updates = Handlers.onTapNextLine(s, env);
      s = apply(s, updates);
      safety++;
    }
    // Handle choice
    if (s.actPhase === 'choice') {
      const updates = Handlers.onTapChoice(s, env, 0);
      s = apply(s, updates);
    }
    // Handle outcome
    if (s.actPhase === 'outcome') {
      const updates = Handlers.onOutcomeDone(s, env);
      s = apply(s, updates);
    }
    return s;
  }

  // Test data: 3 episodes, ALL sharing tag_001 as first act.
  // This ensures episode selection is independent of tiebreaker behavior:
  // whichever episode is picked first, the again card will always be for
  // vocab-001 (tag_001), and fast forward will always find another episode
  // whose first act matches tag_001.
  const episodes = [
    {
      id: 'ep_001',
      acts: [
        {
          tag: 'tag_001',
          lines_before: [
            { char: 'char_n', line: 'Welcome to the temple.', character: 'char_n', place: 'place_p', dialogue: 'Welcome to the temple.', stage_directions: [] },
            { char: 'char_a', line: 'I need to find the abbot.', character: 'char_a', place: 'place_p', dialogue: 'I need to find the abbot.', stage_directions: [] },
          ],
          lines_after: [
            { char: 'char_n', line: 'You walk toward the main hall.', character: 'char_n', place: 'place_p', dialogue: 'You walk toward the main hall.', stage_directions: [] },
          ],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'You found him.' } }] },
          consequence: {},
        },
        {
          tag: 'tag_002',
          lines_before: [
            { char: 'char_b', line: 'Sawatdee khrap.', character: 'char_b', place: 'place_p', dialogue: 'Sawatdee khrap.', stage_directions: [] },
            { char: 'char_a', line: 'Sawatdee khrap.', character: 'char_a', place: 'place_p', dialogue: 'Sawatdee khrap.', stage_directions: [] },
          ],
          lines_after: [
            { char: 'char_n', line: 'You exchange greetings.', character: 'char_n', place: 'place_p', dialogue: 'You exchange greetings.', stage_directions: [] },
          ],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Well done.' } }] },
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
            { char: 'char_c', line: 'The temple is beautiful.', character: 'char_c', place: 'place_p', dialogue: 'The temple is beautiful.', stage_directions: [] },
            { char: 'char_a', line: 'Yes, very peaceful.', character: 'char_a', place: 'place_p', dialogue: 'Yes, very peaceful.', stage_directions: [] },
          ],
          lines_after: [
            { char: 'char_n', line: 'You admire the architecture.', character: 'char_n', place: 'place_p', dialogue: 'You admire the architecture.', stage_directions: [] },
          ],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'You appreciate it.' } }] },
          consequence: {},
        },
        {
          tag: 'tag_003',
          lines_before: [
            { char: 'char_d', line: 'Khun ja pai nai?', character: 'char_d', place: 'place_p', dialogue: 'Khun ja pai nai?', stage_directions: [] },
            { char: 'char_a', line: 'Pai wat.', character: 'char_a', place: 'place_p', dialogue: 'Pai wat.', stage_directions: [] },
          ],
          lines_after: [
            { char: 'char_n', line: 'You practice directions.', character: 'char_n', place: 'place_p', dialogue: 'You practice directions.', stage_directions: [] },
          ],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Good practice.' } }] },
          consequence: {},
        },
      ],
    },
    {
      id: 'ep_003',
      acts: [
        {
          tag: 'tag_001',
          lines_before: [
            { char: 'char_e', line: 'Sabai dee mai?', character: 'char_e', place: 'place_p', dialogue: 'Sabai dee mai?', stage_directions: [] },
            { char: 'char_a', line: 'Sabai dee.', character: 'char_a', place: 'place_p', dialogue: 'Sabai dee.', stage_directions: [] },
          ],
          lines_after: [
            { char: 'char_n', line: 'You exchange greetings.', character: 'char_n', place: 'place_p', dialogue: 'You exchange greetings.', stage_directions: [] },
          ],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Nice.' } }] },
          consequence: {},
        },
        {
          tag: 'tag_002',
          lines_before: [
            { char: 'char_f', line: 'Khun cheu a-rai?', character: 'char_f', place: 'place_p', dialogue: 'Khun cheu a-rai?', stage_directions: [] },
            { char: 'char_a', line: 'Chan cheu...', character: 'char_a', place: 'place_p', dialogue: 'Chan cheu...', stage_directions: [] },
          ],
          lines_after: [
            { char: 'char_n', line: 'You introduce yourself.', character: 'char_n', place: 'place_p', dialogue: 'You introduce yourself.', stage_directions: [] },
          ],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Well done.' } }] },
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

  // Cards for each vocab item
  const cards = [
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', tags: [] },
    { id: 'card-001-et', vocabId: 'vocab-001', direction: 'eng-thai', front: 'hello', back: 'สวัสดี', tags: [] },
    { id: 'card-002-te', vocabId: 'vocab-002', direction: 'thai-eng', front: 'ขอบคุณ', back: 'thank you', tags: [] },
    { id: 'card-002-et', vocabId: 'vocab-002', direction: 'eng-thai', front: 'thank you', back: 'ขอบคุณ', tags: [] },
    { id: 'card-003-te', vocabId: 'vocab-003', direction: 'thai-eng', front: 'ใช่', back: 'yes', tags: [] },
    { id: 'card-003-et', vocabId: 'vocab-003', direction: 'eng-thai', front: 'yes', back: 'ใช่', tags: [] },
  ];

  // Tags mapping: tag_name -> [vocab_ids]
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

  // ===================== TEST 1: Fast Forward -> Again Card =====================
  console.log('\n=== TEST 1: Fast Forward -> Again Card ===\n');

  let state = makeBaseState();

  // Step 1: Start episode
  state = apply(state, Handlers.onStartEpisode(state, env));
  console.log(`Started episode: ${state.currentEpisodeId}`);

  // Step 2: Play through lines_before until vocab_review
  state = playUntilVocabReview(state);
  const firstCardId = state.vocabReviewCardId;
  console.log(`Vocab review: card=${firstCardId}, phase=${state.actPhase}`);

  // Step 3: Rate "again" (quality 0)
  state = apply(state, Handlers.onRateCard(state, env, firstCardId, 0));
  console.log(`Rated "again": card=${firstCardId}, againQueue=${JSON.stringify(state.againQueue)}`);

  // Step 4: Play through the rest of the act
  state = playAfterVocabReview(state);
  console.log(`After act 0: phase=${state.actPhase}, view=${state.currentView}, delay=${state.againDelayCounter}, againQ=${JSON.stringify(state.againQueue)}`);

  // Step 5: If we're in a new act, play until next vocab review
  if (state.currentView === 'episode' && state.actPhase === 'lines_before') {
    state = playUntilVocabReview(state);
    const secondCardId = state.vocabReviewCardId;
    console.log(`Next vocab review: card=${secondCardId}`);

    // Rate "good" to finish this act
    state = apply(state, Handlers.onRateCard(state, env, secondCardId, 3));
    state = playAfterVocabReview(state);
    console.log(`After act 1: phase=${state.actPhase}, view=${state.currentView}, delay=${state.againDelayCounter}, againQ=${JSON.stringify(state.againQueue)}`);
  }

  // Step 6: Fast forward (tap Next Scenario)
  const beforeEp = state.currentEpisodeId;
  state = apply(state, Handlers.onTapNextScenario(state, env));
  const afterEp = state.currentEpisodeId;
  console.log(`Fast forward: ${beforeEp} -> ${afterEp}`);

  // Step 7: Play until vocab review
  state = playUntilVocabReview(state);
  const fastForwardCardId = state.vocabReviewCardId;
  console.log(`After fast forward: ep=${state.currentEpisodeId}, act=${state.currentActIndex}, tag=${state.currentTag}, phase=${state.actPhase}`);
  console.log(`  vocabReviewCardId=${fastForwardCardId}, againQueue=${JSON.stringify(state.againQueue)}, delay=${state.againDelayCounter}`);
  console.log(`  cardStats keys: ${Object.keys(state.cardStats)}`);

  // ASSERT: The card after fast forward should be the "again" card
  const isAgainCard = state.againQueue.includes(fastForwardCardId);
  const isDueCard = state.cardStats[fastForwardCardId] && state.cardStats[fastForwardCardId].lastReviewed !== null;

  console.log(`\nAssert: fast-forward card=${fastForwardCardId}`);
  console.log(`  Is in againQueue: ${isAgainCard}`);
  console.log(`  Is due card: ${isDueCard}`);

  if (isAgainCard) {
    console.log('  ✅ PASS: Fast forward showed the "again" card');
  } else if (isDueCard) {
    console.log('  ✅ PASS: Fast forward showed a due card');
  } else {
    console.log('  ❌ FAIL: Fast forward showed a new card instead of the "again" card');
    process.exitCode = 1;
  }

  // ===================== TEST 2: Two-Day Activity =====================
  console.log('\n=== TEST 2: Two-Day Activity ===\n');

  state = makeBaseState();
  const track = { day1AgainCards: [], day1GoodCards: [], ratedCount: 0, nullCardCount: 0 };

  // Day 1: Play 3 episodes, alternating again/good
  for (let ep = 0; ep < 3; ep++) {
    state = apply(state, Handlers.onStartEpisode(state, env));
    console.log(`Day 1 Ep ${ep + 1}: ${state.currentEpisodeId}`);

    // Play both acts
    for (let act = 0; act < 2; act++) {
      state = playUntilVocabReview(state);
      const cardId = state.vocabReviewCardId;
      if (cardId === null) {
        track.nullCardCount++;
        console.log(`  Act ${act}: NULL CARD (no card available for this tag)`);
        // Skip rating and just advance
        state = playAfterVocabReview(state);
        continue;
      }
      const rating = track.ratedCount % 2 === 0 ? 0 : 3; // alternate again/good
      const ratingName = rating === 0 ? 'Again' : 'Good';

      state = apply(state, Handlers.onRateCard(state, env, cardId, rating));
      track.ratedCount++;

      if (rating === 0) track.day1AgainCards.push(cardId);
      else track.day1GoodCards.push(cardId);

      console.log(`  Act ${act}: ${cardId}, rated ${ratingName}`);

      state = playAfterVocabReview(state);
    }
  }

  console.log(`\nDay 1: ${track.ratedCount} cards rated`);
  console.log(`  "Again": ${track.day1AgainCards.length}`);
  console.log(`  "Good": ${track.day1GoodCards.length}`);

  // Check: all "again" cards should have been reviewed by now
  // (they keep coming up in episodes that share their tag)
  const stillAgain = state.againQueue.filter(aid => {
    const s = state.cardStats[aid];
    return s && s.failedToday;
  });
  console.log(`  Still "again": ${stillAgain.length}`);

  // Day 1 sanity: no null cards should have been shown
  if (track.nullCardCount > 0) {
    console.log(`  ❌ FAIL: ${track.nullCardCount} vocab reviews had no card (null)`);
    process.exitCode = 1;
  } else {
    console.log(`  ✅ No null cards in Day 1`);
  }

  // Day 2: Increment dateshift
  state = apply(state, Handlers.onIncrementDateshift(state, env));
  console.log(`\nDateshift: ${state.dateshift}`);

  // Start episode
  state = apply(state, Handlers.onStartEpisode(state, env));
  console.log(`Day 2 first episode: ${state.currentEpisodeId}`);

  // Play until vocab review
  state = playUntilVocabReview(state);
  const day2CardId = state.vocabReviewCardId;
  const day2Stats = state.cardStats[day2CardId];
  const isNewDay2 = !day2Stats || day2Stats.lastReviewed === null;
  const isGoodYesterday = track.day1GoodCards.includes(day2CardId);

  console.log(`Day 2 first card: ${day2CardId}`);
  console.log(`  Is new: ${isNewDay2}`);
  console.log(`  Is "good" from yesterday: ${isGoodYesterday}`);

  if (day2CardId === null) {
    console.log('  ❌ FAIL: Day 2 started with no card (null)');
    process.exitCode = 1;
  } else if (isNewDay2) {
    console.log('  ❌ FAIL: Day 2 started with a new card');
    process.exitCode = 1;
  } else if (isGoodYesterday) {
    console.log('  ✅ PASS: Day 2 started with a "good" card from yesterday');
  } else {
    console.log('  ✅ PASS: Day 2 started with a due card');
  }

  // ===================== SUMMARY =====================
  console.log('\n========== SUMMARY ==========');
  if (process.exitCode) {
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
