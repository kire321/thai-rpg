/**
 * RED tests for counter bugs:
 * 1. Due card → "again" → "good": "new" should NOT decrement
 * 2. New card → "again": "new" SHOULD decrement
 * 3. Tag display: human-readable name, not machine ID
 * 4. Due date: dd/mm format
 * 5. Skill check: hard choices should sometimes fail
 */

const path = require('path');

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'src/controller/controller.js');
  const { getProps, Handlers } = await import(controllerPath);

  const env = {
    time: { getDay: () => 0, getTimestamp: () => Date.now(), getDayStart: () => 0, getDaysSinceEpoch: () => 100 },
    speakThai: null, content: {}, checkForUpdates: null, downloadFile: null,
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
    if (s.actPhase === 'choice') s = apply(s, Handlers.onTapChoice(s, env, 0));
    if (s.actPhase === 'outcome') s = apply(s, Handlers.onOutcomeDone(s, env));
    return s;
  }

  const episodes = [{
    id: 'ep_test', title: 'Test Episode',
    acts: [{
      tag: 'tag_greetings',
      lines_before: [
        { char: 'char_narrator', line: 'Hello.', character: 'char_narrator', place: 'place_test', dialogue: 'Hello.', stage_directions: [] },
      ],
      lines_after: [{ char: 'char_narrator', line: 'Goodbye.', character: 'char_narrator', place: 'place_test', dialogue: 'Goodbye.', stage_directions: [] }],
      decision: { line: { character: 'char_narrator', place: 'place_test', dialogue: 'Choose.', stage_directions: [] },
        choices: [
          { pass_outcome: { subplot: 'main', delta: 1, line: 'Easy pass.' } },
          { pass_outcome: { subplot: 'main', delta: 1, line: 'Medium pass.' } },
          { pass_outcome: { subplot: 'main', delta: 1, line: 'Hard pass.' } },
        ] },
      consequence: {},
    }],
  }];

  const vocabItems = [
    { id: 'vocab-001', thai: 'สวัสดี', english: 'hello', tags: [] },
    { id: 'vocab-002', thai: 'ขอบคุณ', english: 'thank you', tags: [] },
  ];

  const cards = [
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', tags: [] },
    { id: 'card-001-et', vocabId: 'vocab-001', direction: 'eng-thai', front: 'hello', back: 'สวัสดี', tags: [] },
    { id: 'card-002-te', vocabId: 'vocab-002', direction: 'thai-eng', front: 'ขอบคุณ', back: 'thank you', tags: [] },
    { id: 'card-002-et', vocabId: 'vocab-002', direction: 'eng-thai', front: 'thank you', back: 'ขอบคุณ', tags: [] },
  ];

  const tags = { 'tag_greetings': ['vocab-001', 'vocab-002'] };

  const tagMeta = {
    'tag_greetings': { id: 'tag_greetings', name: 'Greetings', description: 'Basic greetings', picture: null },
  };

  const characters = {
    'char_narrator': { name: 'Narrator', description: 'Voice', picture: null },
  };

  const places = {
    'place_test': { name: 'Test Place', description: 'A place', picture: null },
  };

  function makeState(extra = {}) {
    return {
      episodes, vocabItems, cards, tags,
      characters, places,
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
      episodesPlayedToday: [],
      currentCardIndex: 0,
      pageIndex: 0,
      isSettingsOpen: false,
      subplotScores: {},
      subplots: { main: { name: 'Main' } },
      toast: null,
      cmsBaseUrl: 'https://example.com',
      tagMeta: tagMeta,
      ...extra,
    };
  }

  let exitCode = 0;

  // ===================== BUG 1: Due card → "again" → "good" = "new" should NOT decrement =====================
  console.log('\n=== BUG 1: Due card rated "again" then "good" — "new" counter should NOT change ===\n');

  // Set up: card-001-te is DUE (reviewed yesterday, interval=1, so due today)
  let state = makeState({
    cardStats: {
      'card-001-te': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 99, failedToday: false },
      'card-001-et': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 99, failedToday: false },
    },
    againQueue: ['card-001-te'], // card-001-te failed today, needs re-review
  });

  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  // Rate the due card "again" (quality 1)
  const propsBeforeAgain = getProps(state, env);
  const newCountBeforeAgain = propsBeforeAgain.newCount;
  console.log(`Before rating "again": new=${newCountBeforeAgain}, due=${propsBeforeAgain.dueCount}`);

  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 1));
  const propsAfterAgain = getProps(state, env);
  console.log(`After rating "again": new=${propsAfterAgain.newCount}, due=${propsAfterAgain.dueCount}`);

  // Now play through to next vocab review (the card comes up again)
  state = playAfterVocabReview(state);
  // Need to start a new episode to get another vocab review
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  // Rate the same card "good" (quality 4)
  const propsBeforeGood = getProps(state, env);
  const newCountBeforeGood = propsBeforeGood.newCount;
  console.log(`Before rating "good": new=${newCountBeforeGood}, due=${propsBeforeGood.dueCount}`);

  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));
  const propsAfterGood = getProps(state, env);
  const newCountAfterGood = propsAfterGood.newCount;
  console.log(`After rating "good": new=${newCountAfterGood}, due=${propsAfterGood.dueCount}`);

  if (newCountAfterGood !== newCountBeforeGood) {
    console.log(`  ❌ FAIL: "new" counter changed from ${newCountBeforeGood} to ${newCountAfterGood}`);
    console.log(`     The card was DUE (in againQueue from previous day), not NEW.`);
    console.log(`     Rating a due card "good" should NOT affect the "new" counter.`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: "new" counter did not change when due card rated "good"`);
  }

  // ===================== BUG 2: New card → "again" = "new" SHOULD decrement =====================
  console.log('\n=== BUG 2: New card rated "again" — "new" counter SHOULD decrement ===\n');

  state = makeState(); // fresh state with no cardStats
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const cardId = state.vocabReviewCardId;
  const isNewCard = !state.cardStats || !state.cardStats[cardId];
  console.log(`Card shown: ${cardId}, isNew=${isNewCard}`);

  const propsBefore = getProps(state, env);
  const newBefore = propsBefore.newCount;
  console.log(`Before rating: new=${newBefore}`);

  state = apply(state, Handlers.onRateCard(state, env, cardId, 1)); // "again"
  const propsAfter = getProps(state, env);
  const newAfter = propsAfter.newCount;
  console.log(`After rating "again": new=${newAfter}`);

  if (newAfter >= newBefore) {
    console.log(`  ❌ FAIL: "new" counter did NOT decrement (${newBefore} → ${newAfter})`);
    console.log(`     A new card was rated "again" — the "new" counter should decrement.`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: "new" counter decremented when new card rated "again"`);
  }

  // ===================== BUG 3: Tag display should be human-readable =====================
  console.log('\n=== BUG 3: Tag display should be human-readable name ===\n');

  state = makeState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const propsTag = getProps(state, env);
  const actTag = propsTag.currentActTag;
  console.log(`currentActTag: "${actTag}"`);

  if (actTag === 'tag_greetings') {
    console.log(`  ❌ FAIL: tag is machine ID "tag_greetings" — should be "Greetings"`);
    exitCode = 1;
  } else if (actTag === 'Greetings') {
    console.log(`  ✅ PASS: tag shows human-readable name`);
  } else {
    console.log(`  ⚠️  Unexpected tag: "${actTag}"`);
    exitCode = 1;
  }

  // ===================== BUG 4: Due date should be dd/mm format =====================
  console.log('\n=== BUG 4: Due date should be dd/mm format ===\n');

  state = makeState({
    cardStats: {
      'card-001-te': { repetitions: 1, interval: 5, ef: 2.5, lastReviewed: 95, failedToday: false },
    },
  });
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const propsDate = getProps(state, env);
  const dueDate = propsDate.quizCardDueDate;
  console.log(`quizCardDueDate: "${dueDate}"`);

  // Day 100, lastReviewed=95, interval=5 → due date = 95+5 = 100 → today
  // Expected: "Due 00/00" (day 100 from epoch = April 10, 1970 → 10/04)
  // Or at minimum NOT "Due day 100"
  if (dueDate && dueDate.includes('day')) {
    console.log(`  ❌ FAIL: due date is machine format "${dueDate}" — should be dd/mm`);
    exitCode = 1;
  } else if (dueDate && dueDate.match(/\d{2}\/\d{2}/)) {
    console.log(`  ✅ PASS: due date is in dd/mm format`);
  } else {
    console.log(`  ⚠️  Unexpected format: "${dueDate}"`);
  }

  // ===================== BUG 5: Hard choices should sometimes fail =====================
  console.log('\n=== BUG 5: Skill check — hard choices should sometimes fail ===\n');

  state = makeState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  // Play through lines to reach choice
  state = apply(state, Handlers.onTapNextLine(state, env)); // last lines_before
  state = apply(state, Handlers.onTapNextLine(state, env)); // → choice

  // Try the "hard" choice (index 2) many times
  let passCount = 0;
  const trials = 20;
  for (let i = 0; i < trials; i++) {
    // Reset to choice phase
    let s = { ...state, actPhase: 'choice', outcomeLine: null, outcomePassed: undefined };
    s = apply(s, Handlers.onTapChoice(s, env, 2)); // hard choice
    if (s.outcomePassed === true) passCount++;
  }

  console.log(`Hard choice: ${passCount}/${trials} passed`);

  if (passCount === trials) {
    console.log(`  ❌ FAIL: hard choice ALWAYS succeeds — skill check should sometimes fail`);
    exitCode = 1;
  } else if (passCount < trials) {
    console.log(`  ✅ PASS: hard choice sometimes fails (${trials - passCount} failures)`);
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
