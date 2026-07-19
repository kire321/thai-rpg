// controller.js - Plain JavaScript, no compilation needed
// Business logic for Thai RPG PWA with SM-2 Spaced Repetition

// =====================
// SM-2 Algorithm Helpers
// =====================

// SM-2 spaced repetition with quality-dependent intervals for ALL repetition levels.
// quality: 1=again, 3=hard, 4=good, 5=easy
// The standard SM-2 gives interval=1 for rep=0 and interval=6 for rep=1 regardless
// of quality. We scale those base intervals by a quality factor so hard/good/easy
// always produce different schedules.
function sm2Schedule(quality, repetitions, interval, ef) {
  let newInterval, newRepetitions, newEF;

  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1;
    newEF = ef;
  } else {
    newRepetitions = repetitions + 1;
    // Quality scale factor: hard(3)=0.8, good(4)=1.0, easy(5)=1.2
    const qualityScale = 1 + (quality - 4) * 0.2;
    if (repetitions === 0) {
      // First success on a new/again card: hard=1d, good=1d, easy=2d
      newInterval = Math.max(1, Math.ceil(1 * qualityScale));
    } else if (repetitions === 1) {
      newInterval = Math.max(1, Math.ceil(6 * qualityScale));
    } else {
      newInterval = Math.max(1, Math.ceil(interval * ef * qualityScale));
    }
    newEF = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (newEF < 1.3) newEF = 1.3;
  }
  return { interval: newInterval, repetitions: newRepetitions, ef: newEF };
}

function getEffectiveDay(env, dateshift) {
  return env.time.getDaysSinceEpoch() + (dateshift || 0);
}

function getDueDate(stats) {
  if (!stats) return null;
  if (stats.failedToday) return stats.lastReviewed;
  if (stats.repetitions === 0 && !stats.lastReviewed) return null;
  return (stats.lastReviewed || 0) + (stats.interval || 0);
}

function isCardDue(stats, day, isInAgainQueue) {
  if (isInAgainQueue) return true;
  if (!stats) return true;
  if (stats.failedToday) return true;
  if (stats.repetitions === 0 && !stats.lastReviewed) return true;
  const dueDate = getDueDate(stats);
  if (dueDate === null) return true;
  return dueDate <= day;
}

// REMOVED: isFirstAttemptedToday heuristic was wrong — it used repetitions <= 1
// which incorrectly classified due cards (rated "again" then "good") as "new".
//
// REPLACED BY: explicit newCardsRatedToday counter in state, incremented in
// onRateCard when a card has lastReviewed === null (truly new, never seen).

function isThaiText(text) {
  if (!text) return false;
  return /[\u0E00-\u0E7F]/.test(text);
}

function getSchedulePreview(cardStats, againDelay) {
  const stats = cardStats || { repetitions: 0, interval: 0, ef: 2.5 };
  const againResult = sm2Schedule(1, stats.repetitions, stats.interval, stats.ef);
  const hardResult = sm2Schedule(3, stats.repetitions, stats.interval, stats.ef);
  const goodResult = sm2Schedule(4, stats.repetitions, stats.interval, stats.ef);
  const easyResult = sm2Schedule(5, stats.repetitions, stats.interval, stats.ef);
  const isDelay = againDelay !== null && againDelay !== undefined;
  return { 
    again: isDelay ? againDelay : againResult.interval, 
    againIsDelay: isDelay,
    hard: hardResult.interval, 
    good: goodResult.interval, 
    easy: easyResult.interval 
  };
}

// =====================
// Content & Card Helpers
// =====================

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateCards(vocabItems) {
  if (!vocabItems || !Array.isArray(vocabItems)) return [];
  const cards = [];
  for (const item of vocabItems) {
    cards.push({ id: `card-${item.id}-eng-thai`, vocabId: item.id, direction: 'eng-thai', front: item.english, back: item.thai, phonetics: item.phonetics });
    cards.push({ id: `card-${item.id}-thai-eng`, vocabId: item.id, direction: 'thai-eng', front: item.thai, back: item.english, phonetics: item.phonetics });
  }
  return shuffleArray(cards);
}

function mergeStats(oldStats, newCards) {
  if (!oldStats) return {};
  const newStats = {};
  for (const card of newCards) {
    if (oldStats[card.id]) newStats[card.id] = { ...oldStats[card.id] };
  }
  return newStats;
}

function getCardStats(card, allStats) {
  if (!card || !allStats) return null;
  if (allStats[card.id]) return allStats[card.id];
  if (allStats[card.vocabId]) return allStats[card.vocabId];
  return null;
}

// =====================
// Episode Helpers
// =====================

function getCurrentEpisode(state) {
  if (!state.episodes) return null;
  return state.episodes.find(e => e.id === state.currentEpisodeId) || null;
}

function getCurrentAct(state) {
  const episode = getCurrentEpisode(state);
  if (!episode) return null;
  return episode.acts[state.currentActIndex || 0] || null;
}

// CMS data quality: some episodes have dialogue="[None]" with the real
// text in the 'line' field, and character="char_bandit" with the real
// character in the 'char' field. Normalize to the correct format.
function normalizeLine(line) {
  if (!line) return line;
  const updates = {};
  // Fix dialogue: if "[None]" or empty, use 'line' field
  if ((line.dialogue === '[None]' || line.dialogue === 'None' || line.dialogue === '') && line.line && line.line !== 'MISSING') {
    updates.dialogue = line.line;
  }
  // Fix character: if 'char' exists and differs from 'character', prefer 'char'
  // (CMS bug: some episodes have character="char_bandit" for all lines)
  if (line.char && line.character && line.char !== line.character) {
    updates.character = line.char;
  }
  return Object.keys(updates).length > 0 ? { ...line, ...updates } : line;
}

function getCurrentLine(state) {
  const act = getCurrentAct(state);
  if (!act) return null;
  const phase = state.actPhase || 'lines_before';
  const index = state.currentLineIndex || 0;
  
  let line = null;
  if (phase === 'lines_before') {
    if (index < act.lines_before.length) line = act.lines_before[index];
  }
  if (phase === 'lines_after') {
    if (index < act.lines_after.length) line = act.lines_after[index];
  }
  if (phase === 'choice') {
    line = act.decision.line || null;
  }
  if (phase === 'outcome') {
    line = state.outcomeLine || null;
  }
  
  // Normalize CMS data quality issues before returning
  return normalizeLine(line);
}

function getCurrentCharacter(state) {
  const line = getCurrentLine(state);
  if (!line || !line.character) return null;
  return (state.characters || {})[line.character] || null;
}

function getCurrentPlace(state) {
  const line = getCurrentLine(state);
  if (!line || !line.place) return null;
  return (state.places || {})[line.place] || null;
}

// Calculate a card's effective due date (lower = more overdue).
// Cards in the againQueue are always the most overdue.
function getCardDueDate(card, stats, againQueue) {
  if (againQueue.includes(card.id)) return -Infinity; // Most urgent
  const s = getCardStats(card, stats);
  if (!s || !s.lastReviewed) return 0; // New cards: due at epoch
  return s.lastReviewed + (s.interval || 0);
}

// Count due cards (reviewed at least once + again/overdue) across all acts of an episode.
// Shares the due-date logic with isCardDue and getCardDueDate — unified code path.
function countDueCardsInEpisode(episode, state, env) {
  const allCards = state.cards || [];
  const allStats = state.cardStats || {};
  const againQueue = state.againQueue || [];
  const today = getEffectiveDay(env, state.dateshift || 0);
  const tags = state.tags || {};

  const seenCardIds = new Set();
  let dueCount = 0;

  for (const act of episode.acts || []) {
    const tagVocabIds = tags[act.tag] || [];
    for (const card of allCards) {
      if (!tagVocabIds.includes(card.vocabId)) continue;
      if (seenCardIds.has(card.id)) continue;
      seenCardIds.add(card.id);

      const s = getCardStats(card, allStats);
      // Due = has been reviewed at least once AND is either again or overdue
      if (s && s.lastReviewed !== null) {
        if (againQueue.includes(card.id) || s.failedToday) {
          dueCount++;
        } else {
          const dueDate = s.lastReviewed + (s.interval || 0);
          if (dueDate <= today) dueCount++;
        }
      }
    }
  }

  return dueCount;
}

function getNextEpisode(state, env) {
  if (!state.episodes || state.episodes.length === 0) return null;
  const episodePlays = state.episodePlays || {};
  const cards = state.cards || [];
  const stats = state.cardStats || {};
  const againQueue = state.againQueue || [];
  const episodesPlayedToday = state.episodesPlayedToday || [];

  // EPISODE SELECTION ALGORITHM v2:
  // 1. Find the most overdue card
  // 2. Find tags containing that card's vocabId
  // 3. Find episodes whose first act uses one of those tags
  // 4. Exclude episodes played today
  // 5. Prioritize episodes reviewing the most due cards
  // 6. Tiebreak: least-played overall

  // Step 1: Find the most overdue card
  if (cards.length === 0) {
    return state.episodes.sort((a, b) => (episodePlays[a.id] || 0) - (episodePlays[b.id] || 0))[0];
  }

  const sortedByDue = [...cards].sort((a, b) => {
    return getCardDueDate(a, stats, againQueue) - getCardDueDate(b, stats, againQueue);
  });
  const mostOverdueCard = sortedByDue[0];

  // Step 2: Find which tags contain this card's vocabId
  const tags = state.tags || {};
  const matchingTags = [];
  for (const [tagName, vocabIds] of Object.entries(tags)) {
    if (vocabIds.includes(mostOverdueCard.vocabId)) {
      matchingTags.push(tagName);
    }
  }

  if (matchingTags.length === 0) {
    return state.episodes.sort((a, b) => (episodePlays[a.id] || 0) - (episodePlays[b.id] || 0))[0];
  }

  // Step 3: Find episodes whose first act u