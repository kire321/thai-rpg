/**
 * Four bugs + one feature:
 * 1. Schedules: hard/good/easy all show same interval
 * 2. Counters: New should decrement only for first review of new cards
 * 3. Choices: Math.random() always returns same value (seeded)
 * 4. Speaker button: should exist and onSpeakCard handler should work
 * 5. Overpressure valve: when Due>New and tag has no due cards, skip with toast
 */

const path = require('path');

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'app/src/controller/controller.js');
  const { getProps, Handlers, sm2Schedule } = await import(controllerPath);

  let mockTimestamp = Date.now();
  const env = {
    time: { getDay: () => 0, getTimestamp: () => mockTimestamp++, getDayStart: () => 0, getDaysSinceEpoch: () => 100 },
    speakThai: (text) => { /* mock */ }, content: {}, checkForUpdates: null, downloadFile: null,
  };

  function apply(s, updates) {
    if (!updates || Object.keys(updates).length === 0) return s;
    return { ...s, ...updates };
  }

  function playUntilVocabReview(state) {
    let s = state, safety = 0;
    while (s.actPhase !== 'vocab_review' && safety < 100) { s = apply(s, Handlers.onTapNextLine(s, env)); safety++; }
    return s;
  }

  function playAfterVocabReview(state) {
    let s = state, safety = 0;
    while (s.actPhase === 'lines_after' && safety < 100) { s = apply(s, Handlers.onTapNextLine(s, env)); safety++; }
    if (s.actPhase === 'choice') s = apply(s, Handlers.onTapChoice(s, env, 0));
    if (s.actPhase === 'outcome') s = apply(s, Handlers.onOutcomeDone(s, env));
    return s;
  }

  const episodes = [{
    id: 'ep_test', title: 'Test',
    acts: [{
      tag: 'tag_001',
      lines_before: [{ char: 'char_n', line: 'Hi.', character: 'char_n', place: 'place_p', dialogue: 'Hi.', stage_directions: [] }],
      lines_after: [{ char: 'char_n', line: 'Bye.', character: 'char_n', place: 'place_p', dialogue: 'Bye.', stage_directions: [] }],
      decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] },
        choices: [
          { difficulty: 0, pass_outcome: { subplot: 'main', delta: 1, line: 'Easy win' }, fail_outcome: { subplot: 'main', delta: -1, line: 'Easy fail' } },
          { difficulty: 1, pass_outcome: { subplot: 'main', delta: 1, line: 'Med win' }, fail_outcome: { subplot: 'main', delta: -1, line: 'Med fail' } },
          { difficulty: 2, pass_outcome: { subplot: 'main', delta: 1, line: 'Hard win' }, fail_outcome: { subplot: 'main', delta: -1, line: 'Hard fail' } },
        ] },
      consequence: {},
    },
    {
      tag: 'tag_002',  // tag with no due cards (for overpressure test)
      lines_before: [{ char: 'char_n', line: 'Act 2.', character: 'char_n', place: 'place_p', dialogue: 'Act 2.', stage_directions: [] }],
      lines_after: [],
      decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose 2?', stage_directions: [] },
        choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'OK' } }] },
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

  const tags = { 'tag_001': ['vocab-001'], 'tag_002': ['vocab-002'] };

  function makeState(extra = {}) {
    return {
      episodes, vocabItems, cards, tags,
      characters: {}, places: {}, subplots: { main: { name: 'Main' } },
      cardStats: {}, againQueue: [], againDelayCounter: 0, newCardsRatedToday: 0,
      dateshift: 0, currentView: 'welcome', currentEpisodeId: null,
      currentActIndex: 0, currentLineIndex: 0, actPhase: 'lines_before',
      showingAnswer: false, vocabReviewCardId: null,
      episodePlays: {}, episodesPlayedToday: [],
      currentCardIndex: 0, pageIndex: 0,
      isSettingsOpen: false, subplotScores: {}, toast: null,
      cmsBaseUrl: 'https://example.com', tagMeta: {},
      ...extra,
    };
  }

  let exitCode = 0;

  // ===================== BUG 1: Schedules should differ for hard/good/easy =====================
  console.log('\n=== BUG 1: Schedules — hard/good/easy should differ ===\n');

  // Card with repetitions=1, interval=6, ef=2.5
  const stats1 = { repetitions: 1, interval: 6, ef: 2.5 };
  const hard1 = sm2Schedule(3, stats1.repetitions, stats1.interval, stats1.ef);
  const good1 = sm2Schedule(4, stats1.repetitions, stats1.interval, stats1.ef);
  const easy1 = sm2Schedule(5, stats1.repetitions, stats1.interval, stats1.ef);
  console.log(`rep=1: hard=${hard1.interval}d, good=${good1.interval}d, easy=${easy1.interval}d`);

  if (hard1.interval === good1.interval && good1.interval === easy1.interval) {
    console.log(`  ❌ FAIL: All schedules identical (${hard1.interval}d)`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Schedules differ`);
  }

  // Card with repetitions=0, interval=1, ef=2.5
  const stats0 = { repetitions: 0, interval: 1, ef: 2.5 };
  const hard0 = sm2Schedule(3, stats0.repetitions, stats0.interval, stats0.ef);
  const good0 = sm2Schedule(4, stats0.repetitions, stats0.interval, stats0.ef);
  const easy0 = sm2Schedule(5, stats0.repetitions, stats0.interval, stats0.ef);
  console.log(`rep=0: hard=${hard0.interval}d, good=${good0.interval}d, easy=${easy0.interval}d`);

  if (hard0.interval === good0.interval && good0.interval === easy0.interval) {
    console.log(`  ❌ FAIL: All schedules identical (${hard0.interval}d)`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Schedules differ`);
  }

  // ===================== BUG 2a: New card → "again" → New decrements =====================
  console.log('\n=== BUG 2a: New card → "again" → New MUST decrement ===\n');

  let state = makeState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const cardId = state.vocabReviewCardId;
  const beforeNew = getProps(state, env).newCount;
  state = apply(state, Handlers.onRateCard(state, env, cardId, 1)); // again
  const afterNew = getProps(state, env).newCount;
  console.log(`New counter: ${beforeNew} → ${afterNew}`);

  if (afterNew >= beforeNew) {
    console.log(`  ❌ FAIL: New counter should decrement for first review of new card`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: New counter decremented`);
  }

  // ===================== BUG 2b: Due card (was again) → "Good" → New stays ====
  console.log('\n=== BUG 2b: Due card (was "again") → "Good" → New MUST stay ===\n');

  state = makeState({
    cardStats: { 'card-001-te': { repetitions: 0, interval: 1, ef: 2.5, lastReviewed: 100, failedToday: true } },
    againQueue: ['card-001-te'],
  });
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const beforeDue = getProps(state, env).newCount;
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4)); // good
  const afterDue = getProps(state, env).newCount;
  console.log(`New counter: ${beforeDue} → ${afterDue}`);

  if (afterDue !== beforeDue) {
    console.log(`  ❌ FAIL: New counter changed for due card — should stay same`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: New counter unchanged for due card`);
  }

  // ===================== BUG 2c: Due card from yesterday → "Good" → New stays ====
  console.log('\n=== BUG 2c: Due card from yesterday → "Good" → New MUST stay ===\n');

  state = makeState({
    cardStats: { 'card-001-te': { repetitions: 2, interval: 6, ef: 2.5, lastReviewed: 94, failedToday: false } },
  });
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const beforeYesterday = getProps(state, env).newCount;
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4)); // good
  const afterYesterday = getProps(state, env).newCount;
  console.log(`New counter: ${beforeYesterday} → ${afterYesterday}`);

  if (afterYesterday !== beforeYesterday) {
    console.log(`  ❌ FAIL: New counter changed for due card from yesterday`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: New counter unchanged for due card from yesterday`);
  }

  // ===================== BUG 3: Choices should vary (not always fail/pass) =====================
  console.log('\n=== BUG 3: Skill check — choices should vary ===\n');

  state = makeState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = apply(state, Handlers.onTapNextLine(state, env));
  state = apply(state, Handlers.onTapNextLine(state, env)); // → choice

  let passCount = 0;
  const trials = 30;
  for (let i = 0; i < trials; i++) {
    let s = { ...state, actPhase: 'choice', outcomeLine: null, outcomePassed: undefined, outcomeSubplot: undefined };
    s = apply(s, Handlers.onTapChoice(s, env, 0)); // easy
    if (s.outcomePassed === true) passCount++;
  }
  console.log(`Easy choice: ${passCount}/${trials} passed`);

  if (passCount === 0) {
    console.log(`  ❌ FAIL: Easy choice ALWAYS fails — should succeed most of the time`);
    exitCode = 1;
  } else if (passCount === trials) {
    console.log(`  ❌ FAIL: Easy choice ALWAYS succeeds — should vary`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Easy choice varies (${passCount} passes, ${trials - passCount} fails)`);
  }

  // Hard choice should fail more than easy
  let hardPassCount = 0;
  for (let i = 0; i < trials; i++) {
    let s = { ...state, actPhase: 'choice', outcomeLine: null, outcomePassed: undefined, outcomeSubplot: undefined };
    s = apply(s, Handlers.onTapChoice(s, env, 2)); // hard
    if (s.outcomePassed === true) hardPassCount++;
  }
  console.log(`Hard choice: ${hardPassCount}/${trials} passed`);

  if (hardPassCount > passCount) {
    console.log(`  ❌ FAIL: Hard choice succeeds MORE than easy (${hardPassCount} vs ${passCount})`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Hard choice fails more than easy`);
  }

  // ===================== FEATURE: Overpressure valve =====================
  console.log('\n=== FEATURE: Overpressure valve ===\n');

  // Set up: due > new, act 1 (tag_002) has no due cards for its vocab
  // tag_001 has vocab-001 with card-001-te/et — make these due
  // tag_002 has vocab-002 with card-002-te/et — leave these new (no stats)
  // Due count = 2 (both card-001-te and card-001-et are due)
  // New count = 10 (no newCardsRatedToday)
  // So Due(2) is NOT > New(10) — need more due cards
  // Make card-001-te/et due by setting lastReviewed far in past
  state = makeState({
    cardStats: {
      'card-001-te': { repetitions: 2, interval: 6, ef: 2.5, lastReviewed: 50, failedToday: false },
      'card-001-et': { repetitions: 2, interval: 6, ef: 2.5, lastReviewed: 50, failedToday: false },
    },
    againQueue: ['card-001-te', 'card-001-et'], // 2 due cards
    newCardsRatedToday: 7, // New = 10 - 7 = 3, so Due(2) < New(3) — not overpressure
    currentView: 'episode',
    currentEpisodeId: 'ep_test',
    currentActIndex: 1, // act 1 = tag_002 (vocab-002, cards are NEW)
    actPhase: 'lines_before',
    currentLineIndex: 0,
  });
  // Due=2, New=3 — not overpressure. Quiz should show normally.
  state = playUntilVocabReview(state);
  let skipped = state.actPhase !== 'vocab_review';
  console.log(`Due=2, New=3 (not overpressure): quiz ${skipped ? 'SKIPPED' : 'shown'}`);
  if (skipped) {
    console.log(`  ❌ FAIL: Quiz should NOT be skipped when Due <= New`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Quiz shown when Due <= New`);
  }

  // Now test actual overpressure: Due=12, New=3
  // Create 10 more due cards by adding them to cards and stats
  const extraCards = [];
  const extraStats = {};
  for (let i = 3; i < 13; i++) {
    const vid = `vocab-extra-${i}`;
    extraCards.push({ id: `card-${i}-te`, vocabId: vid, direction: 'thai-eng', front: `Extra ${i}`, back: `Extra ${i} en`, tags: [] });
    extraCards.push({ id: `card-${i}-et`, vocabId: vid, direction: 'eng-thai', front: `Extra ${i} en`, back: `Extra ${i}`, tags: [] });
    // Put these in tag_001 so they count as due
    extraStats[`card-${i}-te`] = { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 99, failedToday: false };
  }
  state = makeState({
    cards: [...cards, ...extraCards],
    tags: { 'tag_001': ['vocab-001', 'vocab-002', ...extraCards.filter(c => c.direction === 'thai-eng').map(c => c.vocabId)], 'tag_002': ['vocab-002'] },
    cardStats: {
      'card-001-te': { repetitions: 2, interval: 6, ef: 2.5, lastReviewed: 50, failedToday: false },
      'card-001-et': { repetitions: 2, interval: 6, ef: 2.5, lastReviewed: 50, failedToday: false },
      ...extraStats,
    },
    againQueue: ['card-001-te', 'card-001-et'], // 2 in againQueue
    newCardsRatedToday: 7, // New = 10 - 7 = 3
    currentView: 'episode',
    currentEpisodeId: 'ep_test',
    currentActIndex: 1, // act 1 = tag_002 (no due cards for this tag!)
    actPhase: 'lines_before',
    currentLineIndex: 0,
  });
  // Due = 2 (againQueue) + 10 (extra overdue) = 12. New = 3. Due > New = overpressure!
  // tag_002 has vocab-002 → cards card-002-te/et, both NEW (no stats) → no due cards for tag
  state = playUntilVocabReview(state);
  skipped = state.actPhase !== 'vocab_review';
  console.log(`Due=12, New=3, tag has no due cards: quiz ${skipped ? 'SKIPPED' : 'shown'}`);
  console.log(`Toast: ${state.toast || '(none)'}`);
  if (!skipped) {
    console.log(`  ❌ FAIL: Quiz should be skipped when Due>New and tag has no due cards`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Quiz skipped with overpressure valve`);
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
