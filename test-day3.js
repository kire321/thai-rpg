/**
 * Three bugs:
 * 1. New counter doesn't reset to 10 on app open (new day)
 * 2. First rating schedule for new/again cards: hard=1d, good=1d, easy=2d
 * 3. Choices always fail (Math.sin entropy broken in browser)
 */

const path = require('path');

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'app/src/controller/controller.js');
  const { getProps, Handlers, sm2Schedule } = await import(controllerPath);

  const env = {
    time: { getDay: () => 0, getTimestamp: () => Date.now(), getDayStart: () => 0, getDaysSinceEpoch: () => 100 },
    speakThai: () => {}, content: {}, checkForUpdates: null, downloadFile: null,
  };

  function apply(s, updates) {
    if (!updates || Object.keys(updates).length === 0) return s;
    return { ...s, ...updates };
  }

  function playUntilVocabReview(state) {
    let s = state, safety = 0;
    while (s.actPhase !== 'vocab_review' && safety < 100) {
      s = apply(s, Handlers.onTapNextLine(s, env));
      safety++;
    }
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
          { difficulty: 0, pass_outcome: { subplot: 'main', delta: 1, line: 'Pass' } },
          { difficulty: 2, pass_outcome: { subplot: 'main', delta: 1, line: 'Pass' }, fail_outcome: { subplot: 'main', delta: -1, line: 'Fail' } },
        ] },
      consequence: {},
    }],
  }];

  const vocabItems = [{ id: 'vocab-001', thai: 'สวัสดี', english: 'hello', tags: [] }];
  const cards = [
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', tags: [] },
    { id: 'card-001-et', vocabId: 'vocab-001', direction: 'eng-thai', front: 'hello', back: 'สวัสดี', tags: [] },
  ];
  const tags = { 'tag_001': ['vocab-001'] };

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

  // ===================== BUG 1: New counter resets to 10 on new day =====================
  console.log('\n=== BUG 1: New counter resets to 10 on new day ===\n');

  // Yesterday: rated 3 new cards. newCardsRatedToday=3, New=7
  // Today (day 101): open app, New should be 10 again
  let state = makeState({
    cardStats: {
      'card-001-te': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 100, failedToday: false },
      'card-001-et': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 100, failedToday: false },
    },
    newCardsRatedToday: 3, // 3 new cards rated yesterday
  });

  const props = getProps(state, env);
  console.log(`newCardsRatedToday=3 (from yesterday), New count: ${props.newCount}`);

  if (props.newCount !== 10) {
    console.log(`  ❌ FAIL: New counter should be 10 on a new day, got ${props.newCount}`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: New counter reset to 10`);
  }

  // ===================== BUG 2: First rating schedule for new card =====================
  console.log('\n=== BUG 2: First rating schedule for new/again card ===\n');

  const newStats = { repetitions: 0, interval: 0, ef: 2.5 };
  const hard = sm2Schedule(3, newStats.repetitions, newStats.interval, newStats.ef);
  const good = sm2Schedule(4, newStats.repetitions, newStats.interval, newStats.ef);
  const easy = sm2Schedule(5, newStats.repetitions, newStats.interval, newStats.ef);
  console.log(`New card: hard=${hard.interval}d, good=${good.interval}d, easy=${easy.interval}d`);
  console.log(`Expected: hard=1d, good=1d, easy=2d`);

  if (hard.interval !== 1) { console.log(`  ❌ FAIL: hard should be 1d, got ${hard.interval}d`); exitCode = 1; }
  else if (good.interval !== 1) { console.log(`  ❌ FAIL: good should be 1d, got ${good.interval}d`); exitCode = 1; }
  else if (easy.interval !== 2) { console.log(`  ❌ FAIL: easy should be 2d, got ${easy.interval}d`); exitCode = 1; }
  else { console.log(`  ✅ PASS: All intervals correct`); }

  // Also test "again" card (rep=0 after reset)
  const againStats = { repetitions: 0, interval: 1, ef: 2.5 };
  const againHard = sm2Schedule(3, againStats.repetitions, againStats.interval, againStats.ef);
  const againGood = sm2Schedule(4, againStats.repetitions, againStats.interval, againStats.ef);
  const againEasy = sm2Schedule(5, againStats.repetitions, againStats.interval, againStats.ef);
  console.log(`Again card: hard=${againHard.interval}d, good=${againGood.interval}d, easy=${againEasy.interval}d`);

  if (againHard.interval !== 1 || againGood.interval !== 1 || againEasy.interval !== 2) {
    console.log(`  ❌ FAIL: Again card intervals wrong`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Again card intervals correct`);
  }

  // Verify via getProps schedule preview for a new card
  state = makeState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const propsSchedule = getProps(state, env);
  const preview = propsSchedule.schedulePreview;
  console.log(`\nSchedule preview from getProps (new card):`);
  console.log(`  Hard: ${preview.hard}d, Good: ${preview.good}d, Easy: ${preview.easy}d`);

  if (preview.hard !== 1 || preview.good !== 1 || preview.easy !== 2) {
    console.log(`  ❌ FAIL: Schedule preview doesn't match expected`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Schedule preview correct`);
  }

  // ===================== BUG 3: Choices should not always fail =====================
  console.log('\n=== BUG 3: Skill check — choices should vary, not always fail ===\n');

  state = makeState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = apply(state, Handlers.onTapNextLine(state, env));
  state = apply(state, Handlers.onTapNextLine(state, env)); // → choice

  // Try easy choice 20 times
  let passCount = 0;
  for (let i = 0; i < 20; i++) {
    let s = { ...state, actPhase: 'choice', outcomeLine: null, outcomePassed: undefined, _choiceCounter: i };
    s = apply(s, Handlers.onTapChoice(s, env, 0));
    if (s.outcomePassed === true) passCount++;
  }
  console.log(`Easy choice: ${passCount}/20 passed`);

  if (passCount === 0) {
    console.log(`  ❌ FAIL: Easy choice ALWAYS fails`);
    exitCode = 1;
  } else if (passCount === 20) {
    console.log(`  ❌ FAIL: Easy choice ALWAYS succeeds`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Easy choice varies (${passCount} passes)`);
  }

  // Hard choice should fail more than easy
  let hardPassCount = 0;
  for (let i = 0; i < 20; i++) {
    let s = { ...state, actPhase: 'choice', outcomeLine: null, outcomePassed: undefined, _choiceCounter: i + 100 };
    s = apply(s, Handlers.onTapChoice(s, env, 1));
    if (s.outcomePassed === true) hardPassCount++;
  }
  console.log(`Hard choice: ${hardPassCount}/20 passed`);

  if (hardPassCount > passCount) {
    console.log(`  ❌ FAIL: Hard succeeds more than easy`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Hard fails more than easy`);
  }

  // ===================== SUMMARY =====================
  console.log('\n========== SUMMARY ==========');
  if (exitCode) { console.log('❌ SOME TESTS FAILED'); process.exit(1); }
  else { console.log('✅ ALL TESTS PASSED'); process.exit(0); }
}

runTests().catch(err => { console.error('Test error:', err); process.exit(1); });
