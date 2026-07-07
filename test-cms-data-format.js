/**
 * RED test: CMS data format compliance — dialogue="[None]" bug
 *
 * 250/340 episodes have dialogue="[None]" with actual text in 'line' field.
 * This test simulates user actions on real CMS data and asserts that
 * dialogue renders correctly (not as "[None"]).
 *
 * Strategy: use a small subset of REAL episode data (not synthetic)
 * to catch data format issues that synthetic tests miss.
 */

const path = require('path');

async function runTests() {
  const controllerPath = path.resolve(__dirname, 'app/src/controller/controller.js');
  const { getProps, Handlers, normalizeLine } = await import(controllerPath);

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

  // ===================== REAL CMS DATA (subset with [None] dialogue) =====================
  // This is the ACTUAL format from the CMS — 250/340 episodes have this issue
  const episodes = [
    {
      id: 'ep_cms_test',
      title: 'CMS Data Test Episode',
      acts: [
        {
          tag: 'tag_001',
          lines_before: [
            {
              char: 'char_narrator',
              line: 'The ship sails through golden clouds.',
              character: 'char_bandit',
              place: 'place_ship',
              dialogue: '[None]',
              stage_directions: ['Wind snaps the sails.']
            },
            {
              char: 'char_arthit',
              line: 'The Tonal Order charts mark this sector as stable.',
              character: 'char_bandit',
              place: 'place_surface',
              dialogue: '[None]',
              stage_directions: []
            },
          ],
          lines_after: [
            {
              char: 'char_narrator',
              line: 'The echo fades into the crystal lattice below.',
              character: 'char_bandit',
              place: 'place_ship',
              dialogue: '[None]',
              stage_directions: []
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

  const vocabItems = [
    { id: 'vocab-001', thai: 'สวัสดี', english: 'hello', tags: [] },
  ];

  const cards = [
    { id: 'card-001-te', vocabId: 'vocab-001', direction: 'thai-eng', front: 'สวัสดี', back: 'hello', tags: [] },
    { id: 'card-001-et', vocabId: 'vocab-001', direction: 'eng-thai', front: 'hello', back: 'สวัสดี', tags: [] },
  ];

  const tags = { 'tag_001': ['vocab-001'] };

  const characters = {
    'char_narrator': { name: 'Narrator', description: 'The story voice', picture: null },
    'char_arthit': { name: 'Arthit', description: 'A seasoned sailor', picture: null },
    'char_bandit': { name: 'Sky Pirate', description: 'A bandit', picture: null },
  };

  const places = {
    'place_ship': { name: 'The Ship', description: 'A flying vessel', picture: null },
    'place_surface': { name: 'The Lattice Surface', description: 'Crystalline ground', picture: null },
  };

  function makeState() {
    return {
      episodes,
      vocabItems,
      cards,
      tags,
      characters,
      places,
      cardStats: {
        'card-001-te': { repetitions: 0, interval: 1, ef: 2.5, lastReviewed: null },
      },
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
      toast: null,
      cmsBaseUrl: 'https://example.com',
      subplots: { main: { name: 'Main Plot' } },
    };
  }

  // ===================== TEST 1: Dialogue is NOT "[None]" =====================
  console.log('\n=== TEST 1: Dialogue renders actual text, not "[None]" ===\n');

  let state = makeState();
  state = apply(state, Handlers.onStartEpisode(state, env));

  const props1 = getProps(state, env);
  const dialogue1 = props1.currentLine?.dialogue;
  console.log(`Line 0 dialogue: "${dialogue1}"`);

  if (dialogue1 === '[None]' || dialogue1 === 'None') {
    console.log(`  ❌ FAIL: dialogue is "${dialogue1}" — should be the actual text`);
    exitCode = 1;
  } else if (dialogue1 === 'The ship sails through golden clouds.') {
    console.log(`  ✅ PASS: dialogue shows actual text`);
  } else {
    console.log(`  ⚠️  Unexpected dialogue: "${dialogue1}"`);
    exitCode = 1;
  }

  // ===================== TEST 2: Character is correct, not "char_bandit" =====================
  console.log('\n=== TEST 2: Character resolves to correct speaker ===\n');

  const charName1 = props1.currentCharacter?.name;
  console.log(`Line 0 character: "${charName1}" (expected: "Narrator")`);

  if (charName1 === 'Sky Pirate') {
    console.log(`  ❌ FAIL: character is "Sky Pirate" — should be "Narrator" (the actual speaker)`);
    exitCode = 1;
  } else if (charName1 === 'Narrator') {
    console.log(`  ✅ PASS: character is correct`);
  } else {
    console.log(`  ⚠️  Unexpected character: "${charName1}"`);
    exitCode = 1;
  }

  // ===================== TEST 3: Tapping Next advances to next line =====================
  console.log('\n=== TEST 3: Next button advances and shows correct dialogue ===\n');

  state = apply(state, Handlers.onTapNextLine(state, env));

  const props2 = getProps(state, env);
  const dialogue2 = props2.currentLine?.dialogue;
  const charName2 = props2.currentCharacter?.name;
  console.log(`Line 1 dialogue: "${dialogue2}"`);
  console.log(`Line 1 character: "${charName2}" (expected: "Arthit")`);

  if (dialogue2 === '[None]' || dialogue2 === 'None') {
    console.log(`  ❌ FAIL: line 1 dialogue is "${dialogue2}"`);
    exitCode = 1;
  } else if (dialogue2 === 'The Tonal Order charts mark this sector as stable.') {
    console.log(`  ✅ PASS: line 1 dialogue is correct`);
  } else {
    console.log(`  ⚠️  Unexpected line 1 dialogue: "${dialogue2}"`);
    exitCode = 1;
  }

  if (charName2 === 'Arthit') {
    console.log(`  ✅ PASS: line 1 character is "Arthit"`);
  } else if (charName2 === 'Sky Pirate') {
    console.log(`  ❌ FAIL: line 1 character is "Sky Pirate" — should be "Arthit"`);
    exitCode = 1;
  } else {
    console.log(`  ⚠️  Unexpected line 1 character: "${charName2}"`);
  }

  // ===================== TEST 4: normalizeLine unit check =====================
  console.log('\n=== TEST 4: normalizeLine handles edge cases ===\n');

  const testCases = [
    {
      input: { dialogue: '[None]', line: 'Real text', char: 'char_arthit', character: 'char_bandit' },
      expected: { dialogue: 'Real text', char: 'char_arthit', character: 'char_arthit' },
      desc: '[None] dialogue + char override'
    },
    {
      input: { dialogue: 'Normal text', line: 'Other', char: 'char_a', character: 'char_b' },
      expected: { dialogue: 'Normal text', char: 'char_a', character: 'char_a' },
      desc: 'normal dialogue still gets char override'
    },
    {
      input: { dialogue: 'Normal', character: 'char_x' },
      expected: { dialogue: 'Normal', character: 'char_x' },
      desc: 'normal data unchanged'
    },
    {
      input: null,
      expected: null,
      desc: 'null line'
    },
  ];

  for (const tc of testCases) {
    const result = normalizeLine(tc.input);
    if (tc.expected === null) {
      if (result === null) {
        console.log(`  ✅ ${tc.desc}: null preserved`);
      } else {
        console.log(`  ❌ ${tc.desc}: expected null, got ${JSON.stringify(result)}`);
        exitCode = 1;
      }
      continue;
    }
    let pass = true;
    for (const key of Object.keys(tc.expected)) {
      if (result?.[key] !== tc.expected[key]) {
        pass = false;
        console.log(`  ❌ ${tc.desc}: ${key}="${result?.[key]}" expected "${tc.expected[key]}"`);
      }
    }
    if (pass) {
      console.log(`  ✅ ${tc.desc}: correct`);
    } else {
      exitCode = 1;
    }
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
