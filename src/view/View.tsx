// View.tsx - React components for Thai RPG PWA
import React, { useRef, useEffect } from 'react';
import {
  Settings, RefreshCw, Download, Upload, X,
  Plus, Minus, Trash2, AlertTriangle,
  Eye, ChevronRight, FastForward, Volume2,
  Image,
} from 'lucide-react';
import type { ViewProps } from '../types';

// ===================== CACHED IMAGE (SW cache, not blob URLs) =====================
//
// Images are cached by the Service Worker (CORS mode, non-opaque responses).
// We use the ORIGINAL URL — the SW intercepts the request and serves from cache
// when offline. Blob URLs are NOT used because they're in-memory only and get
// garbage-collected when the app is backgrounded on mobile.
//
// Diagnostic state tracks image health for debugging backgrounding issues.

// Global image diagnostics — exported for use by ImageCacheDiagnostics
export const imageDiagnostics: {
  lastHidden?: number;
  lastShown?: number;
  brokenImages: string[];
  retryCount: number;
  lastError?: string;
} = {
  brokenImages: [],
  retryCount: 0,
};

// Track visibility changes to diagnose image issues.
// When returning from background, mobile browsers may have discarded
// in-memory image data. We trigger a retry on all CachedImage components.
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

const CachedImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  // Use the original URL. The Service Worker serves from cache when offline.
  // crossorigin="anonymous" ensures CORS headers are present so the SW
  // caches a non-opaque response that can be decoded when served offline.
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // Listen for global retry signal (triggered on visibilitychange).
  // This is the key fix: when the app returns from background, we retry
  // loading images that previously failed. Without this, a failed image
  // stays as a placeholder forever because the SW cache may now have
  // the image (it was fetched by prefetchImages after the initial failure).
  React.useEffect(() => {
    const handleRetry = () => {
      if (loadFailed) {
        imageDiagnostics.retryCount++;
        setLoadFailed(false);
        setRetryKey((k) => k + 1);
      }
    };
    window.addEventListener('thai-rpg-retry-images', handleRetry);
    return () => window.removeEventListener('thai-rpg-retry-images', handleRetry);
  }, [loadFailed]);

  // If load failed, show placeholder — but ONLY until the next retry.
  // The visibilitychange handler will trigger a retry.
  if (loadFailed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-700 relative">
        <span className="text-3xl">🖼️</span>
        {/* Subtle retry indicator */}
        <span className="absolute bottom-1 right-1 text-[9px] text-slate-500">retry pending</span>
      </div>
    );
  }

  return (
    <img
      key={retryKey}
      ref={imgRef}
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      crossOrigin="anonymous"
      onError={() => {
        imageDiagnostics.lastError = `Failed to load: ${src}`;
        imageDiagnostics.brokenImages.push(src);
        setLoadFailed(true);
      }}
    />
  );
};

// ===================== TOAST NOTIFICATION (auto-dismiss) =====================

const ToastNotification: React.FC<{ toast: string; onClear: () => void }> = ({ toast, onClear }) => {
  useEffect(() => {
    const timer = setTimeout(() => onClear(), 5000);
    return () => clearTimeout(timer);
  }, [toast, onClear]);

  return (
    <div className="fixed top-16 left-4 right-4 z-50 bg-amber-100 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-700 rounded-xl p-3 shadow-lg flex items-center justify-between">
      <p className="text-sm text-amber-800 dark:text-amber-200">{toast}</p>
      <button onClick={onClear}
        className="ml-2 p-1 hover:bg-amber-200 dark:hover:bg-amber-800 rounded transition-colors">
        <X className="w-4 h-4 text-amber-700 dark:text-amber-300" />
      </button>
    </div>
  );
};

// ===================== HEADER =====================

const Header: React.FC<{
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
}> = ({ showGearIcon, showNextScenario, doneCount, dueCount, newCount, leftCount, episodesUnplayed, dateshift, showDateshift, onTapGear, onTapNextScenario }) => (
  <header className="fixed top-0 left-0 right-0 h-14 bg-white dark:bg-slate-900 flex items-center justify-between px-2 z-40 shadow-md">
    {/* Left: Next Scenario button */}
    <div className="flex items-center">
      {showNextScenario && (
        <button onClick={onTapNextScenario} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Next scenario" title="Next scenario">
          <FastForward className="w-6 h-6 text-slate-700 dark:text-slate-300" />
        </button>
      )}
    </div>
    {/* Center: Stats */}
    <div className="flex-1 flex items-center justify-center gap-2 text-xs flex-wrap">
      <span className="text-slate-500">Done:<span className="text-green-600 dark:text-green-400 ml-1">{doneCount}</span></span>
      <span className="text-slate-500">Due:<span className="text-yellow-600 dark:text-yellow-400 ml-1">{dueCount}</span></span>
      <span className="text-slate-500">New:<span className="text-blue-600 dark:text-blue-400 ml-1">{newCount}</span></span>
      <span className="text-slate-500">Left:<span className="text-purple-600 dark:text-purple-400 ml-1">{leftCount}</span></span>
      {episodesUnplayed > 0 && (
        <span className="text-slate-500">Ep:<span className="text-pink-600 dark:text-pink-400 ml-1">{episodesUnplayed}</span></span>
      )}
      {showDateshift && <span className="text-slate-500">Shift:<span className="text-orange-600 dark:text-orange-400 ml-1">{dateshift}</span></span>}
    </div>
    {/* Right: Settings gear */}
    {showGearIcon && (
      <button onClick={onTapGear} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Open settings">
        <Settings className="w-6 h-6 text-slate-700 dark:text-slate-300" />
      </button>
    )}
  </header>
);

// ===================== INFO CARD (Place / Character) =====================

const InfoCard: React.FC<{
  label: string;
  name: string;
  description?: string;
  picture?: string;
  cmsBaseUrl: string;
}> = ({ label, name, description, picture, cmsBaseUrl }) => {
  if (!name) return null;
  const imgUrl = picture && picture.startsWith('/') ? `${cmsBaseUrl}${picture}` : picture;
  return (
    <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
      {/* Label header */}
      <div className="px-3 py-2 bg-slate-200/50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
        <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</p>
      </div>
      <div className="w-full aspect-[4/3] bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
        {imgUrl ? (
          <CachedImage src={imgUrl} alt={name} />
        ) : (
          <span className="text-3xl">{label === 'Place' ? '📍' : '👤'}</span>
        )}
      </div>
      <div className="p-3 flex flex-col items-center text-center flex-1">
        <p className="text-base font-semibold text-amber-600 dark:text-amber-300">{name}</p>
        {description && (
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{description}</p>
        )}
      </div>
    </div>
  );
};

// ===================== LINE CARD =====================

const LineCard: React.FC<{
  line: any;
  character: any;
  place: any;
  isNarrator: boolean;
  cmsBaseUrl: string;
}> = ({ line, character, place, isNarrator, cmsBaseUrl }) => {
  if (!line) return null;
  let dialogue = line.dialogue || '';
  const charMatch = dialogue.match(/^(?:char_)?([\w\s]+):\s*(.+)$/);
  const dialogueText = charMatch ? charMatch[2] : dialogue;

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      {(() => {
        const sd = line.stage_directions;
        if (!sd) return null;
        const arr = Array.isArray(sd) ? sd : (typeof sd === 'string' && sd.trim() ? [sd] : []);
        if (arr.length === 0) return null;
        return (
          <div className="w-full mb-3 p-3 bg-slate-100/60 dark:bg-slate-800/60 rounded-lg border-l-2 border-amber-500">
            {arr.map((s: string, i: number) => (
              <p key={i} className="text-amber-700/80 dark:text-amber-300/80 text-sm italic">{s}</p>
            ))}
          </div>
        );
      })()}

      <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-5 mb-4">
        <p className="text-lg text-slate-900 dark:text-white leading-relaxed">{dialogueText}</p>
      </div>

      {!isNarrator && (place || character) && (
        <div className="w-full flex gap-3">
          {place && (
            <InfoCard label="Place" name={place.name} description={place.description} picture={place.picture} cmsBaseUrl={cmsBaseUrl} />
          )}
          {character && (
            <InfoCard label="Character" name={character.name} description={character.description} picture={character.picture} cmsBaseUrl={cmsBaseUrl} />
          )}
        </div>
      )}
    </div>
  );
};

// ===================== CHOICE CARD =====================

const ChoiceCard: React.FC<{
  decision: any;
  subplots: Record<string, any>;
  cmsBaseUrl: string;
  onTapChoice: (index: number) => void;
}> = ({ decision, subplots, cmsBaseUrl, onTapChoice }) => {
  if (!decision) return null;
  return (
    <div className="w-full max-w-md mx-auto">
      {decision.line && (
        <LineCard line={decision.line} character={null} place={null} isNarrator={true} cmsBaseUrl={cmsBaseUrl} />
      )}
      <div className="space-y-3 mt-4">
        {decision.choices?.map((choice: any, i: number) => {
          const outcomeSubplot = choice.pass_outcome?.subplot
            ? (subplots[choice.pass_outcome.subplot]?.name || choice.pass_outcome.subplot).replace('subplot_', '')
            : null;
          return (
            <button key={i} onClick={() => onTapChoice(i)}
              className="w-full p-4 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:border-amber-500 rounded-xl transition-colors text-left">
              <div className="flex items-center justify-between">
                <span className="text-slate-900 dark:text-white font-medium">{choice.description}</span>
                <ChevronRight className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                {choice.difficulty !== undefined && (
                  <span className="text-[10px] px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full capitalize">
                    {['easy', 'medium', 'hard'][choice.difficulty] || choice.difficulty}
                  </span>
                )}
                {outcomeSubplot && (
                  <span className="text-[10px] px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                    {outcomeSubplot}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ===================== QUIZ CARD =====================

const QuizCard: React.FC<{
  currentCard: any;
  showingAnswer: boolean;
  schedulePreview: any;
  currentActTag: string | null;
  quizCardDueDate: string | null;
  onShowAnswer: () => void;
  onRateCard: (cardId: string, quality: number) => void;
  onSpeakThai: (text: string) => void;
  onSpeakCard: () => void;
}> = ({ currentCard, showingAnswer, schedulePreview, currentActTag, quizCardDueDate, onShowAnswer, onRateCard, onSpeakThai, onSpeakCard }) => {
  if (!currentCard) {
    return (
      <div className="text-center p-8">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">All Caught Up!</h2>
        <p className="text-slate-600 dark:text-slate-400">No cards due for review.</p>
      </div>
    );
  }

  const isThaiFront = currentCard.direction === 'thai-eng';

  React.useEffect(() => {
    if (!currentCard) return;
    if (isThaiFront && currentCard.front) onSpeakThai(currentCard.front);
  }, [currentCard.id]);

  React.useEffect(() => {
    if (!currentCard || !showingAnswer) return;
    if (!isThaiFront && currentCard.back) onSpeakThai(currentCard.back);
  }, [showingAnswer]);

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      <div className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-200 dark:bg-slate-700 border-b border-slate-300 dark:border-slate-600">
          <button onClick={onSpeakCard}
            className="p-1.5 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors" title="Replay pronunciation">
            <Volume2 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
          <div className="flex items-center gap-2">
            {currentActTag && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">{currentActTag}</span>
            )}
            {quizCardDueDate && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                quizCardDueDate === 'New card' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                quizCardDueDate.includes('again') ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' :
                'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
              }`}>{quizCardDueDate}</span>
            )}
          </div>
        </div>
        <div className="p-6 min-h-[120px] flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{currentCard.front}</p>
            {showingAnswer && (
              <div className="mt-4 pt-4 border-t border-slate-300 dark:border-slate-600">
                <p className="text-xl text-green-600 dark:text-green-400 mb-2">{currentCard.back}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {!showingAnswer ? (
        <button onClick={onShowAnswer}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          <Eye className="w-5 h-5" /> Show Answer
        </button>
      ) : (
        <div className="w-full grid grid-cols-4 gap-2">
          {(['again', 'hard', 'good', 'easy'] as const).map((rating) => (
            <button key={rating}
              onClick={() => onRateCard(currentCard.id, rating === 'again' ? 1 : rating === 'hard' ? 3 : rating === 'good' ? 4 : 5)}
              className={`py-2 px-1 rounded-xl text-white font-semibold text-xs leading-tight transition-colors ${
                rating === 'again' ? 'bg-red-600 hover:bg-red-700' :
                rating === 'hard' ? 'bg-orange-600 hover:bg-orange-700' :
                rating === 'good' ? 'bg-blue-600 hover:bg-blue-700' :
                'bg-green-600 hover:bg-green-700'
              }`}>
              <div className="capitalize">{rating}</div>
              <div className="text-white/70 text-[10px]">
                {schedulePreview ? (rating === 'again' && schedulePreview.againIsDelay ? `${schedulePreview.again} cards` : `${schedulePreview[rating]}d`) : '-'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ===================== FOOTER =====================

const Footer: React.FC<{
  subplotScores: Record<string, number>;
  subplots: Record<string, any>;
}> = ({ subplotScores, subplots }) => {
  const allSubplotIds = Object.keys(subplots);
  if (allSubplotIds.length === 0) return null;
  return (
    <footer className="fixed bottom-12 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 z-40">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
        {allSubplotIds.map((id) => {
          const score = subplotScores[id] || 0;
          const compactName = (subplots[id]?.name || id).replace(/^subplot_/, '').replace(/^The /, '').replace(/'/g, '');
          return (
            <span key={id} className="text-slate-600 dark:text-slate-400">
              {compactName}:<span className={`ml-0.5 font-bold ${score > 0 ? 'text-green-600 dark:text-green-400' : score < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-600'}`}>{score > 0 ? '+' : ''}{score}</span>
            </span>
          );
        })}
      </div>
    </footer>
  );
};

// ===================== SETTINGS DRAWER =====================

interface SettingsDrawerProps {
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
  mostOverdueCardInfo: any;
  nextEpisodeInfo: any;
}

const SettingsDrawer = ({ isOpen, dateshift, cmsBaseUrl, onClose, onCheckForUpdates, onCheckForNewContent, onExportState, onImportState, onIncrementDateshift, onDecrementDateshift, onTapResetState, onChangeCmsBase, mostOverdueCardInfo, nextEpisodeInfo }: SettingsDrawerProps) => {
  const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackdropClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onload = (ev) => onImportState(ev.target?.result as string); reader.readAsText(file); }
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={handleBackdropClick}>
      <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-2"><div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 pb-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><X className="w-5 h-5 text-slate-600 dark:text-slate-400" /></button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Dateshift (debugging)</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={onDecrementDateshift} className="p-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg"><Minus className="w-5 h-5 text-slate-900 dark:text-white" /></button>
            <span className="text-2xl font-bold text-slate-900 dark:text-white w-12 text-center">{dateshift}</span>
            <button onClick={onIncrementDateshift} className="p-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg"><Plus className="w-5 h-5 text-slate-900 dark:text-white" /></button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">CMS Base URL</p>
          <input type="url" value={cmsBaseUrl} onChange={(e) => onChangeCmsBase(e.target.value)} placeholder="https://..."
            className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>

        <div className="p-4 space-y-3">
          <button onClick={onCheckForNewContent} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-left">
            <RefreshCw className="w-5 h-5 text-purple-600 dark:text-purple-400" /><span className="text-slate-900 dark:text-white">Check for New Content</span>
          </button>
          <button onClick={onCheckForUpdates} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-left">
            <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" /><span className="text-slate-900 dark:text-white">Check for updates</span>
          </button>
          <button onClick={onExportState} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-left">
            <Download className="w-5 h-5 text-green-600 dark:text-green-400" /><span className="text-slate-900 dark:text-white">Export state</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-left">
            <Upload className="w-5 h-5 text-orange-600 dark:text-orange-400" /><span className="text-slate-900 dark:text-white">Import state</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".md" onChange={handleFileSelect} className="hidden" />
          <button onClick={onTapResetState} className="w-full flex items-center gap-3 px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-left text-white font-semibold">
            <Trash2 className="w-5 h-5" /> Reset State
          </button>
        </div>

        {/* Episode Selection Diagnostics */}
        <div className="mx-4 mb-4 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <button onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Episode Selection Diagnostics</span>
            <span className="text-slate-500 dark:text-slate-400">{diagnosticsOpen ? '▾' : '▸'}</span>
          </button>
          {diagnosticsOpen && (
            <div className="px-4 py-3 bg-white dark:bg-slate-800 text-sm space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Most overdue card</p>
                {mostOverdueCardInfo ? (
                  <div className="space-y-1">
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{mostOverdueCardInfo.front}</span>
                      {mostOverdueCardInfo.isAgain && <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded">AGAIN</span>}
                      {mostOverdueCardInfo.isNew && <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded">NEW</span>}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Due: {mostOverdueCardInfo.isNew ? 'New card' : mostOverdueCardInfo.isAgain ? 'Due now (again)' : `Day ${mostOverdueCardInfo.dueDate}`}</p>
                    {mostOverdueCardInfo.tags.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Tags: {mostOverdueCardInfo.tags.join(', ')}</p>}
                  </div>
                ) : <p className="text-slate-500 dark:text-slate-400 italic">No cards available</p>}
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
                <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Next episode</p>
                {nextEpisodeInfo ? (
                  <div className="space-y-1">
                    <p className="text-slate-700 dark:text-slate-300 font-medium">{nextEpisodeInfo.title}</p>
                    <div className="flex flex-wrap gap-1">
                      {nextEpisodeInfo.acts.map((act: any) => (
                        <span key={act.actIndex} className="text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">Act {act.actIndex}: {act.tag}</span>
                      ))}
                    </div>
                  </div>
                ) : <p className="text-slate-500 dark:text-slate-400 italic">No episodes available</p>}
              </div>
            </div>
          )}
        </div>

        {/* Image Cache Diagnostics */}
        <ImageCacheDiagnostics />

        <div className="px-4 pb-6 text-center">
          <p className="text-sm text-slate-500">Swipe down to close</p>
        </div>
      </div>
    </div>
  );
};

// ===================== IMAGE CACHE DIAGNOSTICS =====================

const ImageCacheDiagnostics: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [swCacheList, setSwCacheList] = React.useState<string>('checking...');
  const [contentCacheList, setContentCacheList] = React.useState<string>('checking...');
  const [swStats, setSwStats] = React.useState<Record<string, any>>({});
  const [swCacheUrls, setSwCacheUrls] = React.useState<string[]>([]);
  const [diagInfo, setDiagInfo] = React.useState<Record<string, any>>({});

  const refreshDiagnostics = React.useCallback(async () => {
    try {
      const cacheNames = await caches.keys();
      const contentCacheName = cacheNames.find((n) => n.includes('thai-rpg-content'));
      if (contentCacheName) {
        const cache = await caches.open(contentCacheName);
        const keys = await cache.keys();
        setContentCacheList(keys.map((r) => r.url).join(', ') || 'empty');
      } else {
        setContentCacheList('NO content cache');
      }
      const swCacheName = cacheNames.find((n) => n.includes('thai-rpg') && !n.includes('content'));
      if (swCacheName) {
        const cache = await caches.open(swCacheName);
        const keys = await cache.keys();
        const imgs = keys.filter((r) => r.url.match(/\.(png|jpg|jpeg)$/));
        setSwCacheList(`${imgs.length} images (total ${keys.length})`);
        setSwCacheUrls(keys.map((r) => r.url));
      } else {
        setSwCacheList('NO SW cache');
      }
    } catch (e: any) {
      setSwCacheList('Err: ' + e.message);
    }
    try {
      const ctrl = navigator.serviceWorker?.controller;
      if (ctrl) {
        const p1 = new Promise<Record<string, any>>((res) => {
          const h = (ev: MessageEvent) => { if (ev.data?.type === 'SW_STATS') { navigator.serviceWorker.removeEventListener('message', h); res(ev.data.stats); } };
          navigator.serviceWorker.addEventListener('message', h);
          ctrl.postMessage('GET_SW_STATS');
          setTimeout(() => res({}), 2000);
        });
        const p2 = new Promise<string[]>((res) => {
          const h = (ev: MessageEvent) => { if (ev.data?.type === 'SW_CACHE_LIST') { navigator.serviceWorker.removeEventListener('message', h); res(ev.data.urls || []); } };
          navigator.serviceWorker.addEventListener('message', h);
          ctrl.postMessage('GET_SW_CACHE_LIST');
          setTimeout(() => res([]), 2000);
        });
        const [s, u] = await Promise.all([p1, p2]);
        setSwStats(s);
        if (u.length) setSwCacheUrls(u);
      }
    } catch (e: any) {
      setSwStats({ err: e.message });
    }
    setDiagInfo({
      lastHidden: imageDiagnostics.lastHidden ? new Date(imageDiagnostics.lastHidden).toISOString() : 'never',
      lastShown: imageDiagnostics.lastShown ? new Date(imageDiagnostics.lastShown).toISOString() : 'never',
      retryCount: imageDiagnostics.retryCount,
      brokenImages: imageDiagnostics.brokenImages,
      lastError: imageDiagnostics.lastError,
      swController: !!navigator.serviceWorker?.controller,
      online: navigator.onLine,
    });
  }, []);

  React.useEffect(() => { if (open) refreshDiagnostics(); }, [open, refreshDiagnostics]);

  return (
    <div className="mx-4 mb-4 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Image Cache Diagnostics</span>
        <span className="text-slate-500 dark:text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 bg-white dark:bg-slate-800 text-sm space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Content Cache</p>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-mono break-all">{contentCacheList}</p>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">SW Cache</p>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-mono">{swCacheList}</p>
            {swCacheUrls.length > 0 && (
              <details className="mt-1"><summary className="text-[10px] text-slate-500 cursor-pointer">{swCacheUrls.length} URLs</summary>
                <ul className="text-[9px] text-slate-500 font-mono max-h-24 overflow-y-auto">{swCacheUrls.map((u, i) => <li key={i}>{u}</li>)}</ul>
              </details>
            )}
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">SW Internal Stats</p>
            <pre className="text-[10px] text-slate-500 dark:text-slate-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(swStats, null, 2)}</pre>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Image Diagnostics</p>
            <pre className="text-[10px] text-slate-500 dark:text-slate-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(diagInfo, null, 2)}</pre>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.dispatchEvent(new CustomEvent('thai-rpg-retry-images'))} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg text-xs transition-colors">
              <Image className="w-4 h-4" /> Retry Images
            </button>
            <button onClick={refreshDiagnostics} className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ===================== MAIN VIEW =====================

export const View: React.FC<ViewProps> = (props) => {
  // Wrap in try/catch to prevent crashes
  try {
    return <ViewInner {...props} />;
  } catch (e: any) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Something went wrong</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">{e?.message || 'Unknown error'}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">Reload</button>
        </div>
      </div>
    );
  }
};

const ViewInner: React.FC<ViewProps> = (props) => {
  const showGearIcon = props.showGearIcon ?? true;
  const isSettingsOpen = props.isSettingsOpen ?? false;
  const showResetConfirm = props.showResetConfirm ?? false;
  const showDateshift = props.showDateshift ?? false;
  const dateshift = props.dateshift ?? 0;
  const doneCount = props.doneCount ?? 0;
  const dueCount = props.dueCount ?? 0;
  const newCount = props.newCount ?? 0;
  const leftCount = props.leftCount ?? 0;
  const episodesUnplayed = props.episodesUnplayed ?? 0;
  const currentView = props.currentView ?? 'welcome';
  const currentCard = props.currentCard ?? null;
  const currentLine = props.currentLine ?? null;
  const currentCharacter = props.currentCharacter ?? null;
  const currentPlace = props.currentPlace ?? null;
  const currentAct = props.currentAct ?? null;
  const isNarrator = props.isNarrator ?? false;
  const showingAnswer = props.showingAnswer ?? false;
  const schedulePreview = props.schedulePreview ?? null;
  const showVocabReview = props.showVocabReview ?? false;
  const currentDecision = props.currentDecision ?? null;
  const actPhase = props.actPhase ?? 'lines_before';
  const subplotScores = props.subplotScores ?? {};
  const subplots = props.subplots ?? {};
  const getHandler = props.getHandler;
  const cmsBaseUrl = props.cmsBaseUrl ?? 'https://q4kgqw3jj72wa.kimi.page';
  const toast = props.toast ?? null;

  const onSpeakThai = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'th-TH'; u.rate = 0.8;
      window.speechSynthesis.speak(u);
    }
  };

  const hasFooter = Object.keys(subplots).length > 0;
  const outcomePassed = props.outcomePassed;
  const outcomeDelta = props.outcomeDelta;
  const outcomeSubplot = props.outcomeSubplot;

  return (
    <div className={`min-h-screen bg-slate-100 dark:bg-slate-950 ${hasFooter ? 'pb-20' : ''}`}>
      <Header showGearIcon={showGearIcon} showNextScenario={currentView === 'episode'}
        doneCount={doneCount} dueCount={dueCount} newCount={newCount}
        leftCount={leftCount} episodesUnplayed={episodesUnplayed} dateshift={dateshift} showDateshift={showDateshift}
        onTapGear={getHandler('onTapGear')} onTapNextScenario={getHandler('onTapNextScenario')} />

      {toast && <ToastNotification toast={toast} onClear={() => getHandler('onClearToast')()} />}

      <main className="pt-16 p-4">
        {currentView === 'welcome' && (
          <div className="max-w-md mx-auto mt-8 text-center">
            <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-lg">
              {props.debugMessage && <div className="mb-4 p-2 bg-green-900/50 rounded text-xs text-green-300 font-mono">{props.debugMessage}</div>}
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Welcome to Thai RPG</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">Learn Thai language through an epic RPG adventure!</p>
              <svg viewBox="0 0 64 64" className="w-20 h-20 mx-auto mb-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M32 4 L32 12" /><path d="M24 12 L40 12" /><path d="M20 20 L44 20 L40 12 L24 12 Z" />
                <path d="M16 28 L48 28 L44 20 L20 20 Z" /><path d="M12 36 L52 36 L48 28 L16 28 Z" />
                <path d="M8 44 L56 44 L52 36 L12 36 Z" /><rect x="20" y="44" width="8" height="12" />
                <rect x="36" y="44" width="8" height="12" /><path d="M4 56 L60 56" />
              </svg>
              <button onClick={getHandler('onStartEpisode')} className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors mb-3">Start Episode</button>
              <p className="text-sm text-slate-500 mt-2">{leftCount} cards ready to learn</p>
            </div>
          </div>
        )}

        {currentView === 'episode' && !currentAct && (
          <div className="max-w-md mx-auto mt-8 text-center">
            <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl">
              <div className="text-6xl mb-4">📖</div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Loading Episode...</h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm">Episode data is being loaded. Please wait a moment.</p>
              <button onClick={getHandler('onStartEpisode')} className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors">Retry</button>
            </div>
          </div>
        )}

        {currentView === 'episode' && (
          <div className="max-w-md mx-auto">
            {(actPhase === 'lines_before' || actPhase === 'lines_after') && (
              <>
                {currentLine ? (
                  <LineCard line={currentLine} character={currentCharacter} place={currentPlace} isNarrator={isNarrator} cmsBaseUrl={cmsBaseUrl} />
                ) : <div className="text-center p-4 text-slate-500">No line to display</div>}
                <button onClick={getHandler('onTapNextLine')} className="w-full py-3 mt-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">Next <ChevronRight className="w-5 h-5" /></button>
              </>
            )}

            {showVocabReview && (
              <>
                <div className="text-center mb-3"><p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wider">Vocab Review</p></div>
                <QuizCard currentCard={currentCard} showingAnswer={showingAnswer} schedulePreview={schedulePreview}
                  currentActTag={props.currentActTag || null} quizCardDueDate={props.quizCardDueDate || null}
                  onShowAnswer={getHandler('onShowAnswer')} onRateCard={(id, q) => getHandler('onRateCard')(id, q)}
                  onSpeakThai={onSpeakThai} onSpeakCard={getHandler('onSpeakCard')} />
                {!showingAnswer && currentCard && (
                  <button onClick={getHandler('onVocabReviewDone')} className="w-full mt-4 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-300 text-sm transition-colors">Skip to Next (no new/due cards)</button>
                )}
                {showingAnswer && (
                  <button onClick={getHandler('onVocabReviewDone')} className="w-full mt-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-xl transition-colors">Continue Story</button>
                )}
              </>
            )}

            {actPhase === 'choice' && currentDecision && (
              <ChoiceCard decision={currentDecision} subplots={subplots} cmsBaseUrl={cmsBaseUrl} onTapChoice={(i) => getHandler('onTapChoice')(i)} />
            )}

            {actPhase === 'outcome' && currentLine && (
              <>
                {outcomePassed !== undefined && (
                  <div className={`w-full max-w-md mx-auto mb-4 p-4 rounded-xl text-center ${outcomePassed ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700' : 'bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700'}`}>
                    <p className={`text-lg font-bold ${outcomePassed ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>{outcomePassed ? '✓ Success!' : '✗ Failed'}</p>
                    {outcomeSubplot && <p className={`text-sm mt-1 ${outcomePassed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{(subplots[outcomeSubplot]?.name || outcomeSubplot).replace('subplot_', '')}: <span className="font-bold ml-1">{outcomeDelta && outcomeDelta > 0 ? '+' : ''}{outcomeDelta || 0}</span></p>}
                  </div>
                )}
                <LineCard line={currentLine} character={null} place={null} isNarrator={true} cmsBaseUrl={cmsBaseUrl} />
                <button onClick={getHandler('onOutcomeDone')} className="w-full py-3 mt-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">Continue <ChevronRight className="w-5 h-5" /></button>
              </>
            )}
          </div>
        )}

        {currentView === 'quiz' && (
          <QuizCard currentCard={currentCard} showingAnswer={showingAnswer} schedulePreview={schedulePreview}
            currentActTag={props.currentActTag || null} quizCardDueDate={props.quizCardDueDate || null}
            onShowAnswer={getHandler('onShowAnswer')} onRateCard={(id, q) => getHandler('onRateCard')(id, q)}
            onSpeakThai={onSpeakThai} onSpeakCard={getHandler('onSpeakCard')} />
        )}
      </main>

      <Footer subplotScores={subplotScores} subplots={subplots} />

      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-red-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-slate-900 dark:text-white font-semibold text-lg mb-1">Reset All Progress?</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">This will clear all your card statistics, again queue, and learning progress. Your card content will remain. This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={getHandler('onCancelReset')} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-lg transition-colors">Cancel</button>
              <button onClick={getHandler('onConfirmReset')} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold">Reset Everything</button>
            </div>
          </div>
        </div>
      )}

      <SettingsDrawer isOpen={isSettingsOpen} dateshift={dateshift} cmsBaseUrl={cmsBaseUrl}
        onClose={getHandler('onCloseSettings')} onCheckForUpdates={getHandler('onCheckForUpdates')}
        onCheckForNewContent={getHandler('onCheckForNewContent')} onExportState={getHandler('onExportState')}
        onImportState={getHandler('onImportState')} onIncrementDateshift={getHandler('onIncrementDateshift')}
        onDecrementDateshift={getHandler('onDecrementDateshift')} onTapResetState={getHandler('onTapResetState')}
        onChangeCmsBase={getHandler('onChangeCmsBase')} mostOverdueCardInfo={props.mostOverdueCardInfo || null}
        nextEpisodeInfo={props.nextEpisodeInfo || null} />
    </div>
  );
};
