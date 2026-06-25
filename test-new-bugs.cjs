/**
 * Three bugs reported by user:
 * 1. Speaker button: replace "English→Thai" direction text with loudspeaker
 *    icon that replays audio on tap (in addition to existing auto-play)
 * 2. New card → "again": "New" counter should decrement, but stays same
 * 3. Due card (was "again") → "Good": "New" should stay same, but decreases
 *
 * Tests simulate EXACT user actions and assert via getProps.
 */

const path = require('path');

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'src/controller/controller.js');
  const { getProps, Handlers } = await import(controllerPath);

  const env = {
    time: { getDay: () => 0, getTimestamp: () => Date.now(), getDayStart: () => 0, getDaysSinceEpoch: () => 100 },
    speakThai: (text) => { /* mock */ },
    content: {}, checkForUpdates: null, downloadFile: null,
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
    id: 'ep_test', title: 'Test',
    acts: [{
      tag: 'tag_greetings',
      lines_before: [{ char: 'char_n', line: 'Hi.', character: 'char_n', place: 'place_p', dialogue: 'Hi.', stage_directions: [] }],
      lines_after: [{ char: 'char_n', line: 'Bye.', character: 'char_n', place: 'place_p', dialogue: 'Bye.', stage_directions: [] }],
      decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] },
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

  const tags = { 'tag_greetings': ['vocab-001', 'vocab-002'] };
  const tagMeta = { 'tag_greetings': { id: 'tag_greetings', name: 'Greetings' } };

  function makeState(extra = {}) {
    return {
      episodes, vocabItems, cards, tags, tagMeta,
      characters: {}, places: {}, subplots: { main: { name: 'Main' } },
      cardStats: {},
      againQueue: [], againDelayCounter: 0, newCardsRatedToday: 0,
      dateshift: 0, currentView: 'welcome', currentEpisodeId: null,
      currentActIndex: 0, currentLineIndex: 0, actPhase: 'lines_before',
      showingAnswer: false, vocabReviewCardId: null,
      episodePlays: {}, episodesPlayedToday: [],
      currentCardIndex: 0, pageIndex: 0,
      isSettingsOpen: false, subplotScores: {}, toast: null,
      cmsBaseUrl: 'https://example.com',
      ...extra,
    };
  }

  let exitCode = 0;

  // ===================== BUG 2: New card → "again" → New should decrement =====================
  console.log('\n=== BUG 2: New card rated "again" — "New" counter MUST decrement ===\n');

  let state = makeState();
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const cardId = state.vocabReviewCardId;
  const isNew = !state.cardStats || !state.cardStats[cardId];
  console.log(`Card: ${cardId}, truly new (no stats): ${isNew}`);

  const before = getProps(state, env).newCount;
  state = apply(state, Handlers.onRateCard(state, env, cardId, 1)); // "again"
  const after = getProps(state, env).newCount;
  console.log(`New counter: ${before} → ${after}`);

  if (after >= before) {
    console.log(`  ❌ FAIL: New counter should decrement when new card rated "again"`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: New counter decremented`);
  }

  // ===================== BUG 3: Was "Again" → "Good" → New should stay same =====================
  console.log('\n=== BUG 3: Previously "Again" card rated "Good" — "New" must NOT change ===\n');

  // Set up: card-001-te was rated "again" earlier today (in againQueue)
  state = makeState({
    cardStats: {
      'card-001-te': { repetitions: 0, interval: 0, ef: 2.5, lastReviewed: 100, failedToday: true },
    },
    againQueue: ['card-001-te'],
  });
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const cardId2 = state.vocabReviewCardId;
  const isDue = state.againQueue.includes(cardId2);
  console.log(`Card: ${cardId2}, in againQueue (due): ${isDue}`);
  console.log(`Card stats: lastReviewed=${state.cardStats[cardId2]?.lastReviewed}`);

  const before2 = getProps(state, env).newCount;
  state = apply(state, Handlers.onRateCard(state, env, cardId2, 4)); // "good"
  const after2 = getProps(state, env).newCount;
  console.log(`New counter: ${before2} → ${after2}`);

  if (after2 !== before2) {
    console.log(`  ❌ FAIL: New counter changed from ${before2} to ${after2}`);
    console.log(`     Card was in againQueue (due), not new. Rating "good" should NOT affect New.`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: New counter unchanged`);
  }

  // ===================== Edge: newCardsRatedToday persists across ratings =====================
  console.log('\n=== Edge: newCardsRatedToday persists after multiple ratings ===\n');

  state = makeState({
    cardStats: {
      'card-001-te': { repetitions: 0, interval: 0, ef: 2.5, lastReviewed: 100, failedToday: true },
    },
    againQueue: ['card-001-te'],
    newCardsRatedToday: 3, // 3 new cards already rated today
  });
  state = apply(state, Handlers.onStartEpisode(state, env));
  state = playUntilVocabReview(state);

  const before3 = getProps(state, env).newCount; // should be 10 - 3 = 7
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));
  const after3 = getProps(state, env).newCount;
  console.log(`New counter: ${before3} → ${after3} (newCardsRatedToday=3, due card rated "good")`);

  if (after3 !== before3) {
    console.log(`  ❌ FAIL: New counter changed — due card rated "good" should not affect it`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: New counter persisted correctly`);
  }

  // ===================== SPEAKER: onSpeakCard handler exists =====================
  console.log('\n=== Speaker: onSpeakCard handler exists for replaying audio ===\n');

  if (typeof Handlers.onSpeakCard !== 'function') {
    console.log(`  ❌ FAIL: Handlers.onSpeakCard does not exist`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: onSpeakCard handler exists`);
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
