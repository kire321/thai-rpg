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

  // Step 3: Find episodes whose first act uses one of the matching tags
  let candidateEpisodes = [];
  for (const episode of state.episodes) {
    const firstAct = episode.acts?.[0];
    if (firstAct && matchingTags.includes(firstAct.tag)) {
      candidateEpisodes.push(episode);
    }
  }

  if (candidateEpisodes.length === 0) {
    return state.episodes.sort((a, b) => (episodePlays[a.id] || 0) - (episodePlays[b.id] || 0))[0];
  }

  // Step 4: Exclude episodes played today
  candidateEpisodes = candidateEpisodes.filter(ep => !episodesPlayedToday.includes(ep.id));

  if (candidateEpisodes.length === 0) {
    // All candidates played today — fall back to all episodes (excluding played today)
    const fallback = state.episodes.filter(ep => !episodesPlayedToday.includes(ep.id));
    if (fallback.length === 0) return state.episodes[0]; // Everything played today
    fallback.sort((a, b) => (episodePlays[a.id] || 0) - (episodePlays[b.id] || 0));
    return fallback[0];
  }

  // Step 5: Prioritize episodes reviewing the most due cards
  // Step 6: Tiebreak: least-played overall
  candidateEpisodes.sort((a, b) => {
    const dueA = countDueCardsInEpisode(a, state, env);
    const dueB = countDueCardsInEpisode(b, state, env);
    if (dueB !== dueA) return dueB - dueA; // More due cards first
    return (episodePlays[a.id] || 0) - (episodePlays[b.id] || 0); // Least played
  });

  return candidateEpisodes[0];
}

// =====================
// Diagnostic Helpers (shared code paths with episode/card selection)
// =====================

// Returns info about the most overdue card — uses the SAME sorting as
// getNextEpisode and getQuizCardForTag. This ensures the diagnostic
// display is meaningful and consistent with actual behavior.
function getMostOverdueCardInfo(state) {
  const cards = state.cards || [];
  const stats = state.cardStats || {};
  const againQueue = state.againQueue || [];

  if (cards.length === 0) return null;

  // SAME sorting as getNextEpisode — unified code path
  const sortedByDue = [...cards].sort((a, b) => {
    return getCardDueDate(a, stats, againQueue) - getCardDueDate(b, stats, againQueue);
  });
  const card = sortedByDue[0];
  const cardStats = getCardStats(card, stats);

  // Look up tags from state.tags — SAME as getNextEpisode
  const tags = state.tags || {};
  const cardTags = [];
  for (const [tagName, vocabIds] of Object.entries(tags)) {
    if (vocabIds.includes(card.vocabId)) {
      cardTags.push(tagName);
    }
  }

  const dueDate = getCardDueDate(card, stats, againQueue);
  const isNew = !cardStats || cardStats.lastReviewed === null;
  const isAgain = againQueue.includes(card.id);
  const today = state.dateshift || 0; // Approximate for display

  return {
    cardId: card.id,
    vocabId: card.vocabId,
    front: card.front,
    dueDate,
    isNew,
    isAgain,
    tags: cardTags,
  };
}

// Returns info about the next episode — simulates the same state changes
// that onTapNextScenario makes (marking current episode played-today),
// then delegates to getNextEpisode. This ensures the diagnostic display
// matches exactly what fast forward would select.
function getNextEpisodeInfo(state, env) {
  // Simulate the state changes onTapNextScenario makes before selecting
  const simulatedPlayedToday = [...(state.episodesPlayedToday || [])];
  if (state.currentEpisodeId && !simulatedPlayedToday.includes(state.currentEpisodeId)) {
    simulatedPlayedToday.push(state.currentEpisodeId);
  }
  const simulatedState = { ...state, episodesPlayedToday: simulatedPlayedToday };
  const nextEpisode = getNextEpisode(simulatedState, env);
  if (!nextEpisode) return null;

  return {
    episodeId: nextEpisode.id,
    title: nextEpisode.title || nextEpisode.id,
    acts: (nextEpisode.acts || []).map((act, i) => ({
      actIndex: i,
      tag: act.tag,
    })),
  };
}

// Convert a day-since-epoch number to dd/mm format
function dayToDate(dayNum) {
  const ms = dayNum * 86400000;
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// Format a due date for display (e.g. "Due 15/06", "New card", "Due now")
function formatDueDate(dueDate, isNew, isAgain, today) {
  if (isNew) return 'New card';
  if (isAgain) return 'Due now (again)';
  if (dueDate === -Infinity) return 'Due now (again)';
  if (today !== undefined && dueDate <= today) return `Due ${dayToDate(dueDate)}`;
  return `Due ${dayToDate(dueDate)}`;
}

function countUnplayedEpisodes(state) {
  if (!state.episodes) return 0;
  const episodePlays = state.episodePlays || {};
  return state.episodes.filter(e => !episodePlays[e.id]).length;
}

// =====================
// Counter Helpers
// =====================

function calculateCounters(state, env) {
  const today = getEffectiveDay(env, state.dateshift || 0);
  const cards = state.cards || [];
  const stats = state.cardStats || {};
  const againQueue = state.againQueue || [];
  const newCardsPerDay = 10;

  // Use explicit newCardsRatedToday counter instead of heuristic.
  // Reset the counter if it's from a previous day (user opened app
  // on a new day — newCardsRatedTodayDay tracks which day it was set).
  const newCardsDay = state.newCardsRatedTodayDay;
  const newToday = (newCardsDay === today) ? (state.newCardsRatedToday || 0) : 0;

  let due = 0;
  let done = 0;
  let left = 0;

  for (const card of cards) {
    const cardStats = getCardStats(card, stats);
    const isInAgainQueue = againQueue.includes(card.id);

    if (isInAgainQueue) {
      due++;
      continue;
    }

    if (!cardStats || cardStats.repetitions === 0) {
      left++;
      continue;
    }
    const dueDate = getDueDate(cardStats);
    if (dueDate !== null) {
      if (dueDate <= today) due++;
      else done++;
    }
  }

  return {
    done,
    due,
    new: Math.max(0, newCardsPerDay - newToday),
    left,
    again: againQueue.length,
    episodesUnplayed: countUnplayedEpisodes(state),
  };
}

function getCurrentCard(state, env) {
  const cards = state.cards || [];
  if (cards.length === 0) return null;
  const today = getEffectiveDay(env, state.dateshift || 0);
  const stats = state.cardStats || {};
  const againQueue = state.againQueue || [];
  const againDelayCounter = state.againDelayCounter || 0;

  if (againQueue.length > 0 && againDelayCounter <= 0) {
    const nextAgainCardId = againQueue[0];
    const againCard = cards.find(c => c.id === nextAgainCardId);
    if (againCard) return againCard;
  }

  const dueCards = cards.filter(card => {
    const cardStats = getCardStats(card, stats);
    const isInAgainQueue = againQueue.includes(card.id);
    if (isInAgainQueue) return false;
    return isCardDue(cardStats, today, false);
  });

  if (dueCards.length === 0) {
    if (againQueue.length > 0) {
      return cards.find(c => c.id === againQueue[0]) || null;
    }
    return null;
  }

  // Shuffle due cards for random direction each time
  const shuffledDue = shuffleArray(dueCards);
  const index = state.currentCardIndex || 0;
  return shuffledDue[index % shuffledDue.length];
}

// =====================
// getProps
// =====================

function getProps(state, env) {
  state = state || {};
  const counters = calculateCounters(state, env);
  const currentCard = getCurrentCard(state, env);
  const currentLine = getCurrentLine(state);
  const currentAct = getCurrentAct(state);
  const currentEpisode = getCurrentEpisode(state);
  const currentCharacter = getCurrentCharacter(state);
  const currentPlace = getCurrentPlace(state);
  const cardStats = currentCard ? getCardStats(currentCard, state.cardStats || {}) : null;
  const dueDate = cardStats ? getDueDate(cardStats) : null;
  const schedulePreview = getSchedulePreview(cardStats || { repetitions: 0, interval: 0, ef: 2.5 });
  const showVocabReview = state.currentView === 'episode' && state.actPhase === 'vocab_review';
  // FRONT/BACK MISMATCH FIX: If a card ID is locked for vocab review, use that
  // card directly instead of re-computing on every render. The card is picked
  // once when entering vocab_review and only changes after rating.
  let quizCard;
  if (showVocabReview && state.vocabReviewCardId) {
    quizCard = (state.cards || []).find(c => c.id === state.vocabReviewCardId) || null;
    // If the locked card is no longer available (edge case), fall back to computed
    if (!quizCard) quizCard = getQuizCardForTag(state, env);
  } else {
    quizCard = showVocabReview ? getQuizCardForTag(state, env) : currentCard;
  }
  const quizCardStats = quizCard ? getCardStats(quizCard, state.cardStats || {}) : null;
  // In vocab review, Again shows the delay count (cards until re-review), not SM-2 interval
  const isVocabReview = state.currentView === 'episode' && state.actPhase === 'vocab_review';
  const againDelay = isVocabReview ? Math.max(2, state.againDelayCounter || 0) : null;
  const quizSchedulePreview = getSchedulePreview(quizCardStats || { repetitions: 0, interval: 0, ef: 2.5 }, againDelay);

  return {
    // Header
    pageTitle: 'Thai RPG',
    showGearIcon: true,
    
    // Counters
    doneCount: counters.done,
    dueCount: counters.due,
    newCount: counters.new,
    leftCount: counters.left,
    againCount: counters.again,
    episodesUnplayed: counters.episodesUnplayed,
    dateshift: state.dateshift || 0,
    showDateshift: (state.dateshift || 0) !== 0,

    // Settings
    isSettingsOpen: state.isSettingsOpen || false,
    showResetConfirm: state.showResetConfirm || false,

    // Episode
    currentView: state.currentView || 'welcome',
    currentEpisode: currentEpisode,
    currentAct: currentAct,
    currentLine: currentLine,
    currentCharacter: currentCharacter,
    currentPlace: currentPlace,
    actPhase: state.actPhase || 'lines_before',
    showVocabReview: showVocabReview,
    currentDecision: state.actPhase === 'choice' && currentAct ? currentAct.decision : null,
    isNarrator: currentLine && !currentLine.character,
    episodePlays: state.episodePlays || {},
    
    // Episode outcome
    outcomePassed: state.outcomePassed,
    outcomeDelta: state.outcomeDelta,
    outcomeSubplot: state.outcomeSubplot,

    // Toast notification
    toast: state.toast || null,
    
    // Quiz (for vocab review in episodes)
    currentCard: quizCard,
    showingAnswer: state.showingAnswer || false,
    quizMode: state.currentView === 'quiz' || (state.currentView === 'episode' && state.actPhase === 'vocab_review'),
    dueDate: showVocabReview && quizCardStats ? getDueDate(quizCardStats) : (dueDate !== null ? dueDate - getEffectiveDay(env, state.dateshift || 0) : null),
    showPhonetics: state.showingAnswer === true,
    cardStats: quizCardStats,
    schedulePreview: quizSchedulePreview,
    againQueue: state.againQueue || [],

    // Diagnostic: act tag + due date displayed on quiz card
    // Look up human-readable tag name from tagMeta, fall back to raw tag ID
    currentActTag: (state.tagMeta?.[currentAct?.tag]?.name) || currentAct?.tag || null,
    quizCardDueDate: quizCard
      ? formatDueDate(
          getCardDueDate(quizCard, state.cardStats || {}, state.againQueue || []),
          !quizCardStats || quizCardStats.lastReviewed === null,
          (state.againQueue || []).includes(quizCard.id),
          getEffectiveDay(env, state.dateshift || 0)
        )
      : null,

    // Episode Selection Diagnostics (shared code paths)
    mostOverdueCardInfo: getMostOverdueCardInfo(state),
    nextEpisodeInfo: getNextEpisodeInfo(state, env),

    // Footer
    subplotScores: state.subplotScores || {},
    subplots: state.subplots || {},
  };
}

// =====================
// Quiz card for tag (vocab review)
// =====================

function getQuizCardForTag(state, env) {
  const act = getCurrentAct(state);
  if (!act || !act.tag) return getCurrentCard(state, env);
  
  const cards = state.cards || [];
  const stats = state.cardStats || {};
  const today = getEffectiveDay(env, state.dateshift || 0);
  const tagVocabIds = (state.tags || {})[act.tag] || [];
  const againQueue = state.againQueue || [];
  const againDelayCounter = state.againDelayCounter || 0;
  
  // Collect vocabIds that are "locked" because their card is in the againQueue
  const lockedVocabIds = new Set();
  for (const againCardId of againQueue) {
    const againCard = cards.find(c => c.id === againCardId);
    if (againCard) lockedVocabIds.add(againCard.vocabId);
  }
  
  const tagCards = cards.filter(c => tagVocabIds.includes(c.vocabId));
  if (tagCards.length === 0) return getCurrentCard(state, env);
  
  // AGAIN cards always come first in episode quizzes.
  // The episode was specifically selected (via getNextEpisode) because its
  // first act's tag matches the most overdue card. Bypass the delay counter
  // — the narrative flow between lines_after → choice → outcome → next act
  // provides natural spacing, and the user expects to review the due card.
  if (againQueue.length > 0) {
    for (const againCardId of againQueue) {
      const againCard = tagCards.find(c => c.id === againCardId);
      if (againCard) return againCard;
    }
  }

  // Filter out: (a) cards in againQueue while delayed, (b) partner cards with same vocabId
  const availableTagCards = tagCards.filter(card => {
    if (againQueue.includes(card.id) && againDelayCounter > 0) return false;
    if (lockedVocabIds.has(card.vocabId)) return false;
    return true;
  });
  
  // UNIFIED CARD SELECTION (tag-scoped):
  // 1. Reviewed due cards for THIS tag
  // 2. New cards for this tag
  //
  // NOTE: Episode selection (getNextEpisode) handles the global
  // "which episode has due cards" decision. Card selection within
  // an episode is tag-scoped because each act teaches specific
  // vocabulary. The episode selection ensures we pick an episode
  // whose first act's tag points to the most overdue card.

  // 1. Reviewed due cards for THIS tag
  const reviewedDueCards = availableTagCards.filter(card => {
    const cardStats = getCardStats(card, stats);
    if (!cardStats || cardStats.lastReviewed === null) return false;
    return isCardDue(cardStats, today, false);
  }).sort((a, b) => {
    return getCardDueDate(a, stats, againQueue) - getCardDueDate(b, stats, againQueue);
  });

  if (reviewedDueCards.length > 0) return reviewedDueCards[0];

  // 2. No due cards for this tag — try new cards
  const newCards = availableTagCards.filter(card => {
    const cardStats = getCardStats(card, stats);
    return !cardStats || cardStats.lastReviewed === null;
  });

  if (newCards.length > 0) return newCards[0];

  // FALLBACK: If no cards are available because the delay counter has locked
  // all of them (including partner cards for the same vocabId), bypass the
  // delay and show the again card. This happens when an episode was specifically
  // selected (via getNextEpisode) because its first act's tag matches the
  // most overdue card — we must show that card.
  if (againQueue.length > 0) {
    for (const againCardId of againQueue) {
      const againCard = tagCards.find(c => c.id === againCardId);
      if (againCard) return againCard;
    }
  }

  // Nothing available for this tag
  return null;
}

// =====================
// Handlers
// =====================

const Handlers = {
  onTapNext: (state, env) => {
    const nextIndex = (state.pageIndex || 0) + 1;
    const views = ['welcome', 'quiz'];
    return { pageIndex: nextIndex, currentView: views[nextIndex % views.length] || 'quiz' };
  },

  onTapGear: (state, env) => ({ isSettingsOpen: true }),
  onCloseSettings: (state, env) => ({ isSettingsOpen: false }),
  onSwipeDownSettings: (state, env) => ({ isSettingsOpen: false }),

  onLoadContent: (state, env) => {
    const vocabItems = state.cachedContent || (env.loadContent ? env.loadContent() : (env.content.vocabItems || []));
    const cards = generateCards(vocabItems);
    const cardStats = state.cardStats ? mergeStats(state.cardStats, cards) : {};
    return { vocabItems, cards, cardStats, currentView: state.currentView || 'welcome', currentCardIndex: state.currentCardIndex || 0 };
  },

  onCheckForNewContent: (state, env) => {
    if (env.checkForUpdates) env.checkForUpdates();
    const newItems = env.newContent || (env.loadContent ? env.loadContent() : []);
    const oldStats = state.cardStats || {};
    const cards = generateCards(newItems);
    const cardStats = mergeStats(oldStats, cards);
    return { vocabItems: newItems, cards, cardStats };
  },

  onLoadEpisodes: (state, env) => {
    const episodes = env.content.episodes || [];
    const characters = env.content.characters || {};
    const places = env.content.places || {};
    const subplots = env.content.subplots || {};
    const tags = env.content.tags || {};
    return { episodes, characters, places, subplots, tags };
  },

  onStartEpisode: (state, env) => {
    const nextEpisode = getNextEpisode(state, env);
    if (!nextEpisode) {
      // No episodes available - show welcome with error
      return { currentView: 'welcome', debugMessage: 'No episodes found' };
    }
    return {
      currentView: 'episode',
      currentEpisodeId: nextEpisode.id,
      currentActIndex: 0,
      currentLineIndex: 0,
      actPhase: 'lines_before',
      showingAnswer: false,
    };
  },

  onTapNextScenario: (state, env) => {
    // Record play count for current episode before skipping
    const episodePlays = { ...(state.episodePlays || {}) };
    const episodesPlayedToday = [...(state.episodesPlayedToday || [])];
    if (state.currentEpisodeId) {
      episodePlays[state.currentEpisodeId] = (episodePlays[state.currentEpisodeId] || 0) + 1;
      // Mark current episode as played today so we don't immediately re-select it
      if (!episodesPlayedToday.includes(state.currentEpisodeId)) {
        episodesPlayedToday.push(state.currentEpisodeId);
      }
    }
    // Use the same episode selection logic as onStartEpisode
    const stateWithPlays = { ...state, episodePlays, episodesPlayedToday };
    const nextEpisode = getNextEpisode(stateWithPlays, env);
    if (!nextEpisode) {
      return { currentView: 'welcome', episodePlays, episodesPlayedToday, debugMessage: 'No episodes found' };
    }
    return {
      currentView: 'episode',
      currentEpisodeId: nextEpisode.id,
      currentActIndex: 0,
      currentLineIndex: 0,
      actPhase: 'lines_before',
      showingAnswer: false,
      episodePlays,
      episodesPlayedToday,
      vocabReviewCardId: null,
    };
  },

  onTapNextLine: (state, env) => {
    const act = getCurrentAct(state);
    if (!act) return {};
    const phase = state.actPhase || 'lines_before';
    const index = (state.currentLineIndex || 0) + 1;
    
    if (phase === 'lines_before') {
      if (index < act.lines_before.length) {
        return { currentLineIndex: index };
      }
      // Lines before done → vocab review (or skip if overpressure)
      // OVERPRESSURE VALVE: When Due > New, only review due cards.
      // If this act's tag has no due cards, skip the quiz with a toast.
      const counters = calculateCounters(state, env);
      const isOverpressure = counters.due > counters.new;
      if (isOverpressure) {
        const actTag = act.tag;
        const tagVocabIds = (state.tags || {})[actTag] || [];
        const stats = state.cardStats || {};
        const againQueue = state.againQueue || [];
        const today = getEffectiveDay(env, state.dateshift || 0);
        let hasDueCardsForTag = false;
        for (const card of state.cards || []) {
          if (!tagVocabIds.includes(card.vocabId)) continue;
          const s = getCardStats(card, stats);
          if (againQueue.includes(card.id) || (s && s.lastReviewed !== null && (s.lastReviewed + (s.interval || 0)) <= today)) {
            hasDueCardsForTag = true;
            break;
          }
        }
        if (!hasDueCardsForTag) {
          // Skip vocab review — no due cards for this tag while overpressure
          return {
            actPhase: 'lines_after',
            currentLineIndex: 0,
            toast: `Skipping quiz — ${counters.due} due cards to review first`,
          };
        }
      }
      // Pick and LOCK a card for this vocab review session.
      // This prevents front/back mismatch: the card stays the same
      // across re-renders until rated.
      const quizCard = getQuizCardForTag(state, env);
      return {
        actPhase: 'vocab_review',
        currentLineIndex: 0,
        showingAnswer: false,
        vocabReviewCardId: quizCard ? quizCard.id : null,
      };
    }
    
    if (phase === 'lines_after') {
      if (index < act.lines_after.length) {
        return { currentLineIndex: index };
      }
      // Lines after done → choice
      return { actPhase: 'choice', currentLineIndex: 0 };
    }
    
    return {};
  },

  onTapChoice: (state, env, choiceIndex) => {
    const act = getCurrentAct(state);
    if (!act || !act.decision || !act.decision.choices[choiceIndex]) return {};
    const choice = act.decision.choices[choiceIndex];
    // SKILL CHECK: success chance based on choice difficulty + subplot skill.
    // Base rates: easy=85%, medium=60%, hard=35%.
    // Subplot score adds up to +15% bonus (capped at 95%).
    let diff = choice.difficulty !== undefined ? choice.difficulty : Math.min(choiceIndex, 2);
    // Guard: diff must be 0, 1, or 2
    if (typeof diff !== 'number' || isNaN(diff) || diff < 0 || diff > 2) diff = 1;
    const baseRates = [0.85, 0.6, 0.35];
    const subplotKey = choice.pass_outcome?.subplot;
    const rawScore = subplotKey != null ? (state.subplotScores?.[subplotKey] || 0) : 0;
    const skillBonus = Math.min(0.15, rawScore * 0.01);
    const successRate = Math.min(0.95, baseRates[diff] + skillBonus);
    // Use Math.random() for skill check — properly random in browsers.
    const globalChoiceCounter = (state._choiceCounter || 0) + 1;
    const roll = Math.random();
    const passed = roll < successRate;
    const outcome = passed ? choice.pass_outcome : (choice.fail_outcome || choice.pass_outcome);
    if (!outcome) return {};

    // Update subplot score
    const scores = { ...(state.subplotScores || {}) };
    scores[outcome.subplot] = (scores[outcome.subplot] || 0) + outcome.delta;
    
    // Extract dialogue from outcome line (CMS stores lines as objects with .dialogue)
    const outcomeText = typeof outcome.line === 'string'
      ? outcome.line
      : (outcome.line?.dialogue || JSON.stringify(outcome.line));
    return {
      actPhase: 'outcome',
      outcomeLine: outcomeText,
      outcomePassed: passed,
      outcomeDelta: outcome.delta,
      outcomeSubplot: outcome.subplot,
      subplotScores: scores,
      showingAnswer: false,
      _choiceCounter: globalChoiceCounter,
    };
  },

  onOutcomeDone: (state, env) => {
    const act = getCurrentAct(state);
    if (!act) return {};

    // Update episode play count
    const episodePlays = { ...(state.episodePlays || {}) };
    const episodesPlayedToday = [...(state.episodesPlayedToday || [])];
    episodePlays[state.currentEpisodeId] = (episodePlays[state.currentEpisodeId] || 0) + 1;

 // Mark as played today when episode completes (last act)
    const episode = getCurrentEpisode(state);
    const nextActIndex = (state.currentActIndex || 0) + 1;

    if (episode && nextActIndex < episode.acts.length) {
      // More acts — go to next act (not fully played yet)
      return {
        currentActIndex: nextActIndex,
        currentLineIndex: 0,
        actPhase: 'lines_before',
        episodePlays,
        showingAnswer: false,
      };
    }

    // Episode complete — mark as played today
    if (!episodesPlayedToday.includes(state.currentEpisodeId)) {
      episodesPlayedToday.push(state.currentEpisodeId);
    }

    return {
      currentView: 'welcome',
      episodePlays,
      episodesPlayedToday,
      actPhase: 'lines_before',
      currentLineIndex: 0,
      showingAnswer: false,
    };
  },

  onChoiceOutcome: (state, env, subplotId, delta) => {
    const scores = { ...(state.subplotScores || {}) };
    scores[subplotId] = (scores[subplotId] || 0) + delta;
    return { subplotScores: scores };
  },

  onVocabReviewDone: (state, env) => {
    // Vocab review complete → go to lines_after
    return { actPhase: 'lines_after', currentLineIndex: 0, showingAnswer: false, vocabReviewCardId: null };
  },

  onShowAnswer: (state, env) => {
    // Use the LOCKED card for speech to avoid front/back mismatch.
    // The locked card (vocabReviewCardId) is the same one displayed.
    const currentCard = state.vocabReviewCardId
      ? (state.cards || []).find(c => c.id === state.vocabReviewCardId)
      : getQuizCardForTag(state, env) || getCurrentCard(state, env);
    if (currentCard && env.speakThai) {
      if (currentCard.direction === 'thai-eng') {
        if (isThaiText(currentCard.front)) env.speakThai(currentCard.front);
      } else if (currentCard.direction === 'eng-thai') {
        if (isThaiText(currentCard.back)) env.speakThai(currentCard.back);
      }
    }
    return { showingAnswer: true };
  },

  onShowCard: (state, env) => {
    const currentCard = getQuizCardForTag(state, env) || getCurrentCard(state, env);
    if (currentCard && env.speakThai && currentCard.direction === 'thai-eng') {
      const textToSpeak = currentCard.front;
      if (isThaiText(textToSpeak)) env.speakThai(textToSpeak);
    }
    return { showingAnswer: false };
  },

  onSpeakCard: (state, env) => {
    // Replay Thai pronunciation for the current card.
    // thai-eng: Thai is on front. eng-thai: Thai is on back.
    const currentCard = state.vocabReviewCardId
      ? (state.cards || []).find(c => c.id === state.vocabReviewCardId)
      : getQuizCardForTag(state, env) || getCurrentCard(state, env);
    if (!currentCard || !env.speakThai) return {};
    const textToSpeak = currentCard.direction === 'thai-eng'
      ? currentCard.front
      : currentCard.back;
    if (isThaiText(textToSpeak)) env.speakThai(textToSpeak);
    return {};
  },

  onChangeCmsBase: (state, env, newUrl) => {
    return { cmsBaseUrl: newUrl };
  },

  onClearToast: (state) => {
    return { toast: null };
  },

  onRateCard: (state, env, cardId, quality) => {
    const stats = state.cardStats || {};
    const againQueue = state.againQueue || [];
    const cardStats = stats[cardId] || { repetitions: 0, interval: 0, ef: 2.5, lastReviewed: null };

    const result = sm2Schedule(quality, cardStats.repetitions, cardStats.interval, cardStats.ef);
    const today = getEffectiveDay(env, state.dateshift || 0);

    const newCardStats = {
      repetitions: result.repetitions,
      interval: result.interval,
      ef: result.ef,
      lastReviewed: today,
      failedToday: false,
    };

    const newAgainQueue = [...againQueue];
    let againDelayCounter = state.againDelayCounter || 0;

    if (quality < 3) {
      newCardStats.failedToday = true;
      if (!newAgainQueue.includes(cardId)) newAgainQueue.push(cardId);
      againDelayCounter = Math.max(againDelayCounter, 2);
    } else {
      const idx = newAgainQueue.indexOf(cardId);
      if (idx > -1) newAgainQueue.splice(idx, 1);
    }

    const showedFreshCard = quality >= 3 && againDelayCounter > 0;
    if (showedFreshCard) againDelayCounter = Math.max(0, againDelayCounter - 1);

    const newStats = { ...stats, [cardId]: newCardStats };
    const currentCardIndex = (state.currentCardIndex || 0) + 1;

    // A card is "new" ONLY if it has never been reviewed before
    // (lastReviewed === null). Once a card leaves the New pile, it
    // never goes back. Rating a due card (already reviewed) should
    // NEVER affect the New counter — only moving a card from New
    // to another pile decrements the counter.
    const isNewCard = cardStats.lastReviewed === null;
    // Reset newCardsRatedToday if it's from a previous day
    const newCardsDay = state.newCardsRatedTodayDay;
    const currentNewCardsToday = (newCardsDay === today) ? (state.newCardsRatedToday || 0) : 0;
    const newCardsRatedToday = currentNewCardsToday + (isNewCard ? 1 : 0);

    // If in vocab_review, rating any card moves us to lines_after (continue narrative)
    const isVocabReview = state.currentView === 'episode' && state.actPhase === 'vocab_review';
    if (isVocabReview) {
      return {
        cardStats: newStats,
        showingAnswer: false,
        currentCardIndex,
        againQueue: newAgainQueue,
        againDelayCounter,
        newCardsRatedToday,
        newCardsRatedTodayDay: today,
        actPhase: 'lines_after',
        currentLineIndex: 0,
        vocabReviewCardId: null, // clear locked card
      };
    }

    return { cardStats: newStats, showingAnswer: false, currentCardIndex, againQueue: newAgainQueue, againDelayCounter, newCardsRatedToday, newCardsRatedTodayDay: today };
  },

  onIncrementDateshift: (state, env) => ({
    dateshift: (state.dateshift || 0) + 1,
    // New day — clear episodes played today so they can be re-selected
    episodesPlayedToday: [],
    // New day — reset new card counter
    newCardsRatedToday: 0,
    newCardsRatedTodayDay: getEffectiveDay(env, (state.dateshift || 0) + 1),
  }),
  onDecrementDateshift: (state, env) => ({ dateshift: Math.max(0, (state.dateshift || 0) - 1) }),

  onCheckForUpdates: (state, env) => {
    if (env.checkForUpdates) env.checkForUpdates();
    return {};
  },

  onExportState: (state, env) => {
    const timestamp = env.time ? env.time.getTimestamp() : Date.now();
    const filename = `state-${timestamp}.md`;
    const content = JSON.stringify(state, null, 2);
    if (env.downloadFile) env.downloadFile(filename, content);
    return {};
  },

  onImportState: (state, env, fileContent) => {
    try { return { ...JSON.parse(fileContent) }; } catch (e) { return {}; }
  },

  onTapResetState: (state, env) => ({ showResetConfirm: true }),
  onCancelReset: (state, env) => ({ showResetConfirm: false }),
  
  onConfirmReset: (state, env) => ({
    cardStats: {},
    againQueue: [],
    againDelayCounter: 0,
    currentCardIndex: 0,
    showingAnswer: false,
    currentView: 'welcome',
    showResetConfirm: false,
  }),
};

export { getProps, Handlers, sm2Schedule, generateCards, shuffleArray, mergeStats, getMostOverdueCardInfo, getNextEpisodeInfo, formatDueDate, getCardDueDate, getNextEpisode, getQuizCardForTag, countDueCardsInEpisode, normalizeLine };
