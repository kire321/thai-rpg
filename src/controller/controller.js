// controller.js - Plain JavaScript, no compilation needed
// Business logic for Thai RPG PWA with SM-2 Spaced Repetition

// =====================
// SM-2 Algorithm Helpers
// =====================

/**
 * Calculate new interval based on SM-2 algorithm
 * @param {number} quality - Quality rating (0-5)
 * @param {number} repetitions - Current repetition count
 * @param {number} interval - Previous interval in days
 * @param {number} ef - Current easiness factor
 * @returns {Object} { interval, repetitions, ef }
 */
function sm2Schedule(quality, repetitions, interval, ef) {
  let newInterval, newRepetitions, newEF;

  if (quality < 3) {
    // Failed: reset
    newRepetitions = 0;
    newInterval = 1;
    newEF = ef; // EF unchanged on failure
  } else {
    // Success
    newRepetitions = repetitions + 1;

    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.ceil(interval * ef);
    }

    // Update EF
    newEF = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (newEF < 1.3) newEF = 1.3;
  }

  return { interval: newInterval, repetitions: newRepetitions, ef: newEF };
}

/**
 * Get today's date as days since epoch, adjusted by dateshift
 * @param {Object} env - Environment with time
 * @param {number} dateshift - Date shift in days
 * @returns {number} Adjusted day number
 */
function getEffectiveDay(env, dateshift) {
  return env.time.getDaysSinceEpoch() + (dateshift || 0);
}

/**
 * Get the due date for a card
 * @param {Object} stats - Card stats
 * @returns {number|null} Due date as days since epoch, or null if always due
 */
function getDueDate(stats) {
  if (!stats) return null;
  // Card that failed today is due immediately (same day)
  if (stats.failedToday) return stats.lastReviewed;
  // New card never attempted
  if (stats.repetitions === 0 && !stats.lastReviewed) return null;
  // Normal due date calculation
  return (stats.lastReviewed || 0) + (stats.interval || 0);
}

/**
 * Check if a card is due on a given day
 * @param {Object} stats - Card stats
 * @param {number} day - Day to check (days since epoch)
 * @param {boolean} isInAgainQueue - Whether card is in the again queue
 * @returns {boolean}
 */
function isCardDue(stats, day, isInAgainQueue) {
  // Cards in the again queue are always due immediately
  if (isInAgainQueue) return true;
  // Cards without stats are always due
  if (!stats) return true;
  // Failed today cards are due immediately
  if (stats.failedToday) return true;
  // New cards (never attempted) are always due
  if (stats.repetitions === 0 && !stats.lastReviewed) return true;
  const dueDate = getDueDate(stats);
  if (dueDate === null) return true;
  return dueDate <= day;
}

/**
 * Check if a card is new (never attempted)
 * @param {Object} stats - Card stats
 * @returns {boolean}
 */
function isCardNew(stats) {
  return !stats || stats.repetitions === 0;
}

/**
 * Check if a card was first attempted today
 * @param {Object} stats - Card stats
 * @param {number} today - Today's day number
 * @returns {boolean}
 */
function isFirstAttemptedToday(stats, today) {
  return stats && stats.lastReviewed === today && stats.repetitions <= 1;
}

/**
 * Check if text contains Thai characters
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function isThaiText(text) {
  if (!text) return false;
  // Thai Unicode range: U+0E00 to U+0E7F
  return /[\u0E00-\u0E7F]/.test(text);
}

/**
 * Get scheduling preview for each rating option
 * @param {Object} cardStats - Current card stats
 * @returns {Object} { again, hard, good, easy } with interval in days
 */
function getSchedulePreview(cardStats) {
  const stats = cardStats || { repetitions: 0, interval: 0, ef: 2.5 };

  const againResult = sm2Schedule(1, stats.repetitions, stats.interval, stats.ef);
  const hardResult = sm2Schedule(3, stats.repetitions, stats.interval, stats.ef);
  const goodResult = sm2Schedule(4, stats.repetitions, stats.interval, stats.ef);
  const easyResult = sm2Schedule(5, stats.repetitions, stats.interval, stats.ef);

  return {
    again: againResult.interval,
    hard: hardResult.interval,
    good: goodResult.interval,
    easy: easyResult.interval,
  };
}

// =====================
// Content & Card Helpers
// =====================

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate cards from vocab items
 * Each vocab item generates 2 cards: Eng=>Thai and Thai=>Eng
 * Cards are shuffled to mix directions
 * @param {Array} vocabItems - Array of vocab items
 * @returns {Array} Array of shuffled card objects
 */
function generateCards(vocabItems) {
  if (!vocabItems || !Array.isArray(vocabItems)) return [];

  const cards = [];
  for (const item of vocabItems) {
    // Eng => Thai card
    cards.push({
      id: `card-${item.id}-eng-thai`,
      vocabId: item.id,
      direction: 'eng-thai',
      front: item.english,
      back: item.thai,
      phonetics: item.phonetics,
    });

    // Thai => Eng card
    cards.push({
      id: `card-${item.id}-thai-eng`,
      vocabId: item.id,
      direction: 'thai-eng',
      front: item.thai,
      back: item.english,
      phonetics: item.phonetics,
    });
  }

  // Shuffle to mix Eng=>Thai and Thai=>Eng cards
  return shuffleArray(cards);
}

/**
 * Merge new content while preserving existing stats
 * @param {Object} oldStats - Existing card stats
 * @param {Array} newCards - Newly generated cards
 * @returns {Object} Merged stats
 */
function mergeStats(oldStats, newCards) {
  if (!oldStats) return {};

  const newStats = {};
  // Keep stats for cards that still exist
  for (const card of newCards) {
    if (oldStats[card.id]) {
      newStats[card.id] = { ...oldStats[card.id] };
    }
  }
  return newStats;
}

/**
 * Get stats for a card, trying card.id first then vocabId fallback
 * This handles both old-format states (keyed by vocabId) and new format (keyed by card.id)
 * @param {Object} card - Card object
 * @param {Object} allStats - All card stats
 * @returns {Object|null}
 */
function getCardStats(card, allStats) {
  if (!card || !allStats) return null;
  // Try card.id first (new format)
  if (allStats[card.id]) return allStats[card.id];
  // Fall back to vocabId (old format from imported states)
  if (allStats[card.vocabId]) return allStats[card.vocabId];
  return null;
}

// =====================
// Counter Helpers
// =====================

/**
 * Calculate header counters
 * @param {Object} state - Current state
 * @param {Object} env - Environment
 * @returns {Object} Counter values
 */
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
      left++; // Never attempted
      continue;
    }

    if (isFirstAttemptedToday(cardStats, today)) {
      newToday++;
    }

    const dueDate = getDueDate(cardStats);
    if (dueDate !== null) {
      if (dueDate <= today || isInAgainQueue) {
        due++;
      } else {
        done++;
      }
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
  };
}

/**
 * Get current quiz card (next due card)
 * Shows a few other cards before re-showing "Again" cards
 * @param {Object} state - Current state
 * @param {Object} env - Environment
 * @returns {Object|null}
 */
function getCurrentCard(state, env) {
  const cards = state.cards || [];
  if (cards.length === 0) return null;

  const today = getEffectiveDay(env, state.dateshift || 0);
  const stats = state.cardStats || {};
  const againQueue = state.againQueue || [];
  const againDelayCounter = state.againDelayCounter || 0;

  // If we have again cards waiting and delay counter is 0, show one
  if (againQueue.length > 0 && againDelayCounter <= 0) {
    const nextAgainCardId = againQueue[0];
    const againCard = cards.find(c => c.id === nextAgainCardId);
    if (againCard) return againCard;
  }

  // Find due cards (excluding again queue cards)
  const dueCards = cards.filter(card => {
    const cardStats = getCardStats(card, stats);
    const isInAgainQueue = againQueue.includes(card.id);
    // Skip cards in the again queue (they're shown separately)
    if (isInAgainQueue) return false;
    return isCardDue(cardStats, today, false);
  });

  if (dueCards.length === 0) {
    // No fresh cards - fall back to again queue
    if (againQueue.length > 0) {
      const nextAgainCardId = againQueue[0];
      return cards.find(c => c.id === nextAgainCardId) || null;
    }
    return null;
  }

  // Pick based on currentCardIndex
  const index = state.currentCardIndex || 0;
  return dueCards[index % dueCards.length];
}

// =====================
// getProps
// =====================

/**
 * getProps - Computes view props from state and environment
 * @param {Object} state - Current application state
 * @param {Object} env - Environment with content, time, etc.
 * @returns {Object} Props for the View
 */
function getProps(state, env) {
  state = state || {};
  const counters = calculateCounters(state, env);
  const currentCard = getCurrentCard(state, env);
  const today = getEffectiveDay(env, state.dateshift || 0);
  const cardStats = currentCard ? getCardStats(currentCard, state.cardStats || {}) : null;
  const dueDate = cardStats ? getDueDate(cardStats) : null;
  const schedulePreview = getSchedulePreview(cardStats || { repetitions: 0, interval: 0, ef: 2.5 });

  return {
    // Header props
    pageTitle: 'Thai RPG',
    showGearIcon: true,

    // Counters
    doneCount: counters.done,
    dueCount: counters.due,
    newCount: counters.new,
    leftCount: counters.left,
    againCount: counters.again,
    dateshift: state.dateshift || 0,
    showDateshift: (state.dateshift || 0) !== 0,

    // Settings drawer
    isSettingsOpen: state.isSettingsOpen || false,
    showResetConfirm: state.showResetConfirm || false,

    // Quiz props
    currentView: state.currentView || 'welcome',
    currentCard: currentCard,
    showingAnswer: state.showingAnswer || false,
    quizMode: state.currentView === 'quiz',
    dueDate: dueDate !== null ? dueDate - today : null,
    showPhonetics: state.showingAnswer === true,
    cardStats: cardStats,
    schedulePreview: schedulePreview,
    againQueue: state.againQueue || [],
  };
}

// =====================
// Handlers
// =====================

const Handlers = {
  // === Navigation ===

  onTapNext: (state, env) => {
    const nextIndex = (state.pageIndex || 0) + 1;
    const views = ['welcome', 'quiz'];
    return {
      pageIndex: nextIndex,
      currentView: views[nextIndex % views.length] || 'quiz',
    };
  },

  onTapGear: (state, env) => ({
    isSettingsOpen: true,
  }),

  onCloseSettings: (state, env) => ({
    isSettingsOpen: false,
  }),

  onSwipeDownSettings: (state, env) => ({
    isSettingsOpen: false,
  }),

  // === Content Loading ===

  onLoadContent: (state, env) => {
    // Use cached content if available, otherwise load from env
    const vocabItems = state.cachedContent || (env.loadContent ? env.loadContent() : (env.content.vocabItems || []));
    const cards = generateCards(vocabItems);

    // Merge stats if content was updated
    const cardStats = state.cardStats ? mergeStats(state.cardStats, cards) : {};

    return {
      vocabItems,
      cards,
      cardStats,
      currentView: state.currentView || 'welcome',
      currentCardIndex: state.currentCardIndex || 0,
    };
  },

  onCheckForNewContent: (state, env) => {
    // Trigger content update
    if (env.checkForUpdates) {
      env.checkForUpdates();
    }

    // Load new content
    const newItems = env.newContent || (env.loadContent ? env.loadContent() : []);
    const oldStats = state.cardStats || {};
    const cards = generateCards(newItems);

    // Preserve stats for existing cards
    const cardStats = mergeStats(oldStats, cards);

    return {
      vocabItems: newItems,
      cards,
      cardStats,
    };
  },

  // === Quiz UI ===

  onShowAnswer: (state, env) => {
    const currentCard = getCurrentCard(state, env);
    if (currentCard && env.speakThai) {
      // Only speak Thai text - check the back of the card
      const textToSpeak = currentCard.back;
      if (isThaiText(textToSpeak)) {
        env.speakThai(textToSpeak);
      }
    }
    return { showingAnswer: true };
  },

  onShowCard: (state, env) => {
    const currentCard = getCurrentCard(state, env);
    if (currentCard && env.speakThai) {
      // Only speak Thai text - check the front of the card
      const textToSpeak = currentCard.front;
      if (isThaiText(textToSpeak)) {
        env.speakThai(textToSpeak);
      }
    }
    return { showingAnswer: false };
  },

  // === SM-2 Rating ===

  onRateCard: (state, env, cardId, quality) => {
    const today = getEffectiveDay(env, state.dateshift || 0);
    const stats = state.cardStats || {};
    const againQueue = state.againQueue || [];
    const cardStats = stats[cardId] || { repetitions: 0, interval: 0, ef: 2.5, lastReviewed: null };

    // Apply SM-2 algorithm
    const result = sm2Schedule(
      quality,
      cardStats.repetitions,
      cardStats.interval,
      cardStats.ef
    );

    // Build new stats for this card
    const newCardStats = {
      repetitions: result.repetitions,
      interval: result.interval,
      ef: result.ef,
      lastReviewed: today,
      failedToday: false,
    };

    // Handle "Again" rating: card should be reviewed again today
    const newAgainQueue = [...againQueue];
    let againDelayCounter = state.againDelayCounter || 0;

    if (quality < 3) {
      // Failed: mark for same-day review
      newCardStats.failedToday = true;
      // Add to again queue if not already there
      if (!newAgainQueue.includes(cardId)) {
        newAgainQueue.push(cardId);
      }
      // Delay again cards by a few fresh cards (minimum 2)
      againDelayCounter = Math.max(againDelayCounter, 2);
    } else {
      // Success: remove from again queue if it was there
      const idx = newAgainQueue.indexOf(cardId);
      if (idx > -1) {
        newAgainQueue.splice(idx, 1);
      }
    }

    // Decrement delay counter when showing a non-again card
    // (This is handled when selecting the next card - if we showed a fresh card, decrement)
    const showedFreshCard = quality >= 3 && againDelayCounter > 0;
    if (showedFreshCard) {
      againDelayCounter = Math.max(0, againDelayCounter - 1);
    }

    const newStats = {
      ...stats,
      [cardId]: newCardStats,
    };

    // Move to next card
    const currentCardIndex = (state.currentCardIndex || 0) + 1;

    return {
      cardStats: newStats,
      showingAnswer: false,
      currentCardIndex,
      againQueue: newAgainQueue,
      againDelayCounter,
    };
  },

  // === Dateshift ===

  onIncrementDateshift: (state, env) => ({
    dateshift: (state.dateshift || 0) + 1,
  }),

  onDecrementDateshift: (state, env) => ({
    dateshift: Math.max(0, (state.dateshift || 0) - 1),
  }),

  // === Settings ===

  onCheckForUpdates: (state, env) => {
    if (env.checkForUpdates) {
      env.checkForUpdates();
    }
    return {};
  },

  onExportState: (state, env) => {
    const timestamp = env.time ? env.time.getTimestamp() : Date.now();
    const filename = `state-${timestamp}.md`;
    const content = JSON.stringify(state, null, 2);

    if (env.downloadFile) {
      env.downloadFile(filename, content);
    }
    return {};
  },

  onImportState: (state, env, fileContent) => {
    try {
      const importedState = JSON.parse(fileContent);
      return { ...importedState };
    } catch (e) {
      return {};
    }
  },

  // === Reset State ===

  onTapResetState: (state, env) => ({
    showResetConfirm: true,
  }),

  onCancelReset: (state, env) => ({
    showResetConfirm: false,
  }),

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

// Export for ESM
export { getProps, Handlers, sm2Schedule };
