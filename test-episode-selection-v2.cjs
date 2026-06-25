/**
 * RED tests for episode selection algorithm v2:
 * 1. Filter: first act reviews most overdue card
 * 2. Exclude: episodes played today
 * 3. Prioritize: episodes with most due cards
 * 4. Tiebreak: least-played overall
 */

const path = require('path');
const https = require('https');

// Helper: fetch JSON from staging CMS
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

async function loadCmsData() {
  const cmsBase = 'https://q4kgqw3jj72wa.kimi.page';
  console.log(`Loading CMS data from ${cmsBase}...`);
  const [episodes, tags, vocabItems] = await Promise.all([
    fetchJson(`${cmsBase}/episodes.json`),
    fetchJson(`${cmsBase}/tags.json`),
    fetchJson(`${cmsBase}/vocab_items.json`),
  ]);
  // Convert tags array to map {tag_id: [vocabIds]}
  const tagsMap = {};
  if (Array.isArray(tags)) {
    for (const t of tags) tagsMap[t.id] = t.vocab_item_ids || [];
  }
  console.log(`Loaded ${episodes.length} episodes, ${Object.keys(tagsMap).length} tags, ${vocabItems.length} vocab items`);
  return { episodes, tags: tagsMap, vocabItems };
}

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'src/controller/controller.js');
  const { getProps, Handlers, getActTags } = await import(controllerPath);

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

  // ===================== LOAD LIVE CMS DATA =====================
  const cmsData = await loadCmsData();
  const liveEpisodes = cmsData.episodes;
  const liveTags = cmsData.tags;
  const liveVocabItems = cmsData.vocabItems;

  // Generate cards from live vocab items
  const liveCards = [];
  for (const item of liveVocabItems) {
    liveCards.push({ id: `card-${item.id}-te`, vocabId: item.id, direction: 'thai-eng', front: item.thai, back: item.english, phonetics: item.phonetics });
    liveCards.push({ id: `card-${item.id}-et`, vocabId: item.id, direction: 'eng-thai', front: item.english, back: item.thai, phonetics: item.phonetics });
  }

  // ===================== SYNTHETIC TEST DATA (for controlled tests) =====================
  // Two episodes share tag_001 as first act (reviews vocab-001).
  // ep_more_due: reviews vocab-001 (AGAIN) + vocab-002 (overdue) = 2 due cards
  // ep_fewer_due: reviews only vocab-001 (AGAIN) = 1 due card
  const episodes = [
    {
      id: 'ep_more_due',
      title: 'More Due Cards',
      acts: [
        {
          tags: ['tag_001', 'tag_002'], // MULTI-TAG: first act has 2 tags!
          lines_before: [{ char: 'char_n', line: 'Line 1', character: 'char_n', place: 'place_p', dialogue: 'Line 1', stage_directions: [] }],
          lines_after: [{ char: 'char_n', line: 'After', character: 'char_n', place: 'place_p', dialogue: 'After', stage_directions: [] }],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Done' } }] },
          consequence: {},
        },
        {
          tags: ['tag_003'], // Single tag in array format
          lines_before: [{ char: 'char_n', line: 'Line 2', character: 'char_n', place: 'place_p', dialogue: 'Line 2', stage_directions: [] }],
          lines_after: [{ char: 'char_n', line: 'After 2', character: 'char_n', place: 'place_p', dialogue: 'After 2', stage_directions: [] }],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose 2?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Done' } }] },
          consequence: {},
        },
      ],
    },
    {
      id: 'ep_fewer_due',
      title: 'Fewer Due Cards',
      acts: [
        {
          tag: 'tag_001', // Old single-tag format (backward compat)
          lines_before: [{ char: 'char_n', line: 'Line A', character: 'char_n', place: 'place_p', dialogue: 'Line A', stage_directions: [] }],
          lines_after: [{ char: 'char_n', line: 'After A', character: 'char_n', place: 'place_p', dialogue: 'After A', stage_directions: [] }],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose A?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Done' } }] },
          consequence: {},
        },
        {
          tag: 'tag_004',
          lines_before: [{ char: 'char_n', line: 'Line B', character: 'char_n', place: 'place_p', dialogue: 'Line B', stage_directions: [] }],
          lines_after: [{ char: 'char_n', line: 'After B', character: 'char_n', place: 'place_p', dialogue: 'After B', stage_directions: [] }],
          decision: { line: { character: 'char_n', place: 'place_p', dialogue: 'Choose B?', stage_directions: [] }, choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'Done' } }] },
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
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', phonetics: '' },
    { id: 'card-001-et', vocabId: 'vocab-001', direction: 'eng-thai', front: 'hello', back: 'สวัสดี', phonetics: '' },
    { id: 'card-002-te', vocabId: 'vocab-002', direction: 'thai-eng', front: 'ขอบคุณ', back: 'thank you', phonetics: '' },
    { id: 'card-002-et', vocabId: 'vocab-002', direction: 'eng-thai', front: 'thank you', back: 'ขอบคุณ', phonetics: '' },
    { id: 'card-003-te', vocabId: 'vocab-003', direction: 'thai-eng', front: 'ใช่', back: 'yes', phonetics: '' },
    { id: 'card-003-et', vocabId: 'vocab-003', direction: 'eng-thai', front: 'yes', back: 'ใช่', phonetics: '' },
  ];

  const tags = {
    'tag_001': ['vocab-001'],
    'tag_002': ['vocab-002'],
    'tag_003': ['vocab-003'],
    'tag_004': ['vocab-001'],
  };

  let exitCode = 0;

  // ===================== TEST 0: Verify staging CMS has multi-tag support data =====================
  console.log('\n=== TEST 0: Verify staging CMS data format ===\n');

  // Check that the live CMS data contains episodes with multi-tag acts
  let multiTagActCount = 0;
  let singleTagActCount = 0;
  for (const ep of liveEpisodes) {
    for (const act of ep.acts || []) {
      if (Array.isArray(act.tags) && act.tags.length > 1) multiTagActCount++;
      else if (act.tag) singleTagActCount++;
    }
  }
  console.log(`Live CMS: ${multiTagActCount} multi-tag acts, ${singleTagActCount} single-tag acts`);

  // Verify getActTags works with both formats from live data
  const sampleEp = liveEpisodes[0];
  if (sampleEp && sampleEp.acts && sampleEp.acts.length > 0) {
    const firstActTags = getActTags(sampleEp.acts[0]);
    console.log(`Sample episode first act tags: ${JSON.stringify(firstActTags)}`);
    if (firstActTags.length === 0) {
      console.log('  ⚠️  First act has no recognizable tags (checking live data format)');
    } else {
      console.log(`  ✅ PASS: First act has ${firstActTags.length} tag(s): ${firstActTags.join(', ')}`);
    }
  }

  // ===================== TEST 1: Prioritize episode with more due cards =====================
  console.log('\n=== TEST 1: Prioritize episode with most due cards (multi-tag first act) ===\n');

  // State: card-001-te is AGAIN (most overdue), card-002-te is overdue
  // ep_more_due: act0 has tags: ['tag_001', 'tag_002'] — MULTI-TAG!
  //   tag_001 -> vocab-001 -> card-001-te (AGAIN)
  //   tag_002 -> vocab-002 -> card-002-te (overdue)
  //   Total: 2 due cards
  // ep_fewer_due: act0 has tag: 'tag_001' (single tag, backward compat)
  //   tag_001 -> vocab-001 -> card-001-te (AGAIN)
  //   Total: 1 due card
  // Expected: ep_more_due selected because it reviews 2 due cards vs 1

  let state = {
    episodes,
    vocabItems,
    cards,
    tags,
    tagMeta: { 'tag_001': { name: 'Greetings' }, 'tag_002': { name: 'Gratitude' }, 'tag_003': { name: 'Affirmation' }, 'tag_004': { name: 'Extra' } },
    characters: {}, places: {}, subplots: { main: { name: 'Main' } },
    cardStats: {
      'card-001-te': { repetitions: 0, interval: 1, ef: 2.5, lastReviewed: 99, failedToday: true },
      'card-002-te': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 98, failedToday: false },
    },
    againQueue: ['card-001-te'],
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
    episodePlays: { ep_fewer_due: 0, ep_more_due: 0 },
    episodesPlayedToday: [],
    currentCardIndex: 0,
    pageIndex: 0,
    isSettingsOpen: false,
    subplotScores: {},
    toast: null,
    cmsBaseUrl: 'https://q4kgqw3jj72wa.kimi.page',
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
    tagMeta: { 'tag_001': { name: 'Greetings' }, 'tag_002': { name: 'Gratitude' }, 'tag_003': { name: 'Affirmation' }, 'tag_004': { name: 'Extra' } },
    characters: {}, places: {}, subplots: { main: { name: 'Main' } },
    cardStats: {
      'card-001-te': { repetitions: 0, interval: 1, ef: 2.5, lastReviewed: 99, failedToday: true },
      'card-002-te': { repetitions: 1, interval: 1, ef: 2.5, lastReviewed: 98, failedToday: false },
    },
    againQueue: ['card-001-te'],
    againDelayCounter: 0,
    newCardsRatedToday: 0,
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
    cmsBaseUrl: 'https://q4kgqw3jj72wa.kimi.page',
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

  // Set up state so ep_fewer_due has more due cards (to guarantee selection)
  // card-001-te (vocab-001): due on day 101 (lastReviewed=99, interval=2 → dueDate=101)
  // card-003-te (vocab-003): due on day 101 (lastReviewed=98, interval=3 → dueDate=101)
  state.cardStats = {
    'card-001-te': { repetitions: 1, interval: 2, ef: 2.5, lastReviewed: 99, failedToday: false },
    'card-003-te': { repetitions: 1, interval: 3, ef: 2.5, lastReviewed: 98, failedToday: false },
  };
  state.againQueue = [];
  state.currentEpisodeId = null;
  state.currentActIndex = 0;
  state.actPhase = 'lines_before';
  state.episodePlays = { ep_fewer_due: 0, ep_more_due: 2 };
  state.episodesPlayedToday = ['ep_more_due']; // ep_more_due played today

  // Before dateshift: ep_more_due is in episodesPlayedToday, so it should be excluded
  // Only ep_fewer_due is available — but it only has 1 due card (card-001-te via tag_001)
  state = apply(state, Handlers.onStartEpisode(state, env));
  const beforeDateshift = state.currentEpisodeId;
  console.log(`Before dateshift (ep_more_due played today): selected ${beforeDateshift}`);
  console.log(`Expected: ep_fewer_due (only option since ep_more_due excluded)`);

  if (beforeDateshift !== 'ep_fewer_due') {
    console.log(`  ❌ FAIL: Expected ep_fewer_due before dateshift, got ${beforeDateshift}`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: ep_fewer_due selected when ep_more_due excluded`);
  }

  // After dateshift: episodesPlayedToday is cleared, both are eligible
  // ep_fewer_due: 1 due card (card-001-te via tag_001)
  // ep_more_due: 2 due cards (card-001-te via tag_001 + card-003-te via tag_003 in its act2)
  // Expected: ep_more_due selected (more due cards)
  state.currentEpisodeId = null;
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
  console.log(`  Expected: ep_more_due (has 2 due cards vs ep_fewer_due's 1)`);

  if (state.currentEpisodeId === 'ep_more_due') {
    console.log(`  ✅ PASS: New day cleared played-today, more-due-episode selected`);
  } else {
    console.log(`  ❌ FAIL: Expected ep_more_due after new day`);
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
