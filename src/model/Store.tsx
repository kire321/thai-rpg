// Store.tsx - React component that wires controller and View
// Boilerplate - create once, never touch

import { Component } from 'react';
import { getProps, Handlers } from '../controller/controller.js';
import { View } from '../view/View';
import type { Time, Env } from '../types';

const CMS_BASE = 'https://ipozfyeyt26ay.kimi.show';

// Time interface
const time: Time = {
  getTimestamp: () => Date.now(),
  getDayStart: () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },
  getDaysSinceEpoch: () => {
    return Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  },
};

// Fetch JSON from CMS with localStorage cache fallback
async function fetchFromCMS(filename: string): Promise<any> {
  const cacheKey = `thai-rpg-cms-${filename}`;

  // Try CMS first
  try {
    const response = await fetch(`${CMS_BASE}/${filename}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      // Cache the fresh data
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
      } catch (e) { /* storage full */ }
      return data;
    }
  } catch (e) {
    console.log(`CMS fetch failed for ${filename}:`, e);
  }

  // Fallback to localStorage cache
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.data) {
        console.log(`Using cached ${filename}`);
        return parsed.data;
      }
      // Old format: just raw data
      return parsed;
    }
  } catch (e) {
    console.log(`Cache read failed for ${filename}`);
  }

  // Fallback to local file (bundled with app)
  try {
    const response = await fetch(`/${filename}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log(`Local file fallback failed for ${filename}`);
  }

  return null;
}

// Convert array of {id, ...} objects to a map keyed by id
function arrayToMap(arr: any[] | null): Record<string, any> {
  if (!arr || !Array.isArray(arr)) return {};
  const map: Record<string, any> = {};
  for (const item of arr) {
    if (item && item.id) {
      map[item.id] = item;
    }
  }
  return map;
}

// Convert CMS tags array [{id, name, vocab_item_ids}] to map {tag_id: [vocabIds]}
function tagsArrayToMap(tags: any[] | null): Record<string, string[]> {
  if (!tags || !Array.isArray(tags)) return {};
  const map: Record<string, string[]> = {};
  for (const tag of tags) {
    if (tag && tag.id) {
      map[tag.id] = tag.vocab_item_ids || [];
    }
  }
  return map;
}

// CMS sends stage_directions as a string; our View expects an array.
// Normalize all episode lines so stage_directions is always string[].
function normalizeEpisode(ep: any): any {
  if (!ep) return ep;
  const normalized = { ...ep };
  if (Array.isArray(normalized.acts)) {
    normalized.acts = normalized.acts.map(normalizeAct);
  }
  return normalized;
}

function normalizeAct(act: any): any {
  if (!act) return act;
  const normalized = { ...act };
  normalized.lines_before = (act.lines_before || []).map(normalizeLine);
  normalized.lines_after = (act.lines_after || []).map(normalizeLine);
  if (act.decision) {
    normalized.decision = normalizeDecision(act.decision);
  }
  return normalized;
}

function normalizeLine(line: any): any {
  if (!line) return line;
  const normalized = { ...line };
  // stage_directions: string → [string], null/undefined → [], already array → keep
  const sd = normalized.stage_directions;
  if (sd === null || sd === undefined) {
    normalized.stage_directions = [];
  } else if (typeof sd === 'string') {
    normalized.stage_directions = sd.trim() ? [sd] : [];
  } else if (!Array.isArray(sd)) {
    normalized.stage_directions = [];
  }
  // Ensure dialogue exists
  if (!normalized.dialogue) normalized.dialogue = '';
  return normalized;
}

function normalizeDecision(decision: any): any {
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

function normalizeChoice(choice: any): any {
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

// Loading spinner component
const LoadingScreen = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center flex-col gap-4">
    <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
    <p className="text-slate-400 text-sm">Loading Thai RPG...</p>
  </div>
);

// Error screen component
const ErrorScreen = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
    <div className="bg-slate-800 rounded-2xl p-6 max-w-md text-center">
      <div className="text-4xl mb-4">⚠️</div>
      <h2 className="text-xl font-bold text-white mb-2">Loading Failed</h2>
      <p className="text-slate-400 text-sm mb-4">{message}</p>
      <button onClick={onRetry}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors">
        Retry
      </button>
    </div>
  </div>
);

// Environment object passed to controller
const prodEnv: Env = {
  content: { pageTitles: ['Thai RPG', 'Lesson 1', 'Lesson 2', 'Lesson 3'] },
  time,
  loadContent: () => [],
  downloadFile: (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  checkForUpdates: () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('REFRESH_CACHE');
      setTimeout(() => window.location.reload(), 500);
    }
  },
  speakThai: (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'th-TH';
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  },
};

// Load state from localStorage
const loadState = () => {
  try {
    const saved = localStorage.getItem('thai-rpg-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      delete parsed.cachedContent;
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load state:', e);
  }
  return { pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0 };
};

interface StoreState {
  pageIndex: number;
  isSettingsOpen: boolean;
  currentView: string;
  dateshift: number;
  vocabItems?: any[];
  cards?: any[];
  cardStats?: Record<string, any>;
  currentCardIndex?: number;
  showingAnswer?: boolean;
  [key: string]: any;
}

export class Store extends Component<{}, StoreState> {
  constructor(props: {}) {
    super(props);
    // Start with just the basic state - all content loaded at runtime
    this.state = {
      ...loadState(),
      isLoading: true,
      loadError: null,
    };
  }

  componentDidMount() {
    this.loadAllContent();
  }

  async loadAllContent() {
    this.setState({ isLoading: true, loadError: null });

    try {
      // Fetch all CMS data in parallel
      const [
        vocabItems,
        episodes,
        characters,
        places,
        subplots,
        tags,
      ] = await Promise.all([
        fetchFromCMS('vocab_items.json'),
        fetchFromCMS('episodes.json'),
        fetchFromCMS('characters.json'),
        fetchFromCMS('places.json'),
        fetchFromCMS('subplots.json'),
        fetchFromCMS('tags.json'),
      ]);

      // Validate we got the essential data
      if (!vocabItems || !Array.isArray(vocabItems) || vocabItems.length === 0) {
        throw new Error('Failed to load vocabulary items from CMS');
      }
      if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
        throw new Error('Failed to load episodes from CMS');
      }

      // Normalize episodes: CMS sends stage_directions as string, we need arrays
      const normalizedEpisodes = episodes.map(normalizeEpisode);

      // Convert array data to maps for controller compatibility
      const charactersMap = arrayToMap(characters);
      const placesMap = arrayToMap(places);
      const subplotsMap = arrayToMap(subplots);
      const tagsMap = tagsArrayToMap(tags);

      // Update prodEnv content
      prodEnv.content = {
        ...prodEnv.content,
        vocabItems,
        episodes: normalizedEpisodes,
        characters: charactersMap,
        places: placesMap,
        subplots: subplotsMap,
        tags: tagsMap,
      };
      prodEnv.loadContent = () => vocabItems;

      // Merge stats with any new cards
      const cards = this.state.cards || [];
      const oldStats = this.state.cardStats || {};
      // Only generate new cards if we don't have them yet or vocab changed
      const newCards = cards.length === 0 ? this.generateCards(vocabItems) : cards;
      const cardStats = this.mergeStats(oldStats, newCards);

      // Apply handler updates
      const loadHandler = (Handlers as Record<string, Function>)['onLoadContent'];
      const epHandler = (Handlers as Record<string, Function>)['onLoadEpisodes'];

      let updates: any = {
        isLoading: false,
        loadError: null,
        vocabItems,
        episodes: normalizedEpisodes,
        characters: charactersMap,
        places: placesMap,
        subplots: subplotsMap,
        tags: tagsMap,
        cards: newCards,
        cardStats,
      };

      if (loadHandler) {
        const loadUpdates = loadHandler(this.state, prodEnv);
        updates = { ...updates, ...loadUpdates };
      }
      if (epHandler) {
        const epUpdates = epHandler(this.state, prodEnv);
        updates = { ...updates, ...epUpdates };
      }

      this.setState(updates);

      console.log('[CMS] Loaded:', {
        vocabItems: vocabItems.length,
        episodes: episodes.length,
        characters: Object.keys(charactersMap).length,
        places: Object.keys(placesMap).length,
        subplots: Object.keys(subplotsMap).length,
        tags: Object.keys(tagsMap).length,
      });

    } catch (error: any) {
      console.error('[CMS] Load failed:', error);
      this.setState({
        isLoading: false,
        loadError: error?.message || 'Failed to load content',
      });
    }
  }

  // Inline card generation (same logic as controller)
  private generateCards(vocabItems: any[]) {
    if (!vocabItems || !Array.isArray(vocabItems)) return [];
    const cards: any[] = [];
    for (const item of vocabItems) {
      cards.push({ id: `card-${item.id}-eng-thai`, vocabId: item.id, direction: 'eng-thai', front: item.english, back: item.thai, phonetics: item.phonetics });
      cards.push({ id: `card-${item.id}-thai-eng`, vocabId: item.id, direction: 'thai-eng', front: item.thai, back: item.english, phonetics: item.phonetics });
    }
    // Shuffle
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  // Inline stats merge (same logic as controller)
  private mergeStats(oldStats: Record<string, any>, cards: any[]) {
    if (!oldStats) return {};
    const newStats: Record<string, any> = {};
    for (const card of cards) {
      if (oldStats[card.id]) newStats[card.id] = { ...oldStats[card.id] };
    }
    return newStats;
  }

  componentDidUpdate(_: {}, prevState: StoreState) {
    if (JSON.stringify(prevState) !== JSON.stringify(this.state)) {
      try {
        const toSave = { ...this.state };
        delete toSave.cachedContent;
        localStorage.setItem('thai-rpg-state', JSON.stringify(toSave));
      } catch (e) {
        console.error('Failed to save state:', e);
      }
    }
  }

  getHandler = (event: string) => {
    return (...args: any[]) => {
      this.setState((prevState) => {
        const handler = (Handlers as Record<string, Function>)[event];
        if (handler) {
          return handler(prevState, prodEnv, ...args);
        }
        return {};
      });
    };
  };

  render() {
    // Show loading screen
    if (this.state.isLoading) {
      return <LoadingScreen />;
    }

    // Show error screen
    if (this.state.loadError) {
      return <ErrorScreen message={this.state.loadError} onRetry={() => this.loadAllContent()} />;
    }

    try {
      const props = getProps(this.state, prodEnv);
      return <View {...(props as any)} getHandler={this.getHandler} />;
    } catch (e: any) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-md text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-white mb-2">Render Error</h2>
            <p className="text-slate-400 text-sm mb-4">{e?.message || 'Unknown error'}</p>
            <button onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              Reload
            </button>
          </div>
        </div>
      );
    }
  }
}
