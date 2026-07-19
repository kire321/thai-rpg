// View.tsx - Pure presentation layer
// Only edit when adding new features, not for bug fixes

import React, { useRef, useState, useEffect } from 'react';
import type { ViewProps, Card } from '../types';
import { RefreshCw, Upload, Download, Trash2, ChevronRight, Volume2, AlertTriangle, X, Minus, Plus, Image } from 'lucide-react';

// ===================== IMAGE CACHE DIAGNOSTICS =====================
// Global diagnostics object — persists across component remounts
const imageDiagnostics = {
  lastHidden: null as number | null,
  lastShown: null as number | null,
  retryCount: 0,
  brokenImages: [] as string[],
  lastError: null as string | null,
};

// Retry broken images when the page becomes visible again.
// This fixes the "broken images after backgrounding" bug: when the user
// backgrounds the app and returns, cached images sometimes fail to load
// with NS_BINDING_ABORTED. Retrying on visibilitychange fixes it.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      imageDiagnostics.lastHidden = Date.now();
    } else {
      imageDiagnostics.lastShown = Date.now();
      // Dispatch a custom event that CachedImage components listen for.
      // This is more reliable than querying DOM img elements because
      // failed images render as div placeholders (not <img> tags).
      window.dispatchEvent(new CustomEvent('thai-rpg-retry-images'));
    }
  });

  // When the network comes back, retry any images that failed while offline.
  window.addEventListener('online', () => {
    window.dispatchEvent(new CustomEvent('thai-rpg-retry-images'));
  });
}

// ===================== CACHED IMAGE COMPONENT =====================
// Renders an image from the CMS with retry support.
// Uses the Service Worker's cache for offline availability.
// On error, shows a placeholder div (not a broken image icon).
// Listens for the global 'thai-rpg-retry-images' event to retry.
const CachedImage = ({ src, alt, className, fallbackIcon = '🖼️' }: { src: string; alt: string; className?: string; fallbackIcon?: string }) => {
  const [failed, setFailed] = React.useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Register as broken in diagnostics when it fails
  React.useEffect(() => {
    if (failed && !imageDiagnostics.brokenImages.includes(src)) {
      imageDiagnostics.brokenImages.push(src);
    }
    if (!failed) {
      const idx = imageDiagnostics.brokenImages.indexOf(src);
      if (idx > -1) imageDiagnostics.brokenImages.splice(idx, 1);
    }
  }, [failed, src]);

  // Listen for the global retry event
  React.useEffect(() => {
    if (!failed) return;
    const retry = () => {
      imageDiagnostics.retryCount++;
      setFailed(false);
    };
    window.addEventListener('thai-rpg-retry-images', retry);
    return () => window.removeEventListener('thai-rpg-retry-images', retry);
  }, [failed]);

  if (failed) {
    return (
      <div className={`${className} bg-slate-200 dark:bg-slate-700 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500`}>
        <span className="text-2xl mb-1">{fallbackIcon}</span>
        <span className="text-[10px]">retry pending</span>
      </div>
    );
  }
  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
      crossOrigin="anonymous"
      onError={(e) => {
        imageDiagnostics.lastError = `${src}: ${(e.target as HTMLImageElement).src}`;
        setFailed(true);
      }}
    />
  );
};

// Normalize stage_directions to array (CMS sometimes sends string)
const normalizeStageDirections = (line: any): string[] => {
  if (!line) return [];
  const sd = line.stage_directions;
  if (sd === null || sd === undefined) return [];
  if (typeof sd === 'string') return sd.trim() ? [sd] : [];
  if (Array.isArray(sd)) return sd;
  return [];
};

// ===================== HEADER =====================
const Header = ({ showGearIcon, showNextScenario, doneCount, dueCount, newCount, leftCount, episodesUnplayed, dateshift, showDateshift, onTapGear, onTapNextScenario }: {
  showGearIcon: boolean;
  showNextScenario: boolean;
  doneCount: number;
  dueCount: number;
  newCount: number;
  leftCount: number;
  episodesUnplayed: number;
  dateshift: number;
  showDateshift: boolean;
  onTapGear: () => void;
  onTapNextScenario: () => void;
}) => {
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const now = new Date();
  const dayName = days[now.getDay()];
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400">{dayName}</span>
          <span className="text-green-600 dark:text-green-400 font-bold">Ep: {episodesUnplayed}</span>
          <span className="text-amber-600 dark:text-amber-400 font-bold">Due: {dueCount}</span>
          <span className="text-blue-600 dark:text-blue-400 font-bold">New: {newCount}</span>
          <span className="text-slate-500 dark:text-slate-400">Left: {leftCount}</span>
          {showDateshift && <span className="text-purple-600 dark:text-purple-400 font-bold">+{dateshift}d</span>}
        </div>
        <div className="flex gap-2">
          {showNextScenario && (
            <button onClick={onTapNextScenario} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">FF &gt;&gt;</button>
          )}
          {showGearIcon && (
            <button onClick={onTapGear} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xl leading-none">⚙️</button>
          )}
        </div>
      </div>
    </header>
  );
};

// ===================== TOAST =====================
const ToastNotification = ({ toast, onClear }: { toast: string; onClear: () => void }) => {
  React.useEffect(() => {
    const t = setTimeout(onClear, 5000);
    return () => clearTimeout(t);
  }, [toast, onClear]);
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4">
      <div className="bg-amber-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm flex-1">{toast}</p>
        <button onClick={onClear} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
};

// ===================== QUIZ CARD =====================
const QuizCard = ({ currentCard, showingAnswer, schedulePreview, currentActTag, quizCardDueDate, onShowAnswer, onRateCard, onSpeakThai, onSpeakCard }: {
  currentCard: Card | null;
  showingAnswer: boolean;
  schedulePreview: ViewProps['schedulePreview'];
  currentActTag: string | null;
  quizCardDueDate: string | null;
  onShowAnswer: () => void;
  onRateCard: (cardId: string, quality: number) => void;
  onSpeakThai: (text: string) => void;
  onSpeakCard: () => void;
}) => {
  if (!currentCard) {
    return (
      <div className="max-w-md mx-auto text-center p-8">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">All caught up!</h2>
        <p className="text-slate-600 dark:text-slate-400">No cards due for review right now.</p>
      </div>
    );
  }

  const isThaiScript = (text: string) => /[\u0E00-\u0E7F]/.test(text);
  const speakText = currentCard.direction === 'thai-eng' ? currentCard.front : currentCard.back;

  return (
    <div className="max-w-md mx-auto">
      {(currentActTag || quizCardDueDate) && (
        <div className="text-center mb-2">
          {currentActTag && <span className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wider">{currentActTag}</span>}
          {quizCardDueDate && <span className="text-xs text-slate-500 ml-2">({quizCardDueDate})</span>}
        </div>
      )}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 text-center min-h-[16rem] flex flex-col justify-center">
        <p className={`text-3xl mb-4 ${isThaiScript(currentCard.front) ? 'font-medium' : ''}`}>{currentCard.front}</p>
        {showingAnswer ? (
          <>
            <p className={`text-2xl text-amber-600 dark:text-amber-400 mb-2 ${isThaiScript(currentCard.back) ? 'font-medium' : ''}`}>{currentCard.back}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{currentCard.phonetics}</p>
          </>
        ) : (
          <p className="text-slate-400 dark:text-slate-500 text-lg">?</p>
        )}
      </div>

      <div className="mt-4">
        {!showingAnswer ? (
          <div className="flex gap-2">
            <button onClick={onShowAnswer} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors">Show Answer</button>
            <button onClick={onSpeakCard} className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl transition-colors">
              <Volume2 className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => onRateCard(currentCard.id, 1)} className="py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors">
              <div className="font-semibold text-sm">Again</div>
              <div className="text-[10px] opacity-80">{schedulePreview ? (schedulePreview.againIsDelay ? `${schedulePreview.again}c` : `${schedulePreview.again}d`) : ''}</div>
            </button>
            <button onClick={() => onRateCard(currentCard.id, 3)} className="py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors">
              <div className="font-semibold text-sm">Hard</div>
              <div className="text-[10px] opacity-80">{schedulePreview ? `${schedulePreview.hard}d` : ''}</div>
            </button>
            <button onClick={() => onRateCard(currentCard.id, 4)} className="py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors">
              <div className="font-semibold text-sm">Good</div>
              <div className="text-[10px] opacity-80">{schedulePreview ? `${schedulePreview.good}d` : ''}</div>
            </button>
            <button onClick={() => onRateCard(currentCard.id, 5)} className="py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
              <div className="font-semibold text-sm">Easy</div>
              <div className="text-[10px] opacity-80">{schedulePreview ? `${schedulePreview.easy}d` : ''}</div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ===================== LINE CARD =====================
const LineCard = ({ line, character, place, isNarrator, cmsBaseUrl }: {
  line: any;
  character: any;
  place: any;
  isNarrator: boolean;
  cmsBaseUrl: string;
}) => {
  const stageDirections = normalizeStageDirections(line);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const speakLine = () => {
    if (!line.dialogue) return;
    if ('speechSynthesis' in window) {
      if (isPlaying && !isPaused) {
        window.speechSynthesis.pause();
        setIsPaused(true);
      } else if (isPaused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
      } else {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(line.dialogue);
        utterance.lang = 'th-TH';
        utterance.rate = 0.8;
        utterance.onend = () => { setIsPlaying(false); setIsPaused(false); };
        utterance.onerror = () => { setIsPlaying(false); setIsPaused(false); };
        window.speechSynthesis.speak(utterance);
        setIsPlaying(true);
        setIsPaused(false);
      }
    }
  };

  const getBorderColor = () => {
    if (isNarrator) return 'border-slate-300 dark:border-slate-700';
    if (character?.id === 'narrator') return 'border-amber-500 dark:border-amber-600';
    return 'border-blue-500 dark:border-blue-600';
  };

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow border-l-4 ${getBorderColor()}`}>
      {stageDirections.length > 0 && (
        <div className="mb-3 text-xs text-slate-500 dark:text-slate-400 italic">
          {stageDirections.map((sd: string, i: number) => <p key={i}>🎬 {sd}</p>)}
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {!isNarrator && character && (
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
              {character.name || line.character}
            </p>
          )}
          {line.dialogue && (
            <p className="text-lg text-slate-900 dark:text-white leading-relaxed">{line.dialogue}</p>
          )}
        </div>
        {line.dialogue && (
          <button onClick={speakLine} className="flex-shrink-0 p-2 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
            <Volume2 className="w-5 h-5" />
          </button>
        )}
      </div>
      <div className="flex gap-3 mt-3">
        {place && place.picture && (
          <div className="flex-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Place</p>
            <CachedImage src={place.picture.startsWith('/') ? `${cmsBaseUrl}${place.picture}` : place.picture} alt={place.name || 'place'} className="w-full h-24 object-cover rounded-lg" fallbackIcon="🏞️" />
            <p className="text-xs text-slate-500 mt-1">{place.name}</p>
          </div>
        )}
        {character && character.picture && (
          <div className="flex-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Character</p>
            <CachedImage src={character.picture.startsWith('/') ? `${cmsBaseUrl}${character.picture}` : character.picture} alt={character.name || 'character'} className="w-full h-24 object-cover rounded-lg" fallbackIcon="👤" />
            <p className="text-xs text-slate-500 mt-1">{character.name}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ===================== CHOICE CARD =====================
const ChoiceCard = ({ decision, subplots, cmsBaseUrl, onTapChoice }: {
  decision: any;
  subplots: Record<string, any>;
  cmsBaseUrl: string;
  onTapChoice: (index: number) => void;
}) => {
  if (!decision) return <div className="text-center p-4 text-slate-500">No decision</div>;
  const line = decision.line;
  const character = line?.character;
  const place = line?.place;
  const stageDirections = normalizeStageDirections(line);
  const diffLabels = ['Easy', 'Medium', 'Hard'];
  const diffColors = ['bg-green-600 hover:bg-green-700', 'bg-amber-600 hover:bg-amber-700', 'bg-red-600 hover:bg-red-700'];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow">
      {line && (
        <div className="mb-4">
          {stageDirections.length > 0 && (
            <div className="mb-2 text-xs text-slate-500 dark:text-slate-400 italic">
              {stageDirections.map((sd: string, i: number) => <p key={i}>🎬 {sd}</p>)}
            </div>
          )}
          {line.dialogue && <p className="text-lg text-slate-900 dark:text-white">{line.dialogue}</p>}
        </div>
      )}
      <div className="space-y-2">
        {decision.choices && decision.choices.map((choice: any, i: number) => {
          const diff = typeof choice.difficulty === 'number' && choice.difficulty >= 0 && choice.difficulty <= 2 ? choice.difficulty : Math.min(i, 2);
          const subplotKey = choice.pass_outcome?.subplot;
          const subplotName = subplotKey && subplots[subplotKey] ? subplots[subplotKey].name : subplotKey;
          return (
            <button key={i} onClick={() => onTapChoice(i)}
              className={`w-full text-left px-4 py-3 rounded-xl text-white transition-colors ${diffColors[diff]}`}>
              <div className="flex items-center justify-between">
                <span>{choice.text}</span>
                <span className="text-[10px] opacity-70 ml-2 flex-shrink-0">{diffLabels[diff]}{subplotName ? ` • ${subplotName}` : ''}</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 mt-3 text-center">Choose wisely — your choice affects the story!</p>
    </div>
  );
};

// ===================== FOOTER =====================
const Footer = ({ subplotScores, subplots }: { subplotScores: Record<string, number>; subplots: Record<string, any> }) => {
  const keys = Object.keys(subplots);
  if (keys.length === 0) return null;
  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-4 py-2">
      <div className="max-w-4xl mx-auto flex justify-around">
        {keys.map((key) => {
          const score = subplotScores[key] || 0;
          const name = subplots[key]?.name || key.replace('subplot_', '');
          const picture = subplots[key]?.picture;
          return (
            <div key={key} className="flex flex-col items-center">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">{name}</span>
              <span className={`text-sm font-bold ${score > 0 ? 'text-green-600 dark:text-green-400' : score < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>{score}</span>
            </div>
          );
        })}
      </div>
    </footer>
  );
};

// ===================== SETTINGS DRAWER =====================
const SettingsDrawer = ({ isOpen, dateshift, cmsBaseUrl, onClose, onCheckForUpdates, onCheckForNewContent, onExportState, onImportState, onIncrementDateshift, onDecrementDateshift, onTapResetState, onChangeCmsBase, mostOverdueCardInfo, nextEpisodeInfo }: {
  isOpen: boolean;
  dateshift: number;
  cmsBaseUrl: string;
  onClose: () => void;
  onCheckForUpdates: () => void;
  onCheckForNewContent: () => void;
  onExportState: () => void;
  onImportState: (content: string) => void;
  onIncrementDateshift: () => void;
  onDecrementDateshift: () => void;
  onTapResetState: () => void;
  onChangeCmsBase: (url: string) => void;
  m