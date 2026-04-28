// controller.js - Plain JavaScript, no compilation needed
// Business logic for Thai RPG PWA with SM-2 Spaced Repetition

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
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.ceil(interval * ef);
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

function isFirstAttemptedToday(stats, today) {
  return stats && stats.lastReviewed === today && stats.repetitions <= 1;
}

function isThaiText(text) {
  if (!text) return false;
  return /[\u0E00-\u0E7F]/.test(text);
}

function getSchedulePreview(cardStats) {
  const stats = cardStats || { repetitions: 0, interval: 0, ef: 2.5 };
  const againResult = sm2Schedule(1, stats.repetitions, stats.interval, stats.ef);
  const hardResult = sm2Schedule(3, stats.repetitions, stats.interval, stats.ef);
  const goodResult = sm2Schedule(4, stats.repetitions, stats.interval, stats.ef);
  const easyResult = sm2Schedule(5, stats.repetitions, stats.interval, stats.ef);
  return { again: againResult.interval, hard: hardResult.interval, good: goodResult.interval, easy: easyResult.interval };
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

function getCurrentLine(state) {
  const act = getCurrentAct(state);
  if (!act) return null;
  const phase = state.actPhase || 'lines_before';
  const index = state.currentLineIndex || 0;
  
  if (phase === 'lines_before') {
    if (index < act.lines_before.length) return act.lines_before[index];
    return null;
  }
  if (phase === 'lines_after') {
    if (index < act.lines_after.length) return act.lines_after[index];
    return null;
  }
  if (phase === 'choice') {
    return act.decision.line || null;
  }
  if (phase === 'outcome') {
    return state.outcomeLine || null;
  }
  return null;
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

function getNextEpisode(state) {
  if (!state.episodes || state.episodes.length === 0) return null;
  const episodePlays = state.episodePlays || {};
  
  // Find episodes that have never been played
  const unplayed = state.episodes.filter(e => !episodePlays[e.id]);
  if (unplayed.length > 0) {
    // Return first unplayed episode
    return unplayed[0];
  }
  
  // All episodes have been played, return least played
  return state.episodes.sort((a, b) => (episodePlays[a.id] || 0) - (episodePlays[b.id] || 0))[0];
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

  let due = 0;
  let done = 0;
  let left = 0;
  let newToday = 0;

  for (const card of cards) {
    const cardStats = getCardStats(card, stats);
    const isInAgainQueue = againQueue.includes(card.id);
    if (!cardStats || cardStats.repetitions === 0) {
      left++;
      continue;
    }
    if (isFirstAttemptedToday(cardStats, today)) newToday++;
    const dueDate = getDueDate(cardStats);
    if (dueDate !== null) {
      if (dueDate <= today || isInAgainQueue) due++;
      else done++;
    } else if (isInAgainQueue) {
      due++;
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

  const index = state.currentCardIndex || 0;
  return dueCards[index % dueCards.length];
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
  const quizCard = showVocabReview ? getQuizCardForTag(state, env) : currentCard;
  const quizCardStats = quizCard ? getCardStats(quizCard, state.cardStats || {}) : null;
  const quizSchedulePreview = getSchedulePreview(quizCardStats || { repetitions: 0, interval: 0, ef: 2.5 });

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
    
    // Quiz (for vocab review in episodes)
    currentCard: quizCard,
    showingAnswer: state.showingAnswer || false,
    quizMode: state.currentView === 'quiz' || (state.currentView === 'episode' && state.actPhase === 'vocab_review'),
    dueDate: showVocabReview && quizCardStats ? getDueDate(quizCardStats) : (dueDate !== null ? dueDate - getEffectiveDay(env, state.dateshift || 0) : null),
    showPhonetics: state.showingAnswer === true,
    cardStats: quizCardStats,
    schedulePreview: quizSchedulePreview,
    againQueue: state.againQueue || [],
    
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
  
  // Find cards with this tag's vocab items
  const tagCards = cards.filter(c => tagVocabIds.includes(c.vocabId));
  if (tagCards.length === 0) return getCurrentCard(state, env);
  
  // Find most overdue due card with this tag
  const dueCards = tagCards.filter(card => {
    const cardStats = getCardStats(card, stats);
    return isCardDue(cardStats, today, false);
  });
  
  if (dueCards.length > 0) return dueCards[0];
  
  // No due cards - try new (never attempted) cards with this tag
  const newCards = tagCards.filter(card => {
    const cardStats = getCardStats(card, stats);
    return !cardStats || cardStats.repetitions === 0;
  });
  
  if (newCards.length > 0) return newCards[0];
  
  // No new or due cards with this tag - return null (will show toast)
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
    const nextEpisode = getNextEpisode(state);
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

  onTapNextLine: (state, env) => {
    const act = getCurrentAct(state);
    if (!act) return {};
    const phase = state.actPhase || 'lines_before';
    const index = (state.currentLineIndex || 0) + 1;
    
    if (phase === 'lines_before') {
      if (index < act.lines_before.length) {
        return { currentLineIndex: index };
      }
      // Lines before done → vocab review
      return { actPhase: 'vocab_review', currentLineIndex: 0, showingAnswer: false };
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
    // For now, always pass (difficulty check can be added later)
    const outcome = choice.pass_outcome;
    return {
      actPhase: 'outcome',
      outcomeLine: outcome.line,
      showingAnswer: false,
    };
  },

  onOutcomeDone: (state, env) => {
    const act = getCurrentAct(state);
    if (!act) return {};
    
    // Update episode play count
    const episodePlays = { ...(state.episodePlays || {}) };
    episodePlays[state.currentEpisodeId] = (episodePlays[state.currentEpisodeId] || 0) + 1;
    
    // Check if there are more acts
    const episode = getCurrentEpisode(state);
    const nextActIndex = (state.currentActIndex || 0) + 1;
    
    if (episode && nextActIndex < episode.acts.length) {
      // Go to next act
      return {
        currentActIndex: nextActIndex,
        currentLineIndex: 0,
        actPhase: 'lines_before',
        episodePlays,
        showingAnswer: false,
      };
    }
    
    // Episode complete - go back to welcome
    return {
      currentView: 'welcome',
      episodePlays,
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
    return { actPhase: 'lines_after', currentLineIndex: 0, showingAnswer: false };
  },

  onShowAnswer: (state, env) => {
    const currentCard = getQuizCardForTag(state, env) || getCurrentCard(state, env);
    if (currentCard && env.speakThai) {
      const textToSpeak = currentCard.back;
      if (isThaiText(textToSpeak)) env.speakThai(textToSpeak);
    }
    return { showingAnswer: true };
  },

  onShowCard: (state, env) => {
    const currentCard = getQuizCardForTag(state, env) || getCurrentCard(state, env);
    if (currentCard && env.speakThai) {
      const textToSpeak = currentCard.front;
      if (isThaiText(textToSpeak)) env.speakThai(textToSpeak);
    }
    return { showingAnswer: false };
  },

  onRateCard: (state, env, cardId, quality) => {
    const today = getEffectiveDay(env, state.dateshift || 0);
    const stats = state.cardStats || {};
    const againQueue = state.againQueue || [];
    const cardStats = stats[cardId] || { repetitions: 0, interval: 0, ef: 2.5, lastReviewed: null };

    const result = sm2Schedule(quality, cardStats.repetitions, cardStats.interval, cardStats.ef);

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
    cardStats: {},
    againQueue: [],
    againDelayCounter: 0,
    currentCardIndex: 0,
    showingAnswer: false,
    currentView: 'welcome',
    showResetConfirm: false,
  }),
};

export { getProps, Handlers, sm2Schedule, generateCards, shuffleArray, mergeStats };
