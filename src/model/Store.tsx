// Store.tsx - React component that wires controller and View
// Boilerplate - create once, never touch

import React, { Component } from 'react';
import { getProps, Handlers } from '../controller/controller.js';
import { View } from '../view/View';
import type { Time, Env } from '../types';

// Build-time version constant injected by Vite
declare const __APP_VERSION__: string;

const DEFAULT_CMS_BASE = '/cms'; // durable same-origin CMS mirror (GitHub Pages /cms folder — NOTE: '/thai-rpg-content' is shadowed by the project-site path of the repo with that name; never use repo-named paths); override in settings

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

// Convert array of {id, ...} objects to a map keyed by id
// Also handles object maps (for local fallback files)
function arrayToMap(arr: any[] | Record<string, any> | null): Record<string, any> {
  if (!arr) return {};
  // Already an object map (from local files)
  if (!Array.isArray(arr)) {
    const map: Record<string, any> = {};
    for (const key of Object.keys(arr)) {
      const item = arr[key];
      if (item && item.id) {
        map[item.id] = item;
      }
    }
    return map;
  }
  // Array from CMS
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

// Build tag metadata map {tag_id: {name, description, picture}} from CMS tags array.
// This provides human-readable tag names for the quiz card diagnostic display.
function tagsArrayToMeta(tags: any[] | null): Record<string, { name: string; description?: string; picture?: string }> {
  if (!tags || !Array.isArray(tags)) return {};
  const map: Record<string, any> = {};
  for (const tag of tags) {
    if (tag && tag.id) {
      map[tag.id] = {
        name: tag.name || tag.id,
        description: tag.description || '',
        picture: tag.picture || null,
      };
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

// Loading spinner component — with diagnostics (now shows Cache API status)
const LoadingScreen = () => {
  const [diag, setDiag] = React.useState<string>('Loading diagnostics...');
  React.useEffect(() => {
    (async () => {
      try {
        const lsKeys = Object.keys(localStorage).filter(k => k.startsWith('thai-rpg'));
        const stateItem = localStorage.getItem('thai-rpg-state');
        const stateSize = stateItem ? Math.round(stateItem.length / 1024) + 'KB' : 'none';
        
        // Check Cache API
        let cacheInfo = 'Cache API: ';
        try {
          const cacheNames = await caches.keys();
          const contentCache = cacheNames.find(n => n.includes('thai-rpg-content'));
          if (contentCache) {
            const cache = await caches.open(contentCache);
            const keys = await cache.keys();
            const files: string[] = [];
            for (const req of keys) {
              const url = req.url;
              const name = url.split('/').pop() || url;
              const resp = await cache.match(req);
              const size = resp ? Math.round((await resp.blob()).size / 1024) + 'KB' : '?';
              files.push(`${name}:${size}`);
            }
            cacheInfo += files.join(', ') || 'empty';
          } else {
            cacheInfo += 'NO content cache';
          }
        } catch (e: any) {
          cacheInfo += 'ERROR: ' + e.message;
        }
        
        setDiag(`localStorage: ${lsKeys.length} keys, state=${stateSize} | ${cacheInfo}`);
      } catch (e: any) {
        setDiag(`Error: ${e.message}`);
      }
    })();
  }, []);
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center flex-col gap-4">
      <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-600 dark:text-slate-400 text-sm">Loading Thai RPG...</p>
      <p className="text-[10px] text-slate-500 font-mono max-w-xs text-center break-all">{diag}</p>
    </div>
  );
};

// Error screen component — with FULL diagnostics (Cache API + localStorage + state)
const ErrorScreen = ({ message, onRetry }: { message: string; onRetry: () => void }) => {
  const [diag, setDiag] = React.useState<Record<string, any>>({ loading: true });
  React.useEffect(() => {
    (async () => {
      try {
        const d: Record<string, any> = {};
        
        // 1. localStorage keys
        d.lsKeys = Object.keys(localStorage).filter(k => k.startsWith('thai-rpg'));
        
        // 2. thai-rpg-state contents
        const stateRaw = localStorage.getItem('thai-rpg-state');
        d.stateSize = stateRaw ? stateRaw.length : 0;
        if (stateRaw) {
          const state = JSON.parse(stateRaw);
          d.hasVocabItems = Array.isArray(state.vocabItems);
          d.vocabCount = state.vocabItems?.length ?? 'missing';
          d.hasEpisodes = Array.isArray(state.episodes);
          d.epCount = state.episodes?.length ?? 'missing';
          d.hasCharacters = !!state.characters;
          d.hasPlaces = !!state.places;
          d.hasSubplots = !!state.subplots;
          d.hasTags = !!state.tags;
          d.hasCards = Array.isArray(state.cards);
          d.cardCount = state.cards?.length ?? 'missing';
          d.cmsBaseUrl = state.cmsBaseUrl ?? 'missing';
          d.currentView = state.currentView ?? 'missing';
        } else {
          d.statePresent = false;
        }
        
        // 3. Cache API diagnostics (NEW — shows the actual caching system)
        d.cacheAPI = {};
        try {
          const cacheNames = await caches.keys();
          d.cacheAPI.cacheNames = cacheNames;
          for (const name of cacheNames) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            d.cacheAPI[name] = {};
            for (const req of keys) {
              const resp = await cache.match(req);
              if (resp) {
                const blob = await resp.blob();
                d.cacheAPI[name][req.url] = Math.round(blob.size / 1024) + 'KB';
              }
            }
          }
        } catch (e: any) {
          d.cacheAPI.error = e.message;
        }
        
        // 4. Service worker & network
        d.swController = !!navigator.serviceWorker?.controller;
        d.swState = navigator.serviceWorker?.controller?.state ?? 'none';
        d.onLine = navigator.onLine;
        d.ua = navigator.userAgent;
        
        // 5. App version
        d.appVersion = (window as any).__APP_VERSION__ || 'unknown';
        
        setDiag(d);
      } catch (e: any) {
        setDiag({ error: e.message });
      }
    })();
  }, []);
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
        <div className="text-4xl mb-4 text-center">⚠️</div>
        <h2 className="text-xl font-bold text-white mb-2 text-center">Loading Failed</h2>
        <p className="text-slate-400 text-sm mb-4 text-center">{message}</p>
        <button onClick={onRetry}
          className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors mb-4">
          Retry
        </button>
        <details className="text-left">
          <summary className="text-xs text-slate-500 cursor-pointer">Diagnostics</summary>
          <pre className="text-[10px] text-slate-400 font-mono mt-2 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(diag, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
};

// App version — changes on every build
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// Error Boundary — catches React render errors anywhere in the component tree below it.
// Displays full diagnostics including error stack, component stack, and app state.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;
      return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-lg w-full">
            <div className="text-4xl mb-4 text-center">💥</div>
            <h2 className="text-xl font-bold text-white mb-2 text-center">Render Error Caught</h2>
            <p className="text-red-400 text-sm mb-2 text-center font-mono">{error?.name}: {error?.message}</p>
            <div className="flex gap-2 mb-4">
              <button onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                Reload Page
              </button>
              <button onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors">
                Try Again
              </button>
            </div>
            <details className="text-left" open>
              <summary className="text-xs text-slate-500 cursor-pointer mb-2">Diagnostics</summary>
              <div className="space-y-2">
                <div className="bg-slate-900 rounded p-2">
                  <p className="text-[10px] text-slate-500 uppercase">Error Stack</p>
                  <pre className="text-[10px] text-red-300 font-mono whitespace-pre-wrap break-all">{error?.stack || 'N/A'}</pre>
                </div>
                <div className="bg-slate-900 rounded p-2">
                  <p className="text-[10px] text-slate-500 uppercase">Component Stack</p>
                  <pre className="text-[10px] text-amber-300 font-mono whitespace-pre-wrap break-all">{errorInfo?.componentStack || 'N/A'}</pre>
                </div>
                <div className="bg-slate-900 rounded p-2">
                  <p className="text-[10px] text-slate-500 uppercase">App State (localStorage)</p>
                  <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all">
                    {(() => {
                      try {
                        const raw = localStorage.getItem('thai-rpg-state');
                        if (!raw) return 'No state in localStorage';
                        const s = JSON.parse(raw);
                        return JSON.stringify({
                          currentView: s.currentView,
                          currentEpisodeId: s.currentEpisodeId,
                          actPhase: s.actPhase,
                          currentLineIndex: s.currentLineIndex,
                          currentActIndex: s.currentActIndex,
                          hasEpisodes: Array.isArray(s.episodes),
                          epCount: s.episodes?.length,
                          hasVocabItems: Array.isArray(s.vocabItems),
                          vocabCount: s.vocabItems?.length,
                          hasCards: Array.isArray(s.cards),
                          cardCount: s.cards?.length,
                        }, null, 2);
                      } catch (e: any) {
                        return 'Error reading state: ' + e.message;
                      }
                    })()}
                  </pre>
                </div>
                <div className="bg-slate-900 rounded p-2">
                  <p className="text-[10px] text-slate-500 uppercase">Environment</p>
                  <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify({
                      online: navigator.onLine,
                      sw: !!navigator.serviceWorker?.controller,
                      ua: navigator.userAgent,
                      version: APP_VERSION,
                    }, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
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
  checkForUpdates: async () => {
    // Use the Service Worker's update mechanism to detect if a new version exists.
    // Critical fix: the timeout must be CANCELLED when updatefound fires.
    // If the timeout fires while we're still waiting for the new SW to activate,
    // we incorrectly record "no-update" even though an update WAS found.
    try {
      localStorage.setItem('thai-rpg-checking-updates', 'true');

      const reg = await navigator.serviceWorker.ready;

      const hadUpdate = await new Promise<boolean>((resolve) => {
        let resolved = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const doResolve = (value: boolean) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          resolve(value);
        };

        // If an update is found, wait for the new worker to activate.
        // Cancel the timeout so we don't give up during slow activation.
        const onUpdateFound = () => {
          const newWorker = reg.installing;
          if (!newWorker) { doResolve(false); return; }
          const onStateChange = () => {
            if (newWorker.state === 'activated') doResolve(true);
          };
          newWorker.addEventListener('statechange', onStateChange);
          onStateChange(); // Check immediately
        };

        reg.addEventListener('updatefound', onUpdateFound);
        if (reg.waiting) { doResolve(true); return; }

        // Only time out if NO update is found. If updatefound fires it
        // cancels this timer and we wait for activation instead.
        timeoutId = setTimeout(() => doResolve(false), 10000);

        // Trigger the update check (fires updatefound if new SW found)
        reg.update();
      });

      localStorage.setItem('thai-rpg-update-result', hadUpdate ? 'updated' : 'no-update');
    } catch (e) {
      localStorage.setItem('thai-rpg-update-result', 'error');
    }
    window.location.reload();
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
  return { pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0, cmsBaseUrl: DEFAULT_CMS_BASE, toast: null };
};

// Check for update toast after "check for updates" reload.
// Uses the SW update detection result (set by checkForUpdates) instead of
// unreliable JS bundle timestamp comparison.
function getUpdateToast(): string | null {
  try {
    const wasChecking = localStorage.getItem('thai-rpg-checking-updates');
    if (!wasChecking) return null;
    localStorage.removeItem('thai-rpg-checking-updates');
    
    const result = localStorage.getItem('thai-rpg-update-result') || 'unknown';
    localStorage.removeItem('thai-rpg-update-result');
    
    if (result === 'updated') {
      return `Updated to ${APP_VERSION}`;
    } else if (result === 'no-update') {
      return `Successfully checked for updates. No new version was available, using ${APP_VERSION}`;
    } else if (result === 'error') {
      return `Update check failed. Using ${APP_VERSION}`;
    }
    return null;
  } catch (e) {
    return null;
  }
}

interface StoreState {
  pageIndex: number;
  isSettingsOpen: boolean;
  currentView: string;
  dateshift: number;
  cmsBaseUrl: string;
  toast: string | null;
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
    // CRITICAL DIAGNOSTIC: log what loadState returns
    const loaded = loadState();
    console.log('[Store] constructor loadState:', {
      hasVocab: Array.isArray(loaded.vocabItems),
      vocabLen: loaded.vocabItems?.length,
      hasEp: Array.isArray(loaded.episodes),
      epLen: loaded.episodes?.length,
      keys: Object.keys(loaded).filter(k => !['pageIndex','isSettingsOpen','currentView','dateshift','cmsBaseUrl','toast'].includes(k)),
    });
    // Check for update toast
    const updateToast = getUpdateToast();
    if (updateToast) {
      loaded.toast = updateToast;
    }

    // Start with just the basic state - all content loaded at runtime
    this.state = {
      ...loaded,
      isLoading: true,
      loadError: null,
    };
  }

  async componentDidMount() {
    console.log('[Store] componentDidMount');
    // Repair the offline image cache whenever we come back online or the
    // app returns to the foreground (covers gaps left by aborted prefetches)
    window.addEventListener('online', this.repairImageCacheIfOnline);
    document.addEventListener('visibilitychange', this.handleVisibilityForImages);

    // First: use cached data immediately so the app renders without waiting
    // This ensures offline users see content right away
    const hasCache = await this.useCachedData();
    console.log('[Store] useCachedData returned:', hasCache);

    // Then: try to refresh from CMS in the background
    // If offline, this will silently fall back to cache (no error screen)
    if (hasCache) {
      // Refresh in background after a short delay
      console.log('[Store] scheduling background refresh in 100ms');
      setTimeout(() => this.loadAllContent(), 100);
    } else {
      // No cache — must load from CMS
      console.log('[Store] no cache, loading from CMS');
      this.loadAllContent();
    }
  }

  // Cache API cache name for content files
  private static CONTENT_CACHE = 'thai-rpg-content-v1';

  // Save data to Cache API (handles files of any size, unlike localStorage)
  private async cachePut(filename: string, data: any) {
    try {
      const cmsBaseUrl = this.state.cmsBaseUrl || DEFAULT_CMS_BASE;
      const cache = await caches.open(Store.CONTENT_CACHE);
      const json = JSON.stringify(data);
      const response = new Response(json, {
        headers: { 'Content-Type': 'application/json' }
      });
      await cache.put(`${cmsBaseUrl}/${filename}`, response);
      console.log(`[Cache] Saved ${filename}: ${Math.round(json.length / 1024)}KB`);
    } catch (e: any) {
      console.error(`[Cache] Failed to save ${filename}:`, e.message);
    }
  }

  // Load data from Cache API
  private async cacheGet(filename: string): Promise<any | null> {
    try {
      const cmsBaseUrl = this.state.cmsBaseUrl || DEFAULT_CMS_BASE;
      const cache = await caches.open(Store.CONTENT_CACHE);
      const response = await cache.match(`${cmsBaseUrl}/${filename}`);
      if (response) {
        const data = await response.json();
        console.log(`[Cache] Loaded ${filename} from cache`);
        return data;
      }
    } catch (e: any) {
      console.log(`[Cache] No cache for ${filename}:`, e.message);
    }
    return null;
  }

  // Fetch JSON from CMS with Cache API fallback
  async fetchFromCMS(filename: string): Promise<{ data: any; fromCache: boolean }> {
    const cmsBaseUrl = this.state.cmsBaseUrl || DEFAULT_CMS_BASE;

    // Try CMS first
    try {
      const response = await fetch(`${cmsBaseUrl}/${filename}?t=${Date.now()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        const count = Array.isArray(data) ? data.length : Object.keys(data).length;
        console.log(`[CMS] ${filename} fetched: ${count} items`);
        // Cache via Cache API (handles 10MB+ files that localStorage can't)
        await this.cachePut(filename, data);
        return { data, fromCache: false };
      }
      console.log(`[CMS] ${filename} HTTP ${response.status}`);
    } catch (e) {
      console.log(`[CMS] ${filename} fetch failed (offline?)`);
    }

    // Fallback to Cache API
    const cached = await this.cacheGet(filename);
    if (cached) return { data: cached, fromCache: true };

    // Fallback to local file (bundled with app)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${filename}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`[CMS] ${filename} using local file`);
        return { data, fromCache: true };
      }
    } catch (e) {
      console.log(`[CMS] ${filename} local file failed`);
    }

    return { data: null, fromCache: true };
  }

  async loadAllContent() {
    console.log('[Store] loadAllContent started, state.vocabItems:', this.state.vocabItems?.length, 'state.episodes:', this.state.episodes?.length);
    this.setState({ isLoading: true, loadError: null });

    // Fetch all CMS data in parallel
    const results = await Promise.all([
      this.fetchFromCMS('vocab_items.json'),
      this.fetchFromCMS('episodes.json'),
      this.fetchFromCMS('characters.json'),
      this.fetchFromCMS('places.json'),
      this.fetchFromCMS('subplots.json'),
      this.fetchFromCMS('tags.json'),
    ]);

    // Track which files came from cache (CMS fetch failed)
    const cachedFiles: string[] = [];
    let vocabItems = results[0].data;
    if (results[0].fromCache) cachedFiles.push('vocabulary');
    let episodes = results[1].data;
    if (results[1].fromCache) cachedFiles.push('episodes');
    let characters = results[2].data;
    if (results[2].fromCache) cachedFiles.push('characters');
    let places = results[3].data;
    if (results[3].fromCache) cachedFiles.push('places');
    let subplots = results[4].data;
    if (results[4].fromCache) cachedFiles.push('subplots');
    let tags = results[5].data;
    if (results[5].fromCache) cachedFiles.push('tags');

    // For any null results, try falling back to existing state
    const existing = loadState();
    if (!vocabItems) vocabItems = this.state.vocabItems || existing.vocabItems;
    if (!episodes)   episodes   = this.state.episodes   || existing.episodes;
    if (!characters) characters = this.state.characters || existing.characters;
    if (!places)     places     = this.state.places     || existing.places;
    if (!subplots)   subplots   = this.state.subplots   || existing.subplots;
    if (!tags)       tags       = this.state.tags       || existing.tags;

    // If we still have no essential data, check if we already have cached data in state
    // (from useCachedData) before showing an error
    if (!vocabItems || !episodes) {
      const hasCachedData = this.state.vocabItems && Array.isArray(this.state.vocabItems) && this.state.vocabItems.length > 0
                         && this.state.episodes && Array.isArray(this.state.episodes) && this.state.episodes.length > 0;
      console.log('[Store] No CMS data. hasCachedData:', hasCachedData, 'this.state.vocabItems:', this.state.vocabItems?.length);
      if (hasCachedData) {
        // Already have data from useCachedData — just show a toast
        console.log('[Store] Using existing cached data, showing toast');
        this.setState({
          isLoading: false,
          toast: 'Content refresh failed. Using previously cached content.',
        });
        return;
      }
      console.log('[Store] No cached data available, showing error');
      this.setState({
        isLoading: false,
        loadError: 'Failed to load content. No cached data available.',
      });
      return;
    }

    // Normalize episodes: CMS sends stage_directions as string, we need arrays
    const normalizedEpisodes = (episodes as any[]).map(normalizeEpisode);

    // Convert array data to maps for controller compatibility
    const charactersMap = arrayToMap(characters);
    const placesMap = arrayToMap(places);
    const subplotsMap = arrayToMap(subplots);
    const tagsMap = tagsArrayToMap(tags);
    const tagsMeta = tagsArrayToMeta(tags);

    // Update prodEnv content
    prodEnv.content = {
      ...prodEnv.content,
      vocabItems,
      episodes: normalizedEpisodes,
      characters: charactersMap,
      places: placesMap,
      subplots: subplotsMap,
      tags: tagsMap,
      tagMeta: tagsMeta,
    };
    prodEnv.loadContent = () => vocabItems;

    // Merge stats with any new cards
    const cards = this.state.cards || [];
    const oldStats = this.state.cardStats || {};
    const newCards = cards.length === 0 ? this.generateCards(vocabItems as any[]) : cards;
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
      tagMeta: tagsMeta,
      cards: newCards,
      cardStats,
    };

    // Show toast when any CMS fetch fell back to cache
    if (cachedFiles.length > 0) {
      const pretty = cachedFiles.join(', ');
      updates.toast = `Failed to refresh ${pretty}. Using cached content.`;
    }

    if (loadHandler) {
      const loadUpdates = loadHandler(this.state, prodEnv);
      updates = { ...updates, ...loadUpdates };
    }
    if (epHandler) {
      const epUpdates = epHandler(this.state, prodEnv);
      updates = { ...updates, ...epUpdates };
    }

    this.setState(updates, () => {
      // Save state after successful load
      this.saveState();
    });

    console.log('[CMS] Loaded:', {
      vocabItems: (vocabItems as any[]).length,
      episodes: (episodes as any[]).length,
      characters: Object.keys(charactersMap).length,
      places: Object.keys(placesMap).length,
      subplots: Object.keys(subplotsMap).length,
      tags: Object.keys(tagsMap).length,
      cachedFiles,
    });

    // Prefetch (and repair) all images so the app works fully offline
    this.ensureImagesCached(charactersMap, placesMap);
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

  // ===================== OFFLINE IMAGE CACHE (verify-and-repair) =====================
  //
  // Images are cached by the Service Worker. Two failure modes caused the
  // "broken image after backgrounding" bug:
  //   1. Prefetch fired while the page was NOT yet SW-controlled (first
  //      visit, slow SW startup): fetches bypassed the SW entirely, nothing
  //      was cached — yet the log claimed "Prefetched 20/20".
  //   2. Transient failures (navigation aborting in-flight prefetches,
  //      flaky network, cache eviction) left PERMANENT gaps: nothing ever
  //      re-checked whether all images actually made it into the cache.
  //
  // ensureImagesCached() fixes both:
  //   - waits for SW control before doing any fetching
  //   - delegates bulk caching to the SW (CACHE_URLS message), so requests
  //     are guaranteed to be intercepted and cache.put()ed by the SW itself
  //   - VERIFIES every URL against the Cache API afterwards and re-fetches
  //     stragglers through the SW as a second chance
  //   - runs on content load, on 'online', and on every foreground return,
  //     so gaps are repaired whenever the device is online
  private imageCacheUrls: string[] = [];
  private ensureImagesPromise: Promise<void> | null = null;

  private collectImageUrls(charactersMap?: Record<string, any>, placesMap?: Record<string, any>): string[] {
    const cmsBaseUrl = this.state.cmsBaseUrl || DEFAULT_CMS_BASE;
    const urls: string[] = [];
    const chars = charactersMap || (this.state.characters as Record<string, any>) || {};
    const places = placesMap || (this.state.places as Record<string, any>) || {};
    for (const item of [...Object.values(chars), ...Object.values(places)]) {
      if (item && item.picture) {
        urls.push(item.picture.startsWith('/') ? `${cmsBaseUrl}${item.picture}` : item.picture);
      }
    }
    return [...new Set(urls)];
  }

  // Wait until the page is controlled by a service worker, so that image
  // requests are actually intercepted (and therefore cached).
  private waitForSWController(timeoutMs = 10000): Promise<boolean> {
    return new Promise((resolve) => {
      if (!('serviceWorker' in navigator)) return resolve(false);
      if (navigator.serviceWorker.controller) return resolve(true);
      let done = false;
      const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
      navigator.serviceWorker.addEventListener('controllerchange', () => finish(true), { once: true });
      navigator.serviceWorker.ready.then(() => {
        // ready means an active SW exists; if the page still isn't
        // controlled, keep waiting for controllerchange until timeout
        if (navigator.serviceWorker.controller) finish(true);
      }).catch(() => {});
      setTimeout(() => finish(!!navigator.serviceWorker.controller), timeoutMs);
    });
  }

  // Ask the SW to bulk-cache URLs; resolves with the SW's result report or
  // null on timeout. The SW skips already-cached URLs and retries failures.
  private requestSWCacheUrls(urls: string[], timeoutMs = 90000): Promise<any | null> {
    return new Promise((resolve) => {
      const ctrl = navigator.serviceWorker?.controller;
      if (!ctrl) return resolve(null);
      let done = false;
      const finish = (val: any) => { if (!done) { done = true; navigator.serviceWorker.removeEventListener('message', h); resolve(val); } };
      const h = (ev: MessageEvent) => {
        if (ev.data?.type === 'CACHE_URLS_DONE') finish(ev.data.results);
      };
      navigator.serviceWorker.addEventListener('message', h);
      ctrl.postMessage({ type: 'CACHE_URLS', urls });
      setTimeout(() => finish(null), timeoutMs);
    });
  }

  private async isUrlCached(url: string): Promise<boolean> {
    try {
      const names = await caches.keys();
      for (const name of names) {
        if (!name.startsWith('thai-rpg') || name.includes('content')) continue;
        const cache = await caches.open(name);
        // ignoreVary: entries cached by <img> requests carry the Origin
        // header in their vary key — a plain string match (no Origin) must
        // still see them, otherwise we report false gaps and re-repair forever
        if (await cache.match(url, { ignoreVary: true })) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  private ensureImagesCached(charactersMap?: Record<string, any>, placesMap?: Record<string, any>): Promise<void> {
    // Coalesce concurrent calls (load + online + visibilitychange can overlap)
    if (this.ensureImagesPromise) return this.ensureImagesPromise;
    this.ensureImagesPromise = this.doEnsureImagesCached(charactersMap, placesMap)
      .finally(() => { this.ensureImagesPromise = null; });
    return this.ensureImagesPromise;
  }

  private async doEnsureImagesCached(charactersMap?: Record<string, any>, placesMap?: Record<string, any>): Promise<void> {
    const urls = this.collectImageUrls(charactersMap, placesMap);
    if (urls.length === 0) return;
    this.imageCacheUrls = urls;

    // Offline right now? Don't burn retries — we'll run again on 'online'
    // and on the next foreground return.
    if (!navigator.onLine) {
      console.log(`[Images] Offline — will cache ${urls.length} images when back online`);
      return;
    }

    // 1. Wait for SW control (first visits / SW restarts need this)
    const controlled = await this.waitForSWController();
    if (!controlled) {
      console.warn('[Images] No service worker control — falling back to direct prefetch (NOT guaranteed to cache)');
      await Promise.all(urls.map((url) => fetch(url, { mode: 'cors' }).catch(() => null)));
      return;
    }

    // 2. Bulk-cache via the SW itself (guaranteed interception + cache.put)
    console.log(`[Images] Ensuring ${urls.length} images are cached for offline use...`);
    const report = await this.requestSWCacheUrls(urls);

    // 3. VERIFY against the Cache API — never trust the fetch alone
    const missing: string[] = [];
    for (const url of urls) {
      if (!(await this.isUrlCached(url))) missing.push(url);
    }

    // 4. Second chance for stragglers: fetch through the (now controlling)
    //    SW so its fetch handler caches them
    if (missing.length > 0 && navigator.onLine) {
      console.log(`[Images] ${missing.length} images still missing after SW pass, re-fetching...`);
      await Promise.all(missing.map((url) => fetch(url, { mode: 'cors' }).catch(() => null)));
      const stillMissing: string[] = [];
      for (const url of missing) {
        if (!(await this.isUrlCached(url))) stillMissing.push(url);
      }
      missing.length = 0;
      missing.push(...stillMissing);
    }

    const cachedCount = urls.length - missing.length;
    if (missing.length === 0) {
      console.log(`[Images] Offline cache complete: ${cachedCount}/${urls.length} images` +
        (report ? ` (SW: ${report.cached?.length ?? '?'} new, ${report.alreadyCached ?? '?'} already cached)` : ''));
    } else {
      console.warn(`[Images] Offline cache INCOMPLETE: ${cachedCount}/${urls.length} images. Missing:`,
        missing.map((u) => u.split('/').pop()).join(', '));
    }
  }

  // Called when the device comes back online or the app returns to the
  // foreground: repair any gaps in the offline image cache.
  // Does a cheap gap check first — the full pass only runs when something
  // is actually missing (and at most once per 30s for persistent failures).
  private lastGapRepairAt = 0;
  private repairImageCacheIfOnline = async () => {
    if (!navigator.onLine) return;
    if (this.imageCacheUrls.length === 0) return; // content not loaded yet
    if (this.ensureImagesPromise) return; // a pass is already running
    if (Date.now() - this.lastGapRepairAt < 30_000) return;
    for (const url of this.imageCacheUrls) {
      if (!(await this.isUrlCached(url))) {
        console.log('[Images] Cache gap detected while online — repairing...');
        this.lastGapRepairAt = Date.now();
        this.ensureImagesCached();
        return;
      }
    }
  };

  private handleVisibilityForImages = () => {
    if (!document.hidden) this.repairImageCacheIfOnline();
  };

  // Inline stats merge (same logic as controller)
  private mergeStats(oldStats: Record<string, any>, cards: any[]) {
    if (!oldStats) return {};
    const newStats: Record<string, any> = {};
    for (const card of cards) {
      if (oldStats[card.id]) newStats[card.id] = { ...oldStats[card.id] };
    }
    return newStats;
  }

  // Use cached data from Cache API to render immediately.
  // The Cache API handles 10MB+ files that localStorage cannot.
  async useCachedData(): Promise<boolean> {
    console.log('[Store] useCachedData called');
    // 1. Load lightweight state (settings, cardStats, etc.)
    const lightweight = loadState();

    // 2. Load content arrays from Cache API
    const [vocabItems, episodes, characters, places, subplots, tags] = await Promise.all([
      this.cacheGet('vocab_items.json'),
      this.cacheGet('episodes.json'),
      this.cacheGet('characters.json'),
      this.cacheGet('places.json'),
      this.cacheGet('subplots.json'),
      this.cacheGet('tags.json'),
    ]);

    const hasContent = vocabItems && Array.isArray(vocabItems) && vocabItems.length > 0
                    && episodes && Array.isArray(episodes) && episodes.length > 0;
    console.log('[Store] useCachedData hasContent:', hasContent, 'vocab:', vocabItems?.length, 'ep:', episodes?.length);

    if (!hasContent) return false;

    // 3. Normalize and convert
    const normalizedEpisodes = episodes.map(normalizeEpisode);
    const charactersMap = arrayToMap(characters);
    const placesMap = arrayToMap(places);
    const subplotsMap = arrayToMap(subplots);
    const tagsMap = tagsArrayToMap(tags);
    const tagsMeta = tagsArrayToMeta(tags);

    // 4. Update prodEnv
    prodEnv.content = {
      ...prodEnv.content,
      vocabItems,
      episodes: normalizedEpisodes,
      characters: charactersMap,
      places: placesMap,
      subplots: subplotsMap,
      tags: tagsMap,
      tagMeta: tagsMeta,
    };
    prodEnv.loadContent = () => vocabItems;

    // 5. Generate cards from vocab
    const cards = this.generateCards(vocabItems);
    const cardStats = this.mergeStats(lightweight.cardStats || {}, cards);

    // 6. Set full state
    this.setState({
      ...lightweight,
      isLoading: false,
      loadError: null,
      vocabItems,
      episodes: normalizedEpisodes,
      characters: charactersMap,
      places: placesMap,
      subplots: subplotsMap,
      tags: tagsMap,
      tagMeta: tagsMeta,
      cards,
      cardStats,
    }, () => {
      this.saveState();
    });

    console.log('[Store] Using cached data from Cache API');
    return true;
  }

  // Save lightweight state to localStorage.
  // CRITICAL: does NOT save content arrays (too big, causes quota exceeded).
  // Content is reconstructed from per-file CMS caches on load.
  private saveState() {
    try {
      const { isLoading, loadError, toast, vocabItems, episodes, characters, places, subplots, tags, cards, ...lightweight } = this.state as any;
      const json = JSON.stringify(lightweight);
      localStorage.setItem('thai-rpg-state', json);
      console.log('[Store] State saved:', Math.round(json.length / 1024) + 'KB');
    } catch (e: any) {
      console.error('[Store] Failed to save state:', e.message);
    }
  }

  componentDidUpdate() {
    // Backup: save lightweight state on any render
    try {
      const { isLoading, loadError, toast, vocabItems, episodes, characters, places, subplots, tags, cards, ...lightweight } = this.state as any;
      localStorage.setItem('thai-rpg-state', JSON.stringify(lightweight));
    } catch (e) {
      // Silent — explicit saveState is the primary path
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

    return (
      <ErrorBoundary>
        {(() => {
          try {
            const props = getProps(this.state, prodEnv);
            const viewProps = { ...props, cmsBaseUrl: this.state.cmsBaseUrl || DEFAULT_CMS_BASE };
            return <View {...(viewProps as any)} getHandler={this.getHandler} />;
          } catch (e: any) {
            return (
              <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
                <div className="bg-slate-800 rounded-2xl p-6 max-w-md text-center">
                  <div className="text-4xl mb-4">⚠️</div>
                  <h2 className="text-xl font-bold text-white mb-2">Render Error</h2>
                  <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">{e?.message || 'Unknown error'}</p>
                  <button onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                    Reload
                  </button>
                </div>
              </div>
            );
          }
        })()}
      </ErrorBoundary>
    );
  }
}
