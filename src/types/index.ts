// Type definitions for Thai RPG

export interface Content {
  pageTitles: string[];
  vocabItems?: any[];
  episodes?: any[];
  characters?: Record<string, any>;
  places?: Record<string, any>;
  subplots?: Record<string, any>;
  tags?: Record<string, string[]>;
  tagMeta?: Record<string, { name: string; description?: string; picture?: string }>;
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
  episodesUnplayed: number;
  dateshift: number;
  showDateshift: boolean;
  currentView: string;
  currentCard: Card | null;
  currentLine: any;
  currentEpisode: any;
  currentAct: any;
  currentCharacter: any;
  currentPlace: any;
  actPhase: string;
  showingAnswer: boolean;
  quizMode: boolean;
  dueDate: number | null;
  showPhonetics: boolean;
  cardStats: any;
  schedulePreview: { again: number; againIsDelay?: boolean; hard: number; good: number; easy: number } | null;
  showVocabReview: boolean;
  currentDecision: any;
  outcomePassed?: boolean;
  outcomeDelta?: number;
  outcomeSubplot?: string;
  isNarrator: boolean;
  subplotScores: Record<string, number>;
  subplots: Record<string, any>;
  episodePlays: Record<string, number>;
  againQueue: string[];
  debugMessage?: string;
  cmsBaseUrl: string;
  toast: string | null;
  getHandler: (event: string) => (...args: any[]) => void;

  // Diagnostic displays
  currentActTag: string | null;
  quizCardDueDate: string | null;
  mostOverdueCardInfo: {
    cardId: string;
    vocabId: string;
    front: string;
    dueDate: number;
    isNew: boolean;
    isAgain: boolean;
    tags: string[];
  } | null;
  nextEpisodeInfo: {
    episodeId: string;
    title: string;
    acts: { actIndex: number; tag: string }[];
  } | null;
}
