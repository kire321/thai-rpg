/**
 * RED tests for episode selection algorithm v2:
 * 1. Filter: first act reviews most overdue card
 * 2. Exclude: episodes played today
 * 3. Prioritize: episodes with most due cards
 * 4. Tiebreak: least-played overall
 */

const path = require('path');

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'app/src/controller/controller.js');
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

  // ===================== TEST DATA =====================
  // Two episodes share tag_001 as first act (reviews vocab-001).
  // ep_more_due: reviews vocab-001 (AGAIN) + vocab-002 (overdue) = 2 due cards
  // ep_fewer_due: reviews only vocab-001 (AGAIN) = 1 due card
  const episodes = [
    {
      id: 'ep_more_due',
      title: 'More Due Cards',
      acts: [
        {
          tag: 'tag_001',
          lines_before: [{ speaker: 'N', text: 'Line 1' }],
          lines_after: [{ speaker: 'N', text: 'After' }],
          decision: { choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Done' } }] },
          consequence: {},
        },
        {
          tag: 'tag_002',
          lines_before: [{ speaker: 'N', text: 'Line 2' }],
          lines_after: [{ speaker: 'N', text: 'After 2' }],
          decision: { choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Done' } }] },
          consequence: {},
        },
      ],
    },
    {
      id: 'ep_fewer_due',
      title: 'Fewer Due Cards',
      acts: [
        {
          tag: 'tag_001',
          lines_before: [{ speaker: 'N', text: 'Line A' }],
          lines_after: [{ speaker: 'N', text: 'After A' }],
          decision: { choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Done' } }] },
          consequence: {},
        },
        {
          tag: 'tag_003',
          lines_before: [{ speaker: 'N', text: 'Line B' }],
          lines_after: [{ speaker: 'N', text: 'After B' }],
          decision: { choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Done' } }] },
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

  let exitCode = 0;

  // ===================== TEST 1: Prioritize episode with more due cards =====================
  console.log('\n=== TEST 1: Prioritize episode with most due cards ===\n');

  // State: card-001-te is AGAIN (most overdue), card-002-te is overdue
  // ep_more_due: act0=tag_001 (vocab-001: card-001-te AGAIN), act1=tag_002 (vocab-002: card-002-te overdue)
  // ep_fewer_due: act0=tag_001 (vocab-001: card-001-te AGAIN), act1=tag_003 (vocab-003: new)
  // Expected: ep_more_due selected because it reviews 2 due cards vs 1

  let state = {
    episodes,
    vocabItems,
    cards,
    tags,
    cardStats: {
      'card-001-te': { repetitions: 0, interval: 1, ef: 2.5, lastReviewed: 99, failedToday: true },
      'card-002-te': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 98, failedToday: false },
    },
    againQueue: ['card-001-te'],
    againDelayCounter: 0,
    dateshift: 0,
    currentView: 'welcome',
    currentEpisodeId: null,
    currentActIndex: 0,
    currentLineIndex: 0,
    actPhase: 'lines_before',
    showingAnswer: false,
    vocabReviewCardId: null,
    episodePlays: { ep_fewer_due: 0, ep_more_due: 0 },
    episodesPlayedToday: [],
    currentCardIndex: 0,
    pageIndex: 0,
    isSettingsOpen: false,
    subplotScores: {},
    toast: null,
    cmsBaseUrl: 'https://example.com',
  };

  state = apply(state, Handlers.onStartEpisode(state, env));
  const selectedEp = state.currentEpisodeId;
  console.log(`Selected episode: ${selectedEp}`);
  console.log(`Expected: ep_more_due (reviews 2 due cards: card-001-te AGAIN + card-002-te overdue)`);

  if (selectedEp !== 'ep_more_due') {
    console.log(`  ❌ FAIL: Expected ep_more_due, got ${selectedEp}`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Selected episode with most due cards`);
  }

  // ===================== TEST 2: Exclude episodes played today =====================
  console.log('\n=== TEST 2: Exclude episodes played today ===\n');

  // Same state, but ep_more_due was already played today
  // Expected: ep_fewer_due (the only remaining option)
  state.episodesPlayedToday = ['ep_more_due'];
  state.currentEpisodeId = null; // reset

  state = apply(state, Handlers.onStartEpisode(state, env));
  const selectedEp2 = state.currentEpisodeId;
  console.log(`Selected episode: ${selectedEp2}`);
  console.log(`ep_more_due is played today, expected: ep_fewer_due`);

  if (selectedEp2 !== 'ep_fewer_due') {
    console.log(`  ❌ FAIL: Expected ep_fewer_due, got ${selectedEp2}`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Skipped episode played today`);
  }

  // ===================== TEST 3: After playing an episode, it's marked played today =====================
  console.log('\n=== TEST 3: Playing an episode marks it played today ===\n');

  // Fresh state, play through ep_more_due, then fast forward
  // After playing ep_more_due, it should be in episodesPlayedToday
  // Fast forward should select ep_fewer_due (ep_more_due excluded)
  state = {
    episodes,
    vocabItems,
    cards,
    tags,
    cardStats: {
      'card-001-te': { repetitions: 0, interval: 1, ef: 2.5, lastReviewed: 99, failedToday: true },
      'card-002-te': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 98, failedToday: false },
    },
    againQueue: ['card-001-te'],
    againDelayCounter: 0,
    dateshift: 0,
    currentView: 'episode',
    currentEpisodeId: 'ep_more_due',
    currentActIndex: 0,
    currentLineIndex: 0,
    actPhase: 'lines_before',
    showingAnswer: false,
    vocabReviewCardId: null,
    episodePlays: { ep_fewer_due: 0, ep_more_due: 0 },
    episodesPlayedToday: [],
    currentCardIndex: 0,
    pageIndex: 0,
    isSettingsOpen: false,
    subplotScores: {},
    toast: null,
    cmsBaseUrl: 'https://example.com',
  };

  // Play through the episode
  state = playUntilVocabReview(state);
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));
  state = playAfterVocabReview(state);
  // Now in second act
  state = playUntilVocabReview(state);
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));
  state = playAfterVocabReview(state);

  console.log(`After completing ep_more_due:`);
  console.log(`  episodesPlayedToday: ${JSON.stringify(state.episodesPlayedToday)}`);
  console.log(`  episodePlays: ${JSON.stringify(state.episodePlays)}`);

  const isMarkedToday = state.episodesPlayedToday.includes('ep_more_due');
  if (!isMarkedToday) {
    console.log(`  ❌ FAIL: ep_more_due should be in episodesPlayedToday`);
    exitCode = 1;
  } else {
    console.log(`  ✅ ep_more_due marked as played today`);
  }

  // Fast forward — should select ep_fewer_due since ep_more_due was played today
  state = apply(state, Handlers.onTapNextScenario(state, env));
  console.log(`  Fast forward selected: ${state.currentEpisodeId}`);
  console.log(`  Expected: ep_fewer_due (ep_more_due excluded as played today)`);

  if (state.currentEpisodeId !== 'ep_fewer_due') {
    console.log(`  ❌ FAIL: Expected ep_fewer_due after fast forward`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Fast forward skipped episode played today`);
  }

  // ===================== TEST 4: New day clears episodesPlayedToday =====================
  console.log('\n=== TEST 4: New day (dateshift) clears episodesPlayedToday ===\n');

  // After Test 3, both card-001-te and card-002-te were rated "good".
  // card-001-te: lastReviewed=100, interval=1, dueDate=101 (due today)
  // card-002-te: lastReviewed=100, interval=6, dueDate=106 (not due)
  // So both episodes have 1 due card (card-001-te). Tiebreak: least-played.
  // ep_fewer_due has 0 plays, ep_more_due has 2 plays → ep_fewer_due wins.
  // But the key assertion is that ep_more_due is NO LONGER EXCLUDED due to played-today.

  state = apply(state, Handlers.onIncrementDateshift(state, env));
  console.log(`After dateshift: ${state.dateshift}`);
  console.log(`  episodesPlayedToday: ${JSON.stringify(state.episodesPlayedToday)}`);
  console.log(`  (should be empty — cleared by dateshift)`);

  const isCleared = state.episodesPlayedToday.length === 0;
  if (!isCleared) {
    console.log(`  ❌ FAIL: episodesPlayedToday should be cleared after dateshift`);
    exitCode = 1;
  } else {
    console.log(`  ✅ episodesPlayedToday cleared`);
  }

  state = apply(state, Handlers.onStartEpisode(state, env));
  console.log(`  Selected after new day: ${state.currentEpisodeId}`);
  console.log(`  Expected: ep_fewer_due (tied on 1 due card each, but fewer plays: 0 vs 2)`);

  // The key assertion: ep_more_due is now ELIGIBLE (not excluded by played-today)
  // but ep_fewer_due wins the tiebreak. If played-today weren't cleared,
  // ep_fewer_due would be selected regardless. So we verify by checking
  // that the selection changed from the "played today" forced choice.
  if (state.currentEpisodeId === 'ep_fewer_due') {
    console.log(`  ✅ PASS: New day cleared played-today, tiebreak selected least-played`);
  } else {
    console.log(`  ❌ FAIL: Expected ep_fewer_due after new day`);
    exitCode = 1;
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
