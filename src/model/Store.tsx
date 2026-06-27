// Store.tsx - React component that wires controller and View
// Boilerplate - create once, never touch

import { Component } from 'react';
import { getProps, Handlers } from '../controller/controller.js';
import { View } from '../view/View';
import type { Time, Env } from '../types';

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

// Content data - loaded from local file or CMS
async function loadVocabItems(): Promise<any[]> {
  // Try to load from CMS first
  try {
    const response = await fetch('https://ipozfyeyt26ay.kimi.show/vocab_items.json');
    if (response.ok) {
      const items = await response.json();
      // Cache for offline
      localStorage.setItem('thai-rpg-content', JSON.stringify(items));
      localStorage.setItem('thai-rpg-content-version', Date.now().toString());
      return items;
    }
  } catch (e) {
    console.log('CMS load failed, using cached/local content');
  }

  // Fallback to local file
  try {
    const response = await fetch('/vocab_items.json');
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log('Local file load failed');
  }

  // Fallback to localStorage cache
  const cached = localStorage.getItem('thai-rpg-content');
  if (cached) {
    return JSON.parse(cached);
  }

  return [];
}

// Environment object passed to controller
const prodEnv: Env = {
  content: { pageTitles: ['Thai RPG', 'Lesson 1', 'Lesson 2', 'Lesson 3'] },
  time,
  loadContent: () => [], // Will be populated after async load
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
      // Cancel any ongoing speech
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
      // Don't restore cachedContent - we'll load fresh
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
    this.state = loadState();
  }

  componentDidMount() {
    // Load content on mount
    this.loadContent();
  }

  async loadContent() {
    const items = await loadVocabItems();
    prodEnv.content = { ...prodEnv.content, vocabItems: items };
    prodEnv.loadContent = () => items;

    this.setState((prevState) => {
      const handler = (Handlers as Record<string, Function>)['onLoadContent'];
      if (handler) {
        return handler(prevState, prodEnv);
      }
      return {};
    });
  }

  // Save state to localStorage whenever it changes
  componentDidUpdate(_: {}, prevState: StoreState) {
    if (JSON.stringify(prevState) !== JSON.stringify(this.state)) {
      try {
        const toSave = { ...this.state };
        delete toSave.cachedContent; // Don't save cached content in state
        localStorage.setItem('thai-rpg-state', JSON.stringify(toSave));
      } catch (e) {
        console.error('Failed to save state:', e);
      }
    }
  }

  // Get handler for an event - returns a function that updates state
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
    const props = getProps(this.state, prodEnv);
    return <View {...(props as any)} getHandler={this.getHandler} />;
  }
}
