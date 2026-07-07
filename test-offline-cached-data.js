/**
 * Regression test: Offline cached data with CMS corruption.
 *
 * When offline, the app loads episodes from Cache API / localStorage.
 * These cached episodes may have dialogue="[None]" (250/340 episodes).
 * The controller must normalize this at render time — regardless of
 * whether data came from CMS, Cache API, or localStorage.
 *
 * This test simulates: state restored from localStorage → episode rendered.
 * It does NOT test the Service Worker (that's a deployment concern).
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

  let exitCode = 0;

  // ===================== TEST DATA: Corrupted cached episode =====================
  // This simulates data loaded from Cache API when offline.
  // The CMS corruption (dialogue="[None]", character="char_bandit")
  // has already been cached — the app must handle it at render time.
  const episodes = [
    {
      id: 'ep_cached',
      title: 'Cached Episode',
      acts: [
        {
          tag: 'tag_001',
          lines_before: [
            {
              char: 'char_narrator',
              line: 'The ship sails through golden clouds.',
              character: 'char_bandit',  // WRONG — CMS bug
              place: 'place_ship',
              dialogue: '[None]',         // WRONG — CMS bug
              stage_directions: [],
            },
            {
              char: 'char_chanida',
              line: 'Listen to the crystals sing.',
              character: 'char_bandit',  // WRONG
              place: 'place_ship',
              dialogue: '[None]',         // WRONG
              stage_directions: [],
            },
          ],
          lines_after: [
            {
              char: 'char_narrator',
              line: 'The echo fades.',
              character: 'char_bandit',
              place: 'place_ship',
              dialogue: '[None]',
              stage_directions: [],
            },
          ],
          decision: {
            line: { character: 'char_narrator', place: 'place_ship', dialogue: 'What do you do?', stage_directions: [] },
            choices: [{ pass_outcome: { subplot: 'main', delta: 1, line: 'You press on.' } }],
          },
          consequence: {},
        },
      ],
    },
  ];

  const vocabItems = [{ id: 'vocab-001', thai: 'สวัสดี', english: 'hello', tags: [] }];
  const cards = [
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', tags: [] },
  ];
  const tags = { 'tag_001': ['vocab-001'] };

  const characters = {
    'char_narrator': { name: 'Narrator', description: 'The voice', picture: null },
    'char_chanida': { name: 'Chanida', description: 'A crystal singer', picture: null },
    'char_bandit': { name: 'Sky Pirate', description: 'Wrong default', picture: null },
  };

  const places = {
    'place_ship': { name: 'The Ship', description: 'Flying vessel', picture: null },
  };

  function makeState(currentEpisodeId = null) {
    return {
      episodes,
      vocabItems,
      cards,
      tags,
      characters,
      places,
      cardStats: {},
      againQueue: [],
      againDelayCounter: 0,
      dateshift: 0,
      currentView: currentEpisodeId ? 'episode' : 'welcome',
      currentEpisodeId,
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
      cmsBaseUrl: 'https://example.com',
      subplots: { main: { name: 'Main' } },
    };
  }

  // ===================== TEST 1: First line renders real dialogue, not [None] =====================
  console.log('\n=== TEST 1: Offline cached line shows real text ===\n');

  let state = makeState('ep_cached');
  const props1 = getProps(state, env);

  const dialogue1 = props1.currentLine?.dialogue;
  const charName1 = props1.currentCharacter?.name;

  console.log(`Dialogue: "${dialogue1}"`);
  console.log(`Character: "${charName1}"`);

  if (dialogue1 === '[None]') {
    console.log('  ❌ FAIL: dialogue is "[None]" — normalizeLine should fix cached data');
    exitCode = 1;
  } else if (dialogue1 === 'The ship sails through golden clouds.') {
    console.log('  ✅ PASS: cached [None] dialogue was normalized to real text');
  } else {
    console.log(`  ⚠️  Unexpected: "${dialogue1}"`);
    exitCode = 1;
  }

  if (charName1 === 'Sky Pirate') {
    console.log('  ❌ FAIL: character is "Sky Pirate" — should be "Narrator"');
    exitCode = 1;
  } else if (charName1 === 'Narrator') {
    console.log('  ✅ PASS: cached wrong character was normalized');
  } else {
    console.log(`  ⚠️  Unexpected character: "${charName1}"`);
  }

  // ===================== TEST 2: Tapping Next advances correctly =====================
  console.log('\n=== TEST 2: Next button works with cached corrupted data ===\n');

  state = apply(state, Handlers.onTapNextLine(state, env));
  const props2 = getProps(state, env);

  const lineIndex2 = state.currentLineIndex;
  const dialogue2 = props2.currentLine?.dialogue;
  const charName2 = props2.currentCharacter?.name;

  console.log(`After Next: lineIndex=${lineIndex2}`);
  console.log(`Dialogue: "${dialogue2}"`);
  console.log(`Character: "${charName2}"`);

  if (dialogue2 === '[None]') {
    console.log('  ❌ FAIL: line 1 dialogue is "[None]"');
    exitCode = 1;
  } else if (dialogue2 === 'Listen to the crystals sing.') {
    console.log('  ✅ PASS: Next advances and shows normalized line 1');
  } else {
    console.log(`  ⚠️  Unexpected: "${dialogue2}"`);
    exitCode = 1;
  }

  if (charName2 === 'Chanida') {
    console.log('  ✅ PASS: line 1 character is "Chanida"');
  } else {
    console.log(`  ❌ FAIL: line 1 character is "${charName2}" — should be "Chanida"`);
    exitCode = 1;
  }

  // ===================== TEST 3: lines_after also normalized =====================
  console.log('\n=== TEST 3: lines_after normalized too ===\n');

  // Skip to lines_after by going through vocab_review
  state = { ...state, actPhase: 'lines_after', currentLineIndex: 0 };
  const props3 = getProps(state, env);
  const dialogue3 = props3.currentLine?.dialogue;
  console.log(`lines_after[0]: "${dialogue3}"`);

  if (dialogue3 === '[None]') {
    console.log('  ❌ FAIL: lines_after dialogue is "[None]"');
    exitCode = 1;
  } else if (dialogue3 === 'The echo fades.') {
    console.log('  ✅ PASS: lines_after normalized');
  } else {
    console.log(`  ⚠️  Unexpected: "${dialogue3}"`);
    exitCode = 1;
  }

  // ===================== TEST 4: Next from last lines_before → vocab_review =====================
  console.log('\n=== TEST 4: Next from last lines_before enters vocab_review ===\n');

  state = makeState('ep_cached');
  state = apply(state, Handlers.onTapNextLine(state, env)); // line 0 → line 1
  state = apply(state, Handlers.onTapNextLine(state, env)); // line 1 → vocab_review

  const props4 = getProps(state, env);
  console.log(`actPhase: ${state.actPhase}`);
  console.log(`showVocabReview: ${props4.showVocabReview}`);

  if (state.actPhase !== 'vocab_review') {
    console.log(`  ❌ FAIL: actPhase should be vocab_review, got ${state.actPhase}`);
    exitCode = 1;
  } else {
    console.log(`  ✅ PASS: Next from last line transitions to vocab_review`);
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
