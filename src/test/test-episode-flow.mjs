// test-episode-flow.mjs - End-to-end user journey test
// Tests loading CMS data, tapping Start Episode, and navigating through acts

import { getProps, Handlers } from '../controller/controller.js';

const today = 19724;

const testEnv = {
  content: { pageTitles: ['Thai RPG'] },
  time: {
    getTimestamp: () => 1704067200000,
    getDayStart: () => 1704067200000,
    getDaysSinceEpoch: () => today,
  },
  loadContent: () => [],
  checkForUpdates: () => {},
  speakThai: (text) => { testEnv.lastSpoken = text; },
};

// ============ SIMULATE CMS DATA (with string stage_directions) ============

const cmsEpisodes = [
  {
    id: 'ep_001',
    title: 'The Resonance Route',
    acts: [
      {
        id: 'act_1',
        title: 'The Signal',
        lines_before: [
          {
            character: 'char_narrator',
            place: 'place_resonance_ship',
            dialogue: 'The ship sails through clouds.',
            stage_directions: 'Wind snaps the rigging.'  // STRING, not array!
          },
          {
            character: 'char_chanida',
            place: 'place_resonance_ship',
            dialogue: 'Listen. The lattice is different here.',
            stage_directions: 'She holds her tuning fork.'  // STRING!
          }
        ],
        tag: 'tag_008',
        lines_after: [
          {
            character: 'char_chanida',
            place: 'place_resonance_ship',
            dialogue: 'We must follow the signal.',
            stage_directions: ''  // Empty string
          }
        ],
        decision: {
          line: {
            character: 'char_pichit',
            place: 'place_phrao_monastery',
            dialogue: 'What do you choose?',
            stage_directions: 'The monk waits.'  // STRING!
          },
          choices: [
            {
              description: 'Follow the signal',
              difficulty: 'medium',
              subplot: 'subplot_frequency_map',
              pass_outcome: {
                line: {
                  character: 'char_narrator',
                  place: 'place_phrao_monastery',
                  dialogue: 'You follow the signal into the unknown.',
                  stage_directions: 'The lattice hums.'  // STRING!
                },
                subplot: 'subplot_frequency_map',
                delta: 2
              },
              fail_outcome: {
                line: {
                  character: 'char_narrator',
                  place: 'place_phrao_monastery',
                  dialogue: 'You lose the trail.',
                  stage_directions: ''  // Empty string
                },
                subplot: 'subplot_frequency_map',
                delta: -1
              }
            }
          ]
        }
      }
    ]
  }
];

const cmsCharacters = {
  char_narrator: { id: 'char_narrator', name: 'Narrator', picture: '', type: 'narrator' },
  char_chanida: { id: 'char_chanida', name: 'Chanida', picture: '', type: 'party' },
  char_pichit: { id: 'char_pichit', name: 'Pichit', picture: '', type: 'party' },
};

const cmsPlaces = {
  place_resonance_ship: { id: 'place_resonance_ship', name: 'Resonance Ship', picture: '' },
  place_phrao_monastery: { id: 'place_phrao_monastery', name: 'Phrao Monastery', picture: '' },
};

const cmsSubplots = {
  subplot_frequency_map: { id: 'subplot_frequency_map', name: 'Frequency Map' },
};

const cmsTags = {
  tag_008: ['402-1.', '402-2.'],
};

const cmsVocab = [
  { id: '402-1.', thai: 'มีเรื่องจะบอก(นะ)', phonetics: 'mii rʉ̂ang', english: 'I have something to tell you.' },
  { id: '402-2.', thai: 'จะลองดู(ค่ะ)', phonetics: 'jà lɔɔng-duu', english: "I'll try it." },
];

// ============ NORMALIZATION (same as Store.tsx) ============

function normalizeEpisode(ep) {
  if (!ep) return ep;
  const normalized = { ...ep };
  if (Array.isArray(normalized.acts)) {
    normalized.acts = normalized.acts.map(normalizeAct);
  }
  return normalized;
}

function normalizeAct(act) {
  if (!act) return act;
  const normalized = { ...act };
  normalized.lines_before = (act.lines_before || []).map(normalizeLine);
  normalized.lines_after = (act.lines_after || []).map(normalizeLine);
  if (act.decision) {
    normalized.decision = normalizeDecision(act.decision);
  }
  return normalized;
}

function normalizeLine(line) {
  if (!line) return line;
  const normalized = { ...line };
  const sd = normalized.stage_directions;
  if (sd === null || sd === undefined) {
    normalized.stage_directions = [];
  } else if (typeof sd === 'string') {
    normalized.stage_directions = sd.trim() ? [sd] : [];
  } else if (!Array.isArray(sd)) {
    normalized.stage_directions = [];
  }
  if (!normalized.dialogue) normalized.dialogue = '';
  return normalized;
}

function normalizeDecision(decision) {
  if (!decision) return decision;
  const normalized = { ...decision };
  if (decision.line) {
    normalized.line = normalizeLine(decision.line);
  }
  if (Array.isArray(decision.choices)) {
    normalized.choices = decision.choices.map(normalizeChoice);
  }
  return normalized;
}

function normalizeChoice(choice) {
  if (!choice) return choice;
  const normalized = { ...choice };
  if (choice.pass_outcome?.line) {
    normalized.pass_outcome = { ...choice.pass_outcome, line: normalizeLine(choice.pass_outcome.line) };
  }
  if (choice.fail_outcome?.line) {
    normalized.fail_outcome = { ...choice.fail_outcome, line: normalizeLine(choice.fail_outcome.line) };
  }
  return normalized;
}

// Helper: create initial state with CMS data loaded AND normalized
function createLoadedState() {
  const cards = [];
  for (const item of cmsVocab) {
    cards.push({ id: `card-${item.id}-eng-thai`, vocabId: item.id, direction: 'eng-thai', front: item.english, back: item.thai, phonetics: item.phonetics });
    cards.push({ id: `card-${item.id}-thai-eng`, vocabId: item.id, direction: 'thai-eng', front: item.thai, back: item.english, phonetics: item.phonetics });
  }

  return {
    episodes: cmsEpisodes.map(normalizeEpisode),
    characters: cmsCharacters,
    places: cmsPlaces,
    subplots: cmsSubplots,
    tags: cmsTags,
    vocabItems: cmsVocab,
    cards,
    cardStats: {},
    currentView: 'welcome',
    isSettingsOpen: false,
    dateshift: 0,
  };
}

// ============ TESTS ============

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `Expected ${expected}, got ${actual}`);
}

function runTest(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    testsFailed++;
    failures.push({ name, error: error.message });
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
  }
}

// === Test 1: State loads with normalized episodes ===
runTest('GivenCMSData_WhenNormalized_ThenStageDirectionsIsArray', () => {
  const state = createLoadedState();
  const line = state.episodes[0].acts[0].lines_before[0];
  assert(Array.isArray(line.stage_directions), 'stage_directions should be array after normalization');
  assertEqual(line.stage_directions.length, 1, 'Should have 1 stage direction');
  assertEqual(line.stage_directions[0], 'Wind snaps the rigging.', 'Should preserve text');
});

// === Test 2: Empty string stage_directions becomes empty array ===
runTest('GivenEmptyStageDirections_WhenNormalized_ThenEmptyArray', () => {
  const state = createLoadedState();
  const line = state.episodes[0].acts[0].lines_after[0];
  assert(Array.isArray(line.stage_directions), 'Empty string should become array');
  assertEqual(line.stage_directions.length, 0, 'Empty string should become empty array');
});

// === Test 3: Decision line stage_directions normalized ===
runTest('GivenDecisionLine_WhenNormalized_ThenStageDirectionsIsArray', () => {
  const state = createLoadedState();
  const decision = state.episodes[0].acts[0].decision;
  assert(Array.isArray(decision.line.stage_directions), 'Decision line stage_directions should be array');
  assertEqual(decision.line.stage_directions[0], 'The monk waits.', 'Should preserve text');
});

// === Test 4: Outcome line stage_directions normalized ===
runTest('GivenOutcomeLine_WhenNormalized_ThenStageDirectionsIsArray', () => {
  const state = createLoadedState();
  const choice = state.episodes[0].acts[0].decision.choices[0];
  assert(Array.isArray(choice.pass_outcome.line.stage_directions), 'Outcome line stage_directions should be array');
  assertEqual(choice.pass_outcome.line.stage_directions[0], 'The lattice hums.', 'Should preserve text');
});

// === Test 5: getProps doesn't crash after normalization ===
runTest('GivenNormalizedData_WhenGetPropsCalled_ThenNoCrash', () => {
  const state = createLoadedState();
  const props = getProps(state, testEnv);
  assert(props !== null, 'getProps should return something');
});

// === Test 6: Start Episode handler works ===
runTest('GivenCMSData_WhenStartEpisode_ThenEpisodeSelected', () => {
  let state = createLoadedState();
  const update = Handlers.onStartEpisode(state, testEnv);
  state = { ...state, ...update };
  assertEqual(state.currentView, 'episode', 'Should switch to episode view');
  assertEqual(state.currentEpisodeId, 'ep_001', 'Should select first episode');
});

// === Test 7: CRITICAL - getProps after Start Episode returns valid line ===
runTest('GivenCMSData_WhenStartEpisode_ThenGetPropsReturnsValidLine', () => {
  let state = createLoadedState();
  state = { ...state, ...Handlers.onStartEpisode(state, testEnv) };
  const props = getProps(state, testEnv);
  
  assert(props.currentLine !== null, 'Should have a current line');
  assert(props.currentLine.dialogue.includes('ship'), `Should show first line, got: ${props.currentLine?.dialogue}`);
  assert(props.currentCharacter !== null, 'Should have a character');
  assert(props.currentPlace !== null, 'Should have a place');
  
  // CRITICAL: stage_directions must be array for LineCard
  assert(Array.isArray(props.currentLine.stage_directions), 
    `stage_directions must be array, got: ${typeof props.currentLine.stage_directions}`);
});

// === Test 8: LineCard .map() works on normalized stage_directions ===
runTest('GivenNormalizedLine_WhenViewMaps_ThenNoCrash', () => {
  const state = createLoadedState();
  const line = state.episodes[0].acts[0].lines_before[0];
  
  // This is exactly what LineCard does
  if (line.stage_directions && line.stage_directions.length > 0) {
    const result = line.stage_directions.map((sd, i) => sd);
    assertEqual(result.length, 1, 'Should map to 1 element');
    assertEqual(result[0], 'Wind snaps the rigging.', 'Should preserve text');
  }
});

// === Test 9: Full user journey through lines_before ===
runTest('GivenEpisodeStarted_WhenTapNextLine_ThenAdvancesThroughLines', () => {
  let state = createLoadedState();
  state = { ...state, ...Handlers.onStartEpisode(state, testEnv) };
  
  let props = getProps(state, testEnv);
  assert(props.currentLine.dialogue.includes('ship'), 'First line');
  
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  props = getProps(state, testEnv);
  assert(props.currentLine.dialogue.includes('Listen'), 'Second line should be Chanida');
});

// === Test 10: lines_before → vocab_review transition ===
runTest('GivenLastLineBefore_WhenTapNext_ThenGoesToVocabReview', () => {
  let state = createLoadedState();
  state = { ...state, ...Handlers.onStartEpisode(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  
  assertEqual(state.actPhase, 'vocab_review', 'Should transition to vocab_review');
  const props = getProps(state, testEnv);
  assert(props.showVocabReview === true, 'Should show vocab review');
});

// === Test 11: vocab_review → lines_after ===
runTest('GivenVocabReview_WhenDone_ThenGoesToLinesAfter', () => {
  let state = createLoadedState();
  state = { ...state, ...Handlers.onStartEpisode(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onVocabReviewDone(state, testEnv) };
  
  assertEqual(state.actPhase, 'lines_after', 'Should go to lines_after');
  const props = getProps(state, testEnv);
  assert(props.currentLine !== null, 'Should show lines_after line');
});

// === Test 12: lines_after → choice ===
runTest('GivenLinesAfterDone_WhenTapNext_ThenGoesToChoice', () => {
  let state = createLoadedState();
  state = { ...state, ...Handlers.onStartEpisode(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onVocabReviewDone(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  
  assertEqual(state.actPhase, 'choice', 'Should transition to choice');
  const props = getProps(state, testEnv);
  assert(props.currentDecision !== null, 'Should have a decision');
});

// === Test 13: choice → outcome ===
runTest('GivenChoice_WhenTapChoice_ThenShowsOutcome', () => {
  let state = createLoadedState();
  state = { ...state, ...Handlers.onStartEpisode(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onVocabReviewDone(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onTapChoice(state, testEnv, 0) };
  
  assertEqual(state.actPhase, 'outcome', 'Should show outcome');
  const props = getProps(state, testEnv);
  assert(props.currentLine !== null, 'Should have outcome line');
  assert(Array.isArray(props.currentLine.stage_directions), 
    'Outcome line stage_directions must be array');
});

// === Test 14: outcome → welcome (episode complete) ===
runTest('GivenOutcome_WhenDone_ThenGoesToWelcome', () => {
  let state = createLoadedState();
  state = { ...state, ...Handlers.onStartEpisode(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onVocabReviewDone(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onTapChoice(state, testEnv, 0) };
  state = { ...state, ...Handlers.onOutcomeDone(state, testEnv) };
  
  assertEqual(state.currentView, 'welcome', 'Should return to welcome after episode');
  assertEqual(state.episodePlays['ep_001'], 1, 'Should record episode play');
});

// === Test 15: Episode with multiple acts → next act ===
runTest('GivenMultiActEpisode_WhenOutcomeDone_ThenNextAct', () => {
  // Create episode with 2 acts
  let state = createLoadedState();
  state.episodes[0].acts.push({
    id: 'act_2',
    title: 'Act 2',
    lines_before: [{ dialogue: 'Act 2 begins.', character: null, place: null, stage_directions: [] }],
    tag: 'tag_008',
    lines_after: [],
    decision: {
      line: { dialogue: 'Choose.', character: null, place: null, stage_directions: [] },
      choices: [{ description: 'OK', difficulty: 'easy', subplot: 'subplot_frequency_map', pass_outcome: { line: { dialogue: 'Done.', character: null, place: null, stage_directions: [] }, subplot: 'subplot_frequency_map', delta: 1 } }]
    }
  });
  
  state = { ...state, ...Handlers.onStartEpisode(state, testEnv) };
  // Complete act 1
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onVocabReviewDone(state, testEnv) };
  state = { ...state, ...Handlers.onTapNextLine(state, testEnv) };
  state = { ...state, ...Handlers.onTapChoice(state, testEnv, 0) };
  state = { ...state, ...Handlers.onOutcomeDone(state, testEnv) };
  
  assertEqual(state.currentView, 'episode', 'Should stay in episode for next act');
  assertEqual(state.currentActIndex, 1, 'Should advance to act 2');
  assertEqual(state.actPhase, 'lines_before', 'Should reset to lines_before');
});

// ============ SUMMARY ============

console.log('\n' + '='.repeat(60));
console.log(`Tests run: ${testsRun}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);

if (testsFailed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('\nAll user journey tests passed! ✓');
  console.log('  stage_directions is now normalized from string → array');
  console.log('  Full episode flow: welcome → lines → vocab → choice → outcome → done');
  process.exit(0);
}
