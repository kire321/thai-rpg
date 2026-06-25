/**
 * TDD: Bug fix for "No line to display" with new segmented episodes.
 *
 * Old saved state has episodes in raw CMS format: segments present but
 * lines_before/lines_after are empty (or missing). The controller now
 * handles segments natively — no load-time normalization needed.
 *
 * Test: create a segmented episode in raw CMS format, pass it to the
 * controller unmodified, verify lines display correctly.
 */

const path = require('path');

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'src/controller/controller.js');
  const { getProps, Handlers, getTotalVirtualActs, getActAtIndex } = await import(controllerPath);

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

  // ===================== TEST DATA: RAW CMS FORMAT (no normalization) =====================
  // This is exactly how the CMS sends new-format episodes.
  // The controller handles segments natively.
  const ep_new = {
    id: 'ep_505',
    title: 'Segmented Episode',
    acts: [
      {
        id: 'act_0',
        title: 'Act 0',
        // RAW CMS FORMAT: segments with narrative→tag→narrative→tag→narrative
        // No lines_before, no lines_after, no tag at act level.
        segments: [
          {
            type: 'narrative',
            lines: [
              { char: 'char_n', line: 'First line.', character: 'char_n', place: 'place_p', dialogue: 'First line.', stage_directions: [] },
              { char: 'char_n', line: 'Second line.', character: 'char_n', place: 'place_p', dialogue: 'Second line.', stage_directions: [] },
            ],
          },
          { type: 'tag', tag: 'tag_alpha' },
          {
            type: 'narrative',
            lines: [
              { char: 'char_n', line: 'Between tags.', character: 'char_n', place: 'place_p', dialogue: 'Between tags.', stage_directions: [] },
            ],
          },
          { type: 'tag', tag: 'tag_beta' },
          {
            type: 'narrative',
            lines: [
              { char: 'char_n', line: 'After last tag.', character: 'char_n', place: 'place_p', dialogue: 'After last tag.', stage_directions: [] },
            ],
          },
        ],
        decision: {
          line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] },
          choices: [
            { difficulty: 0, pass_outcome: { subplot: 'main', delta: 1, line: 'Pass.' } },
          ],
        },
      },
    ],
  };

  const vocabItems = [
    { id: 'vocab-001', thai: 'สวัสดี', english: 'hello', phonetics: '' },
    { id: 'vocab-002', thai: 'ขอบคุณ', english: 'thank you', phonetics: '' },
  ];

  const cards = [
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', phonetics: '' },
    { id: 'card-001-et', vocabId: 'vocab-001', direction: 'eng-thai', front: 'hello', back: 'สวัสดี', phonetics: '' },
    { id: 'card-002-te', vocabId: 'vocab-002', direction: 'thai-eng', front: 'ขอบคุณ', back: 'thank you', phonetics: '' },
    { id: 'card-002-et', vocabId: 'vocab-002', direction: 'eng-thai', front: 'thank you', back: 'ขอบคุณ', phonetics: '' },
  ];

  const tags = {
    'tag_alpha': ['vocab-001'],
    'tag_beta': ['vocab-002'],
  };

  const episodes = [ep_new]; // RAW — no normalization

  let state = {
    episodes, vocabItems, cards, tags,
    characters: {}, places: {}, subplots: { main: { name: 'Main' } },
    tagMeta: { 'tag_alpha': { name: 'Alpha' }, 'tag_beta': { name: 'Beta' } },
    cardStats: {
      'card-001-te': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 95, failedToday: false },
    },
    againQueue: [],
    againDelayCounter: 0, newCardsRatedToday: 0,
    dateshift: 0,
    currentView: 'episode', currentEpisodeId: 'ep_505',
    currentActIndex: 0, currentLineIndex: 0, actPhase: 'lines_before',
    showingAnswer: false, vocabReviewCardId: null,
    episodePlays: {}, episodesPlayedToday: [],
    currentCardIndex: 0, pageIndex: 0,
    isSettingsOpen: false, subplotScores: {},
    toast: null, cmsBaseUrl: 'https://q4kgqw3jj72wa.kimi.page',
  };

  let exitCode = 0;

  // ===================== TEST 1: Controller reads lines from segments =====================
  console.log('\n=== TEST 1: Raw segments — controller extracts lines on-the-fly ===\n');

  const props0 = getProps(state, env);
  const dialogue = props0.currentLine?.dialogue;
  console.log(`First line displayed: "${dialogue || 'null'}"`);

  if (!dialogue) {
    console.log('  ❌ FAIL: getProps returned null line — segments not read');
    exitCode = 1;
  } else if (dialogue === 'First line.') {
    console.log('  ✅ PASS: Controller extracted lines from segments');
  } else {
    console.log(`  ⚠️  Unexpected line: "${dialogue}"`);
  }

  // ===================== TEST 2: Full playthrough — no "No line to display" =====================
  console.log('\n=== TEST 2: Full playthrough ===\n');

  state = playUntilVocabReview(state);
  console.log(`VA 0 vocabReviewCardId: ${state.vocabReviewCardId}`);
  if (!state.vocabReviewCardId) {
    console.log('  ❌ FAIL: No quiz card for VA 0');
    exitCode = 1;
  } else {
    console.log('  ✅ VA 0 reached vocab_review');
  }

  // Rate card → lines_after → next act
  state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));

  // Advance through lines_after of VA 0 (auto-advance to VA 1)
  let safety = 0;
  while (state.actPhase === 'lines_after' && safety < 10) {
    state = apply(state, Handlers.onTapNextLine(state, env));
    safety++;
  }
  if (state.actPhase === 'lines_before' && state.currentActIndex === 1) {
    console.log('  ✅ Auto-advanced from VA 0 to VA 1');
  }

  // VA 1 should also have lines
  const props1 = getProps(state, env);
  const va1Line = props1.currentLine?.dialogue;
  console.log(`VA 1 first line: "${va1Line || 'null'}"`);

  if (!va1Line) {
    console.log('  ❌ FAIL: VA 1 shows "No line to display"');
    exitCode = 1;
  } else {
    console.log('  ✅ VA 1 has a line to display');
  }

  // Play through VA 1
  state = playUntilVocabReview(state);
  if (state.vocabReviewCardId) {
    state = apply(state, Handlers.onRateCard(state, env, state.vocabReviewCardId, 4));
    console.log('  ✅ Rated card in VA 1');
  }

  // ===================== TEST 3: Correct virtual act count =====================
  console.log('\n=== TEST 3: Virtual act count ===\n');
  const totalVA = getTotalVirtualActs(ep_new);
  console.log(`Total virtual acts: ${totalVA} (expected 2)`);
  if (totalVA !== 2) {
    console.log('  ❌ FAIL: Expected 2 virtual acts');
    exitCode = 1;
  } else {
    console.log('  ✅ 2 virtual acts from 1 segmented logical act');
  }

  // Verify getActAtIndex returns correct virtual acts
  const va0 = getActAtIndex(ep_new, 0);
  const va1 = getActAtIndex(ep_new, 1);
  console.log(`VA 0: tag=${va0?.tag}, before=${va0?.lines_before?.length}, after=${va0?.lines_after?.length}`);
  console.log(`VA 1: tag=${va1?.tag}, before=${va1?.lines_before?.length}, after=${va1?.lines_after?.length}`);

  if (va0?.tag === 'tag_alpha' && va1?.tag === 'tag_beta') {
    console.log('  ✅ getActAtIndex returns correct tags');
  } else {
    console.log('  ❌ FAIL: getActAtIndex returned wrong tags');
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
