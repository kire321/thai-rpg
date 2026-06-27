// Type definitions for Thai RPG

export interface Content {
  pageTitles: string[];
  vocabItems?: any[];
}

export interface Time {
  getTimestamp: () => number;
  getDayStart: () => number;
  getDaysSinceEpoch: () => number;
}

export interface Env {
  content: Content;
  time: Time;
  loadContent: () => any[];
  downloadFile: (filename: string, content: string) => void;
  checkForUpdates: () => void;
  speakThai: (text: string) => void;
}

export interface Card {
  id: string;
  vocabId: string;
  direction: 'thai-eng' | 'eng-thai';
  front: string;
  back: string;
  phonetics: string;
}

export interface ViewProps {
  pageTitle: string;
  showGearIcon: boolean;
  isSettingsOpen: boolean;
  showResetConfirm: boolean;
  doneCount: number;
  dueCount: number;
  newCount: number;
  leftCount: number;
  dateshift: number;
  showDateshift: boolean;
  currentView: string;
  currentCard: Card | null;
  showingAnswer: boolean;
  quizMode: boolean;
  dueDate: number | null;
  showPhonetics: boolean;
  cardStats: any;
  schedulePreview: { again: number; hard: number; good: number; easy: number } | null;
  getHandler: (event: string) => (...args: any[]) => void;
}
