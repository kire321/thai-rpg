// controller.js - All business logic for Thai RPG PWA
// Export getProps and Handlers for ESM imports

export { getProps, Handlers };

// =====================
// SM-2 Algorithm Helpers
// =====================

function sm2Schedule(quality, repetitions, interval, ef) {
  let newInterval, newRepetitions, newEF;
  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1;
    newEF = ef;
  } else {
    newRepetitions = repetitions + 1;
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 6;
    else newInterval = Math.ceil(interval * ef);
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
  return {
    again: againDelay !== undefined ? againDelay : againResult.interval,
    againIsDelay: againDelay !== undefined,
    hard: hardResult.interval,
    good: goodResult.interval,
    easy: easyResult.interval,
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
// Counter Helpers
// =====================

function calculateCounters(state, env) {
  const today = getEffectiveDay(env, state.dateshift || 0);
  const cards = state.cards || [];
  const stats = state.cardStats || {};
  const againQueue = state.againQueue || [];

  let due = 0, done = 0, left = 0, newToday = 0;
  for (const card of cards) {
    const cardStats = getCardStats(card, stats);
    const isInAgainQueue = againQueue.includes(card.id);
    if (!cardStats || cardStats.repetitions === 0) { left++; continue; }
    if (cardStats.lastReviewed === today) newToday++;
    const dueDate = getDueDate(cardStats);
    if (dueDate !== null && (dueDate <= today || isInAgainQueue)) due++;
    else done++;
  }
  return { done, due, new: Math.max(0, 10 - newToday), left, again: againQueue.length };
}

// =====================
// Episode / Act Helpers
// =====================

function getCurrentEpisode(state) {
  const episodes = state.episodes || [];
  return episodes.find(e => e.id === state.currentEpisodeId) || null;
}

function getTotalVirtualActs(episode) {
  if (!episode || !episode.acts) return 0;
  let count = 0;
  for (const act of episode.acts) {
    const segments = (act.lines_before || []).filter(l => l.stage_directions && l.stage_directions.includes('SEGMENT_BOUNDARY')).length;
    count += Math.max(1, segments + 1);
  }
  return count;
}

function getVirtualActIndex(episode, actIndex, lineIndex) {
  if (!episode || !episode.acts) return 0;
  let virtualIndex = 0;
  for (let a = 0; a < Math.min(actIndex, episode.acts.length); a++) {
    const act = episode.acts[a];
    const segments = (act.lines_before || []).filter(l => l.stage_directions && l.stage_directions.includes('SEGMENT_BOUNDARY')).length;
    virtualIndex += Math.max(1, segments + 1);
  }
  if (actIndex < episode.acts.length) {
    const act = episode.acts[actIndex];
    const lines = act.lines_before || [];
    let segmentCount = 0;
    for (let i = 0; i < Math.min(lineIndex, lines.length); i++) {
      if (lines[i].stage_directions && lines[i].stage_directions.includes('SEGMENT_BOUNDARY')) segmentCount++;
    }
    virtualIndex += segmentCount;
  }
  return virtualIndex;
}

function getCurrentLine(state) {
  const act = getCurrentAct(state);
  if (!act) return null;
  const phase = state.actPhase || 'lines_before';
  const index = state.currentLineIndex || 0;
  let line = null;
  if (phase === 'lines_before') {
    if (index < (act.lines_before || []).length) line = act.lines_before[index];
  } else if (phase === 'lines_after') {
    if (index < (act.lines_after || []).length) line = act.lines_after[index];
  }
  return line;
}

function getCurrentAct(state) {
  const episode = getCurrentEpisode(state);
  if (!episode || !episode.acts) return null;
  const actIndex = state.currentActIndex || 0;
  return episode.acts[actIndex] || null;
}

function normalizeLine(line) {
  if (!line) return line;
  const normalized = { ...line };
  const sd = normalized.stage_directions;
  if (sd === null || sd === undefined) normalized.stage_directions = [];
  else if (typeof sd === 'string') normalized.stage_directions = sd.trim() ? [sd] : [];
  else if (!Array.isArray(sd)) normalized.stage_directions = [];
  if (!normalized.dialogue) normalized.dialogue = '';
  return normalized;
}

function getActTags(act) {
  if (!act) return [];
  if (act.tag) return [act.tag];
  if (act.tags && Array.isArray(act.tags)) return act.tags;
  return [];
}

function getQuizCardForTag(state, env) {
  const act = getCurrentAct(state);
  if (!act) return null;
  const allTagVocabIds = [];
  for (const tag of getActTags(act)) {
    allTagVocabIds.push(...((state.tags || {})[tag] || []));
  }
  const tagVocabIdsSet = new Set(allTagVocabIds);
  const cards = state.cards || [];
  const stats = state.cardStats || {};
  const againQueue = state.againQueue || [];
  const today = getEffectiveDay(env, state.dateshift || 0);

  // 1. Check again queue first
  for (const cardId of againQueue) {
    const card = cards.find(c => c.id === cardId && tagVocabIdsSet.has(c.vocabId));
    if (card) return card;
  }
  // 2. Check due cards
  const dueCards = cards.filter(c => {
    if (!tagVocabIdsSet.has(c.vocabId)) return false;
    const s = getCardStats(c, stats);
    if (!s || s.repetitions === 0) return false;
    return (s.lastReviewed + (s.interval || 0)) <= today;
  });
  if (dueCards.length > 0) return dueCards[0];
  // 3. Check new cards
  const newCards = cards.filter(c => {
    if (!tagVocabIdsSet.has(c.vocabId)) return false;
    const s = getCardStats(c, stats);
    return !s || s.repetitions === 0;
  });
  if (newCards.length > 0) return newCards[0];
  // 4. Any card from tag
  const tagCards = cards.filter(c => tagVocabIdsSet.has(c.vocabId));
  return tagCards[0] || null;
}

function getCardDueDate(card, stats, againQueue) {
  const s = getCardStats(card, stats);
  if (!s) return 'New card';
  if (s.repetitions === 0 && !s.lastReviewed) return 'New card';
  if (againQueue.includes(card.id)) return 'Due now (again)';
  const due = (s.lastReviewed || 0) + (s.interval || 0);
  return `Day ${due}`;
}

// =====================
// Episode Selection
// =====================

function getNextEpisode(state, env) {
  const episodes = state.episodes || [];
  if (episodes.length === 0) return null;
  const today = getEffectiveDay(env, state.dateshift || 0);
  const stats = state.cardStats || {};
  const againQueue = state.againQueue || [];
  const cards = state.cards || [];
  const tags = state.tags || {};
  const episodesPlayedToday = state.episodesPlayedToday || [];

  // Find most overdue card
  let mostOverdueCard = null;
  let mostOverdueScore = -Infinity;
  for (const card of cards) {
    const s = getCardStats(card, stats);
    let score = 0;
    if (againQueue.includes(card.id)) score = 1000000;
    else if (!s || s.repetitions === 0) score = -1;
    else score = today - ((s.lastReviewed || 0) + (s.interval || 0));
    if (score > mostOverdueScore) { mostOverdueScore = score; mostOverdueCard = card; }
  }

  // Get tags for most overdue card
  const overdueVocabId = mostOverdueCard?.vocabId;
  const overdueTags = [];
  for (const [tagId, vocabIds] of Object.entries(tags)) {
    if (vocabIds.includes(overdueVocabId)) overdueTags.push(tagId);
  }

  // Find episodes with those tags in first act, excluding played today
  let candidates = episodes.filter(ep => {
    if (episodesPlayedToday.includes(ep.id)) return false;
    if (!ep.acts || ep.acts.length === 0) return false;
    const firstActTags = getActTags(ep.acts[0]);
    return firstActTags.some(t => overdueTags.includes(t));
  });

  if (candidates.length === 0) {
    candidates = episodes.filter(ep => !episodesPlayedToday.includes(ep.id));
  }
  if (candidates.length === 0) return episodes[0];

  // Prioritize by due card count
  candidates.sort((a, b) => {
    const countDue = (ep) => {
      let count = 0;
      for (const act of (ep.acts || [])) {
        for (const tag of getActTags(act)) {
          for (const vocabId of (tags[tag] || [])) {
            const card = cards.find(c => c.vocabId === vocabId);
            if (!card) continue;
            const s = getCardStats(card, stats);
            if (againQueue.includes(card.id)) count += 100;
            else if (s && s.lastReviewed !== null && (s.lastReviewed + (s.interval || 0)) <= today) count++;
          }
        }
      }
      return count;
    };
    return countDue(b) - countDue(a);
  });

  return candidates[0];
}

// =====================
// getProps
// =====================

function getProps(state, env) {
  state = state || {};
  const counters = calculateCounters(state, env);
  const currentCard = getCurrentCard(state, env);
  const today = getEffectiveDay(env, state.dateshift || 0);
  const cardStats = currentCard ? getCardStats(currentCard, state.cardStats || {}) : null;
  const dueDate = cardStats ? getDueDate(cardStats) : null;
  const schedulePreview = getSchedulePreview(cardStats || { repetitions: 0, interval: 0, ef: 2.5 });

  // Episode flow
  const act = getCurrentAct(state);
  const line = getCurrentLine(state);
  const showVocabReview = state.currentView === 'episode' && state.actPhase === 'vocab_review';

  let quizCard = currentCard;
  if (showVocabReview && state.vocabReviewCardId) {
    quizCard = (state.cards || []).find(c => c.id === state.vocabReviewCardId) || null;
    if (!quizCard) quizCard = getQuizCardForTag(state, env);
  } else if (showVocabReview) {
    quizCard = getQuizCardForTag(state, env);
  }

  const quizCardStats = quizCard ? getCardStats(quizCard, state.cardStats || {}) : null;
  const isVocabReview = state.currentView === 'episode' && state.actPhase === 'vocab_review';
  const againDelay = isVocabReview ? Math.max(2, state.againDelayCounter || 0) : null;
  const quizSchedulePreview = getSchedulePreview(quizCardStats || { repetitions: 0, interval: 0, ef: 2.5 }, againDelay);

  const characters = state.characters || {};
  const places = state.places || {};
  let currentCharacter = null;
  let currentPlace = null;
  if (line && line.character && !line.character.startsWith('char_narrator')) {
    currentCharacter = characters[line.character] || null;
  }
  if (line && line.place) {
    currentPlace = places[line.place] || null;
  }

  // Episode selection info
  const nextEpisode = getNextEpisode(state, env);
  const mostOverdueCard = (() => {
    const cards = state.cards || [];
    const stats = state.cardStats || {};
    const againQueue = state.againQueue || [];
    let best = null;
    let bestScore = -Infinity;
    for (const card of cards) {
      const s = getCardStats(card, stats);
      let score = 0;
      if (againQueue.includes(card.id)) score = 1000000;
      else if (!s || s.repetitions === 0) score = -1;
      else score = today - ((s.lastReviewed || 0) + (s.interval || 0));
      if (score > bestScore) { bestScore = score; best = card; }
    }
    return best;
  })();

  const mostOverdueCardInfo = mostOverdueCard ? {
    front: mostOverdueCard.front,
    isAgain: (state.againQueue || []).includes(mostOverdueCard.id),
    isNew: !(state.cardStats || {})[mostOverdueCard.id]?.lastReviewed,
    dueDate: getCardDueDate(mostOverdueCard, state.cardStats || {}, state.againQueue || []),
    tags: (() => {
      const tags = [];
      for (const [tagId, vocabIds] of Object.entries(state.tags || {})) {
        if (vocabIds.includes(mostOverdueCard.vocabId)) tags.push(tagId);
      }
      return tags;
    })(),
  } : null;

  const nextEpisodeInfo = nextEpisode ? {
    title: nextEpisode.title,
    acts: (nextEpisode.acts || []).map((act, i) => ({
      actIndex: i,
      tag: (state.tagMeta || {})[getActTags(act)[0]]?.name || getActTags(act)[0] || 'unknown',
    })),
  } : null;

  return {
    showGearIcon: true,
    showNextScenario: state.currentView === 'episode',
    doneCount: counters.done,
    dueCount: counters.due,
    newCount: counters.new,
    leftCount: counters.left,
    episodesUnplayed: (state.episodes || []).length - (state.episodesPlayedToday || []).length,
    dateshift: state.dateshift || 0,
    showDateshift: (state.dateshift || 0) !== 0,
    isSettingsOpen: state.isSettingsOpen || false,
    showResetConfirm: state.showResetConfirm || false,
    currentView: state.currentView || 'welcome',
    currentCard: quizCard,
    currentLine: line,
    currentCharacter,
    currentPlace,
    currentAct: act,
    isNarrator: !line || !line.character || line.character.startsWith('char_narrator'),
    showingAnswer: state.showingAnswer || false,
    schedulePreview: quizSchedulePreview,
    showVocabReview,
    currentDecision: state.actPhase === 'choice' && act ? act.decision : null,
    actPhase: state.actPhase || 'lines_before',
    subplotScores: state.subplotScores || {},
    subplots: state.subplots || {},
    outcomePassed: state.outcomePassed,
    outcomeDelta: state.outcomeDelta,
    outcomeSubplot: state.outcomeSubplot,
    cmsBaseUrl: state.cmsBaseUrl || 'https://q4kgqw3jj72wa.kimi.page',
    toast: state.toast || null,
    debugMessage: state.debugMessage || null,
    currentActTag: (() => {
      const tags = getActTags(act);
      if (tags.length === 0) return null;
      const meta = (state.tagMeta || {})[tags[0]];
      return meta?.name || tags[0];
    })(),
    quizCardDueDate: quizCard ? getCardDueDate(quizCard, state.cardStats || {}, state.againQueue || []) : null,
    mostOverdueCardInfo,
    nextEpisodeInfo,
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
      const nextAgainCardId = againQueue[0];
      return cards.find(c => c.id === nextAgainCardId) || null;
    }
    return null;
  }

  const index = state.currentCardIndex || 0;
  return dueCards[index % dueCards.length];
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
    const cards = generateCards(newItems);
    const cardStats = mergeStats(state.cardStats || {}, cards);
    return { vocabItems: newItems, cards, cardStats };
  },

  onShowAnswer: (state, env) => {
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
    const currentCard = getCurrentCard(state, env);
    if (currentCard && env.speakThai) {
      if (isThaiText(currentCard.front)) env.speakThai(currentCard.front);
    }
    return { showingAnswer: false };
  },

  onRateCard: (state, env, cardId, quality) => {
    const today = getEffectiveDay(env, state.dateshift || 0);
    const stats = state.cardStats || {};
    const againQueue = state.againQueue || [];
    const cardStats = stats[cardId] || { repetitions: 0, interval: 0, ef: 2.5, lastReviewed: null };
    const result = sm2Schedule(quality, cardStats.repetitions, cardStats.interval, cardStats.ef);
    const newCardStats = { repetitions: result.repetitions, interval: result.interval, ef: result.ef, lastReviewed: today, failedToday: false };
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
    if (quality >= 3 && againDelayCounter > 0) againDelayCounter = Math.max(0, againDelayCounter - 1);
    const newStats = { ...stats, [cardId]: newCardStats };
    const currentCardIndex = (state.currentCardIndex || 0) + 1;

    // If in vocab_review, move to lines_after after rating
    const isVocabReview = state.currentView === 'episode' && state.actPhase === 'vocab_review';
    if (isVocabReview) {
      return { cardStats: newStats, showingAnswer: false, currentCardIndex, againQueue: newAgainQueue, againDelayCounter, actPhase: 'lines_after', currentLineIndex: 0, vocabReviewCardId: null };
    }
    return { cardStats: newStats, showingAnswer: false, currentCardIndex, againQueue: newAgainQueue, againDelayCounter };
  },

  onIncrementDateshift: (state, env) => ({ dateshift: (state.dateshift || 0) + 1 }),
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
    cardStats: {}, againQueue: [], againDelayCounter: 0, currentCardIndex: 0,
    showingAnswer: false, currentView: 'welcome', showResetConfirm: false,
  }),

  // Episode flow handlers
  onStartEpisode: (state, env) => {
    const episode = getNextEpisode(state, env);
    if (!episode) return { toast: 'No episodes available' };
    const episodePlays = { ...(state.episodePlays || {}) };
    const episodesPlayedToday = [...(state.episodesPlayedToday || [])];
    return {
      currentView: 'episode',
      currentEpisodeId: episode.id,
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
      if (index < act.lines_before.length) return { currentLineIndex: index };
      // Overpressure valve
      const counters = calculateCounters(state, env);
      const isOverpressure = counters.due > counters.new;
      if (isOverpressure) {
        const actTags = getActTags(act);
        const allTagVocabIds = [];
        for (const tag of actTags) allTagVocabIds.push(...((state.tags || {})[tag] || []));
        const tagVocabIdsSet = new Set(allTagVocabIds);
        const stats = state.cardStats || {};
        const againQueue = state.againQueue || [];
        const today = getEffectiveDay(env, state.dateshift || 0);
        let hasDueCardsForTag = false;
        for (const card of state.cards || []) {
          if (!tagVocabIdsSet.has(card.vocabId)) continue;
          const s = getCardStats(card, stats);
          if (againQueue.includes(card.id) || (s && s.lastReviewed !== null && (s.lastReviewed + (s.interval || 0)) <= today)) { hasDueCardsForTag = true; break; }
        }
        if (!hasDueCardsForTag) return { actPhase: 'lines_after', currentLineIndex: 0, toast: `Skipping quiz — ${counters.due} due cards to review first` };
      }
      const quizCard = getQuizCardForTag(state, env);
      return { actPhase: 'vocab_review', currentLineIndex: 0, showingAnswer: false, vocabReviewCardId: quizCard ? quizCard.id : null };
    }

    if (phase === 'lines_after') {
      if (index < act.lines_after.length) return { currentLineIndex: index };
      if (act.decision && act.decision.choices && act.decision.choices.length > 0) return { actPhase: 'choice', currentLineIndex: 0 };
      const nextActIndex = (state.currentActIndex || 0) + 1;
      const episode = getCurrentEpisode(state);
      if (episode && nextActIndex < (episode.acts || []).length) return { currentActIndex: nextActIndex, currentLineIndex: 0, actPhase: 'lines_before', showingAnswer: false };
      const episodesPlayedToday = [...(state.episodesPlayedToday || [])];
      if (!episodesPlayedToday.includes(state.currentEpisodeId)) episodesPlayedToday.push(state.currentEpisodeId);
      return { currentView: 'welcome', currentActIndex: nextActIndex, currentLineIndex: 0, actPhase: 'lines_before', showingAnswer: false, episodesPlayedToday };
    }

    return {};
  },

  onTapChoice: (state, env, choiceIndex) => {
    const act = getCurrentAct(state);
    if (!act || !act.decision || !act.decision.choices[choiceIndex]) return {};
    const choice = act.decision.choices[choiceIndex];
    const diff = choice.difficulty !== undefined ? choice.difficulty : Math.min(choiceIndex, 2);
    const baseRates = [0.85, 0.6, 0.35];
    const skillBonus = Math.min(0.15, ((state.subplotScores?.[choice.pass_outcome?.subplot]) || 0) * 0.01);
    const successRate = Math.min(0.95, baseRates[diff] + skillBonus);
    const globalChoiceCounter = (state._choiceCounter || 0) + 1;
    const seed = env.time.getTimestamp() + globalChoiceCounter * 137;
    const entropy = Math.abs(Math.sin(seed * 9999)) % 1;
    const passed = entropy < successRate;
    const outcome = passed ? choice.pass_outcome : (choice.fail_outcome || choice.pass_outcome);
    if (!outcome) return {};
    const scores = { ...(state.subplotScores || {}) };
    scores[outcome.subplot] = (scores[outcome.subplot] || 0) + outcome.delta;
    return { actPhase: 'outcome', outcomeLine: outcome.line, outcomePassed: passed, outcomeDelta: outcome.delta, outcomeSubplot: outcome.subplot, subplotScores: scores, showingAnswer: false, _choiceCounter: globalChoiceCounter };
  },

  onOutcomeDone: (state, env) => {
    const act = getCurrentAct(state);
    if (!act) return {};
    const episodePlays = { ...(state.episodePlays || {}) };
    const episodesPlayedToday = [...(state.episodesPlayedToday || [])];
    episodePlays[state.currentEpisodeId] = (episodePlays[state.currentEpisodeId] || 0) + 1;
    const episode = getCurrentEpisode(state);
    const nextActIndex = (state.currentActIndex || 0) + 1;
    if (episode && nextActIndex < (episode.acts || []).length) {
      return { currentActIndex: nextActIndex, currentLineIndex: 0, actPhase: 'lines_before', episodePlays, showingAnswer: false };
    }
    if (!episodesPlayedToday.includes(state.currentEpisodeId)) episodesPlayedToday.push(state.currentEpisodeId);
    return { currentView: 'welcome', episodePlays, episodesPlayedToday, actPhase: 'lines_before', currentLineIndex: 0, showingAnswer: false };
  },

  onVocabReviewDone: (state, env) => {
    return { actPhase: 'lines_after', currentLineIndex: 0, showingAnswer: false, vocabReviewCardId: null };
  },

  onTapNextScenario: (state, env) => {
    const episode = getNextEpisode(state, env);
    if (!episode) return { toast: 'No more episodes' };
    return {
      currentView: 'episode', currentEpisodeId: episode.id, currentActIndex: 0,
      currentLineIndex: 0, actPhase: 'lines_before', showingAnswer: false, vocabReviewCardId: null,
    };
  },

  onSpeakCard: (state, env) => {
    const currentCard = state.vocabReviewCardId
      ? (state.cards || []).find(c => c.id === state.vocabReviewCardId)
      : getCurrentCard(state, env);
    if (currentCard && env.speakThai) {
      const text = state.showingAnswer ? currentCard.back : currentCard.front;
      if (isThaiText(text)) env.speakThai(text);
    }
    return {};
  },

  onClearToast: (state, env) => ({ toast: null }),
  onChangeCmsBase: (state, env, url) => ({ cmsBaseUrl: url }),
};
