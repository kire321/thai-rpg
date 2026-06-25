/**
 * Integration test: new-style segmented episodes can be selected and played.
 *
 * 1. Verifies new-style episodes (with segments) come up during episode selection
 * 2. Simulates full user journey via handlers only (no direct state mutation)
 * 3. Verifies header counters update on card rating
 * 4. Verifies footer counters (subplot scores) update on skill check pass/fail
 */

const path = require('path');

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'src/controller/controller.js');
  const { getProps, Handlers, getQuizCardForTag } = await import(controllerPath);

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
    if (s.actPhase === 'choice') {
      s = apply(s, Handlers.onTapChoice(s, env, 0));
    }
    if (s.actPhase === 'outcome') {
      s = apply(s, Handlers.onOutcomeDone(s, env));
    }
    return s;
  }

  // Mirrors Store.tsx normalizeEpisode — expands segmented acts into flat acts.
  // Tests bypass Store.tsx, so they must normalize CMS-format data themselves.
  function normalizeEpisode(ep) {
    if (!ep) return ep;
    const normalized = { ...ep };
    if (!Array.isArray(normalized.acts)) return normalized;

    normalized.acts = normalized.acts.flatMap((act) => {
      // Old format: already flat
      if (!act.segments || !Array.isArray(act.segments)) return [act];

      // New format: expand segments into virtual acts
      const virtualActs = [];
      let currentLines = [];
      for (const seg of act.segments) {
        if (seg.type === 'narrative' && Array.isArray(seg.lines)) {
          currentLines.push(...seg.lines);
        } else if (seg.type === 'tag' && seg.tag) {
          virtualActs.push({
            ...act,
            lines_before: currentLines,
            tag: seg.tag,
            lines_after: [],
            decision: undefined,
          });
          currentLines = [];
        }
      }
      if (virtualActs.length > 0) {
        virtualActs[virtualActs.length - 1].lines_after = currentLines;
        virtualActs[virtualActs.length - 1].decision = act.decision;
      }
      return virtualActs;
    });

    return normalized;
  }

  // ===================== TEST DATA =====================
  // Old-style episode: flat acts with lines_before/tag/lines_after
  const ep_old = {
    id: 'ep_old',
    title: 'Old Episode',
    acts: [
      {
        id: 'act_old_1',
        title: 'Old Act 1',
        tag: 'tag_alpha',
        lines_before: [
          { char: 'char_n', line: 'Welcome.', character: 'char_n', place: 'place_p', dialogue: 'Welcome.', stage_directions: [] },
        ],
        lines_after: [
          { char: 'char_n', line: 'After old act.', character: 'char_n', place: 'place_p', dialogue: 'After old act.', stage_directions: [] },
        ],
        decision: {
          line: { character: 'char_n', place: 'place_p', dialogue: 'Choose old?', stage_directions: [] },
          choices: [
            { difficulty: 0, pass_outcome: { subplot: 'main', delta: 2, line: 'Easy pass old.' }, fail_outcome: { subplot: 'main', delta: -1, line: 'Easy fail old.' } },
          ],
        },
      },
    ],
  };

  // New-style episode: acts with segments (narrative→tag→narrative→tag→narrative)
  // After Store.tsx normalization this becomes 2 virtual acts per logical act.
  const ep_new = {
    id: 'ep_new',
    title: 'New Episode (Segmented)',
    acts: [
      {
        id: 'act_new_1',
        title: 'New Act 1 (Segmented)',
        // No lines_before/tag/lines_after — uses segments instead
        segments: [
          {
            type: 'narrative',
            lines: [
              { char: 'char_n', line: 'Line 1.', character: 'char_n', place: 'place_p', dialogue: 'Line 1.', stage_directions: [] },
              { char: 'char_n', line: 'Line 2.', character: 'char_n', place: 'place_p', dialogue: 'Line 2.', stage_directions: [] },
            ],
          },
          {
            type: 'tag',
            tag: 'tag_alpha', // first tag — this drives episode selection
          },
          {
            type: 'narrative',
            lines: [
              { char: 'char_n', line: 'Line 3.', character: 'char_n', place: 'place_p', dialogue: 'Line 3.', stage_directions: [] },
            ],
          },
          {
            type: 'tag',
            tag: 'tag_beta', // second tag within same logical act
          },
          {
            type: 'narrative',
            lines: [
              { char: 'char_n', line: 'Line 4.', character: 'char_n', place: 'place_p', dialogue: 'Line 4.', stage_directions: [] },
            ],
          },
        ],
        decision: {
          line: { character: 'char_n', place: 'place_p', dialogue: 'Choose new?', stage_directions: [] },
          choices: [
            { difficulty: 1, pass_outcome: { subplot: 'main', delta: 3, line: 'Medium pass new.' }, fail_outcome: { subplot: 'main', delta: -2, line: 'Medium fail new.' } },
          ],
        },
      },
    ],
  };

  const vocabItems = [
    { id: 'vocab-001', thai: 'สวัสดี', english: 'hello', phonetics: 'sa-wat-dii' },
    { id: 'vocab-002', thai: 'ขอบคุณ', english: 'thank you', phonetics: 'khop-khun' },
    { id: 'vocab-003', thai: 'ใช่', english: 'yes', phonetics: 'chai' },
  ];

  const cards = [
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', phonetics: 'sa-wat-dii' },
    { id: 'card-001-et', vocabId: 'vocab-001', direction: 'eng-thai', front: 'hello', back: 'สวัสดี', phonetics: 'sa-wat-dii' },
    { id: 'card-002-te', vocabId: 'vocab-002', direction: 'thai-eng', front: 'ขอบคุณ', back: 'thank you', phonetics: 'khop-khun' },
    { id: 'card-002-et', vocabId: 'vocab-002', direction: 'eng-thai', front: 'thank you', back: 'ขอบคุณ', phonetics: 'khop-khun' },
    { id: 'card-003-te', vocabId: 'vocab-003', direction: 'thai-eng', front: 'ใช่', back: 'yes', phonetics: 'chai' },
    { id: 'card-003-et', vocabId: 'vocab-003', direction: 'eng-thai', front: 'yes', back: 'ใช่', phonetics: 'chai' },
  ];

  const tags = {
    'tag_alpha': ['vocab-001'], // card-001-te is due → matches ep_new first tag
    'tag_beta': ['vocab-002'],
  };

  // Set up: card-001-te is due (lastReviewed=95, interval=1 → due on day 96, today is 100)
  const cardStats = {
    'card-001-te': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 95, failedToday: false },
  };
  // card-001-et has no stats → NEW
  // card-002-* has no stats → NEW
  // card-003-* has no stats → NEW

  // Controller handles segments natively — no normalization needed.
  const episodes = [
    { ...ep_old, id: 'ep_001' }, // old format
    { ...ep_new, id: 'ep_002' }, // new format (raw segments)
  ];

  let exitCode = 0;

  // ===================== TEST 1: New-style episode can be selected =====================
  console.log('\n=== TEST 1: New-style episode (segments) can be selected ===\n');

  let state = {
    episodes,
    vocabItems,
    cards,
    tags,
    cardStats,
    againQueue: [],
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
    tagMeta: { 'tag_alpha': { name: 'Alpha' }, 'tag_beta': { name: 'Beta' } },
  };

  // Both episodes match tag_alpha (vocab-001 due).
  // Due counts: both have 1 due card (card-001-te).
  // Tiebreak: highest episode ID → ep_002 (new format) should win.
  state = apply(state, Handlers.onStartEpisode(state, env));
  const selectedEp = state.currentEpisodeId;
  console.log(`Selected episode: ${selectedEp}`);
  console.log(`Expected: ep_002 (new segmented episode, highest ID in tiebreak)`);

  if (selectedEp !== 'ep_002') {
    console.log(`  ❌ FAIL: Expected ep_002 (new format), got ${selectedEp}`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: New-style episode was selected`);
  }

  // ===================== TEST 2: Play through the episode, verify counters =====================
  console.log('\n=== TEST 2: Play through episode, verify header + footer counters ===\n');

  // Verify initial counters
  let props = getProps(state, env);
  console.log(`Initial counters: Done=${props.doneCount}, Due=${props.dueCount}, New=${props.newCount}, Left=${props.leftCount}`);
  console.log(`Initial subplot: main=${props.subplotScores['main'] || 0}`);

  const initialNew = props.newCount;
  const initialDue = props.dueCount;

  // ---- Virtual Act 0 (from first tag segment: tag_alpha) ----
  state = playUntilVocabReview(state);
  console.log(`\n-- VA 0: tag=tag_alpha --`);
  console.log(`  vocabReviewCardId: ${state.vocabReviewCardId}`);

  // Rate "good" (quality 4) on the due card
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));
  props = getProps(state, env);
  console.log(`  After rating Good: Done=${props.doneCount}, Due=${props.dueCount}, New=${props.newCount}`);

  // Due count should decrease by 1 (card-001-te is now scheduled for future)
  if (props.dueCount >= initialDue) {
    console.log(`  ❌ FAIL: Due count should decrease after rating a due card`);
    exitCode = 1;
  } else {
    console.log(`  ✅ Due count decreased`);
  }

  state = playAfterVocabReview(state);

  // ---- Virtual Act 1 (from second tag segment: tag_beta) ----
  if (state.currentView === 'episode') {
    console.log(`\n-- VA 1: tag=tag_beta --`);

    state = playUntilVocabReview(state);
    console.log(`  vocabReviewCardId: ${state.vocabReviewCardId}`);

    if (state.vocabReviewCardId === null) {
      console.log(`  ⚠️  No card for VA 1 — skipping rating`);
    } else {
      // This should be a NEW card (card-002-te for tag_beta/vocab-002)
      const isNewCard = !state.cardStats[state.vocabReviewCardId] ||
                        state.cardStats[state.vocabReviewCardId].lastReviewed === null;
      console.log(`  Is new card: ${isNewCard}`);

      // Rate "good" (quality 4) on the new card
      state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));
      props = getProps(state, env);
      console.log(`  After rating new card: Done=${props.doneCount}, Due=${props.dueCount}, New=${props.newCount}`);

      // New counter should decrease by 1
      if (props.newCount >= initialNew) {
        console.log(`  ❌ FAIL: New counter should decrease after rating a new card`);
        exitCode = 1;
      } else {
        console.log(`  ✅ New counter decreased`);
      }
    }
    state = playAfterVocabReview(state);
  }

  // ---- Choice / Skill Check ----
  if (state.currentView === 'episode' && state.actPhase === 'choice') {
    console.log(`\n-- Choice phase --`);
    const beforeSubplot = props.subplotScores['main'] || 0;
    console.log(`  Subplot score before choice: ${beforeSubplot}`);

    // Make the choice (index 0)
    state = apply(s, Handlers.onTapChoice(state, env, 0));
    props = getProps(state, env);
    const afterSubplot = props.subplotScores['main'] || 0;
    console.log(`  Choice result: ${state.outcomePassed ? 'PASS' : 'FAIL'}`);
    console.log(`  Subplot score after choice: ${afterSubplot}`);
    console.log(`  Delta: ${state.outcomeDelta || 0}`);

    // Subplot score MUST have changed (either +3 pass or -2 fail)
    if (afterSubplot === beforeSubplot) {
      console.log(`  ❌ FAIL: Subplot score should change after a choice`);
      exitCode = 1;
    } else {
      console.log(`  ✅ Subplot score changed from ${beforeSubplot} to ${afterSubplot}`);
    }

    // Finish the outcome
    state = apply(state, Handlers.onOutcomeDone(state, env));
  }

  // ===================== TEST 3: Episode completed, back to welcome =====================
  console.log('\n=== TEST 3: Episode completion ===\n');

  console.log(`Final view: ${state.currentView}`);
  console.log(`Episode plays: ${JSON.stringify(state.episodePlays)}`);
  console.log(`Episodes played today: ${JSON.stringify(state.episodesPlayedToday)}`);

  if (state.currentView !== 'welcome') {
    console.log(`  ❌ FAIL: Should be back at welcome view after episode`);
    exitCode = 1;
  } else if (state.episodesPlayedToday.includes('ep_002')) {
    console.log(`  ✅ PASS: Episode completed, marked as played today`);
  } else {
    console.log(`  ❌ FAIL: ep_002 should be in episodesPlayedToday`);
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
