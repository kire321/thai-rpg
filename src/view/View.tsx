// View.tsx - React components for Thai RPG PWA
import React, { useRef } from 'react';
import {
  Settings, RefreshCw, Download, Upload, X,
  Plus, Minus, Trash2, AlertTriangle,
  Volume2, Eye, ChevronRight,
} from 'lucide-react';
import type { ViewProps } from '../types';

const CMS_BASE = 'https://ipozfyeyt26ay.kimi.show';

// ===================== HEADER =====================

const Header: React.FC<{
  showGearIcon: boolean;
  doneCount: number;
  dueCount: number;
  newCount: number;
  leftCount: number;
  episodesUnplayed: number;
  dateshift: number;
  showDateshift: boolean;
  onTapGear: () => void;
}> = ({ showGearIcon, doneCount, dueCount, newCount, leftCount, episodesUnplayed, dateshift, showDateshift, onTapGear }) => (
  <header className="fixed top-0 left-0 right-0 h-14 bg-slate-900 flex items-center justify-between px-2 z-40 shadow-md">
    <div className="flex-1 flex items-center justify-center gap-2 text-xs flex-wrap">
      <span className="text-slate-500">Done:<span className="text-green-400 ml-1">{doneCount}</span></span>
      <span className="text-slate-500">Due:<span className="text-yellow-400 ml-1">{dueCount}</span></span>
      <span className="text-slate-500">New:<span className="text-blue-400 ml-1">{newCount}</span></span>
      <span className="text-slate-500">Left:<span className="text-purple-400 ml-1">{leftCount}</span></span>
      {episodesUnplayed > 0 && (
        <span className="text-slate-500">Ep:<span className="text-pink-400 ml-1">{episodesUnplayed}</span></span>
      )}
      {showDateshift && <span className="text-slate-500">Shift:<span className="text-orange-400 ml-1">{dateshift}</span></span>}
    </div>
    {showGearIcon && (
      <button onClick={onTapGear} className="p-2 rounded-full hover:bg-slate-700 transition-colors" aria-label="Open settings">
        <Settings className="w-6 h-6 text-slate-300" />
      </button>
    )}
  </header>
);

// ===================== LINE CARD =====================

// ===================== INFO CARD (Place / Character) =====================

const InfoCard: React.FC<{
  label: string;
  name: string;
  description?: string;
  picture?: string;
}> = ({ label, name, description, picture }) => {
  if (!name) return null;
  // CMS gives relative paths like "/characters/chanida.png" — prepend base URL
  const imgUrl = picture && picture.startsWith('/') ? `${CMS_BASE}${picture}` : picture;
  return (
    <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* Label header */}
      <div className="px-3 py-1.5 bg-slate-700/50 border-b border-slate-700">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <div className="p-3 flex flex-col items-center text-center">
        {/* Name (title) above image */}
        <p className="text-sm font-semibold text-amber-300 mb-2">{name}</p>
        {/* Picture */}
        <div className="w-20 h-20 rounded-lg bg-slate-700 flex items-center justify-center mb-2 overflow-hidden">
          {imgUrl ? (
            <img src={imgUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl">{label === 'Place' ? '📍' : '👤'}</span>
          )}
        </div>
        {description && (
          <p className="text-[10px] text-slate-500 mt-1 leading-tight line-clamp-3">{description}</p>
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
}> = ({ line, character, place, isNarrator }) => {
  if (!line) return null;

  // Extract dialogue text (after "char: " prefix)
  let dialogue = line.dialogue || '';
  const charMatch = dialogue.match(/^(?:char_)?([\w\s]+):\s*(.+)$/);
  const dialogueText = charMatch ? charMatch[2] : dialogue;

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      {/* Stage Directions */}
      {(() => {
        const sd = line.stage_directions;
        if (!sd) return null;
        const arr = Array.isArray(sd) ? sd : (typeof sd === 'string' && sd.trim() ? [sd] : []);
        if (arr.length === 0) return null;
        return (
          <div className="w-full mb-3 p-3 bg-slate-800/60 rounded-lg border-l-2 border-amber-500">
            {arr.map((s: string, i: number) => (
              <p key={i} className="text-amber-300/80 text-sm italic">{s}</p>
            ))}
          </div>
        );
      })()}

      {/* Narrative / Dialogue */}
      <div className="w-full bg-slate-800 rounded-xl shadow-lg p-5 mb-4">
        <p className="text-lg text-white leading-relaxed">{dialogueText}</p>
      </div>

      {/* Place + Character cards — side by side below narrative */}
      {!isNarrator && (place || character) && (
        <div className="w-full flex gap-3">
          {place && (
            <InfoCard
              label="Place"
              name={place.name}
              description={place.description}
              picture={place.picture}
            />
          )}
          {character && (
            <InfoCard
              label="Character"
              name={character.name}
              description={character.description}
              picture={character.picture}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ===================== CHOICE CARD =====================

const ChoiceCard: React.FC<{
  decision: any;
  onTapChoice: (index: number) => void;
}> = ({ decision, onTapChoice }) => {
  if (!decision) return null;

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Decision line */}
      {decision.line && (
        <LineCard line={decision.line} character={null} place={null} isNarrator={true} />
      )}

      {/* Choices */}
      <div className="space-y-3 mt-4">
        {decision.choices?.map((choice: any, i: number) => (
          <button
            key={i}
            onClick={() => onTapChoice(i)}
            className="w-full p-4 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-amber-500 rounded-xl transition-colors text-left"
          >
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">{choice.description}</span>
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </div>
            {choice.difficulty && (
              <span className="text-xs text-slate-500 mt-1 capitalize">{choice.difficulty} difficulty</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

// ===================== QUIZ CARD =====================

const QuizCard: React.FC<{
  currentCard: any;
  showingAnswer: boolean;
  schedulePreview: any;
  onShowAnswer: () => void;
  onRateCard: (cardId: string, quality: number) => void;
  onSpeakThai: (text: string) => void;
}> = ({ currentCard, showingAnswer, schedulePreview, onShowAnswer, onRateCard, onSpeakThai }) => {
  if (!currentCard) {
    return (
      <div className="text-center p-8">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-white mb-2">All Caught Up!</h2>
        <p className="text-slate-400">No cards due for review.</p>
      </div>
    );
  }

  const isThaiFront = currentCard.direction === 'thai-eng';

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      <div className="w-full bg-slate-800 rounded-2xl shadow-xl overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-700 border-b border-slate-600">
          <span className="text-xs text-slate-400">
            {currentCard.direction === 'thai-eng' ? 'Thai → English' : 'English → Thai'}
          </span>
        </div>
        <div className="p-6 min-h-[120px] flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-white mb-2">{currentCard.front}</p>
            {isThaiFront && !showingAnswer && (
              <button onClick={() => onSpeakThai(currentCard.front)}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-full text-sm text-slate-300 transition-colors">
                <Volume2 className="w-4 h-4" /> Listen
              </button>
            )}
            {showingAnswer && (
              <div className="mt-4 pt-4 border-t border-slate-600">
                <p className="text-xl text-green-400 mb-2">{currentCard.back}</p>
                {!isThaiFront && (
                  <button onClick={() => onSpeakThai(currentCard.back)}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-full text-sm text-slate-300 transition-colors">
                    <Volume2 className="w-4 h-4" /> Listen
                  </button>
                )}
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
              <div className="text-white/70 text-[10px]">{schedulePreview ? `${schedulePreview[rating]}d` : '-'}</div>
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
  const entries = Object.entries(subplotScores).filter(([_, score]) => score !== 0);
  if (entries.length === 0) return null;

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 z-40">
      <div className="flex items-center justify-center gap-4 px-4 py-2 text-xs overflow-x-auto">
        {entries.map(([id, score]) => (
          <span key={id} className="text-slate-400 whitespace-nowrap">
            {(subplots[id]?.name || id).replace('subplot_', '')}:
            <span className={`ml-1 font-bold ${score > 0 ? 'text-green-400' : score < 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {score > 0 ? '+' : ''}{score}
            </span>
          </span>
        ))}
      </div>
    </footer>
  );
};

// ===================== SETTINGS DRAWER =====================

interface SettingsDrawerProps {
  isOpen: boolean;
  dateshift: number;
  onClose: () => void;
  onCheckForUpdates: () => void;
  onCheckForNewContent: () => void;
  onExportState: () => void;
  onImportState: (content: string) => void;
  onIncrementDateshift: () => void;
  onDecrementDateshift: () => void;
  onTapResetState: () => void;
}

const SettingsDrawer = ({ isOpen, dateshift, onClose, onCheckForUpdates, onCheckForNewContent, onExportState, onImportState, onIncrementDateshift, onDecrementDateshift, onTapResetState }: SettingsDrawerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackdropClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => onImportState(ev.target?.result as string);
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={handleBackdropClick}>
      <div className="absolute bottom-0 left-0 right-0 bg-slate-800 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700 transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        {/* Dateshift */}
        <div className="px-4 py-3 border-b border-slate-700">
          <p className="text-sm text-slate-400 mb-2">Dateshift (debugging)</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={onDecrementDateshift} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"><Minus className="w-5 h-5 text-white" /></button>
            <span className="text-2xl font-bold text-white w-12 text-center">{dateshift}</span>
            <button onClick={onIncrementDateshift} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"><Plus className="w-5 h-5 text-white" /></button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <button onClick={onCheckForNewContent} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-left">
            <RefreshCw className="w-5 h-5 text-purple-400" /><span className="text-white">Check for New Content</span>
          </button>
          <button onClick={onCheckForUpdates} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-left">
            <RefreshCw className="w-5 h-5 text-blue-400" /><span className="text-white">Check for updates</span>
          </button>
          <button onClick={onExportState} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-left">
            <Download className="w-5 h-5 text-green-400" /><span className="text-white">Export state</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-left">
            <Upload className="w-5 h-5 text-orange-400" /><span className="text-white">Import state</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".md" onChange={handleFileSelect} className="hidden" />
          <button onClick={onTapResetState} className="w-full flex items-center gap-3 px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-left">
            <Trash2 className="w-5 h-5 text-white" /><span className="text-white font-semibold">Reset State</span>
          </button>
        </div>

        <div className="px-4 pb-6 text-center">
          <p className="text-sm text-slate-500">Swipe down to close</p>
        </div>
      </div>
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-6 max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-slate-400 text-sm mb-4">{e?.message || 'Unknown error'}</p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Reload
          </button>
        </div>
      </div>
    );
  }
};

const ViewInner: React.FC<ViewProps> = (props) => {
  // Safe destructuring with defaults
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

  const onSpeakThai = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'th-TH'; u.rate = 0.8;
      window.speechSynthesis.speak(u);
    }
  };

  const hasFooter = Object.keys(subplotScores).some(k => subplotScores[k] !== 0);

  return (
    <div className={`min-h-screen bg-slate-950 ${hasFooter ? 'pb-10' : ''}`}>
      <Header showGearIcon={showGearIcon} doneCount={doneCount} dueCount={dueCount} newCount={newCount}
        leftCount={leftCount} episodesUnplayed={episodesUnplayed} dateshift={dateshift} showDateshift={showDateshift}
        onTapGear={getHandler('onTapGear')} />

      <main className="pt-16 p-4">
        {/* WELCOME */}
        {currentView === 'welcome' && (
          <div className="max-w-md mx-auto mt-8 text-center">
            <div className="p-8 bg-slate-900 rounded-2xl shadow-lg">
              {/* DEBUG INFO */}
              {props.debugMessage && (
                <div className="mb-4 p-2 bg-green-900/50 rounded text-xs text-green-300 font-mono">
                  {props.debugMessage}
                </div>
              )}
              <h2 className="text-2xl font-bold text-white mb-4">Welcome to Thai RPG</h2>
              <p className="text-slate-400 mb-6">Learn Thai language through an epic RPG adventure!</p>
              <div className="text-6xl mb-6">🏯</div>
              <button onClick={getHandler('onStartEpisode')}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors mb-3">
                Start Episode
              </button>
              <p className="text-sm text-slate-500 mt-2">{leftCount} cards ready to learn</p>
            </div>
          </div>
        )}

        {/* EPISODE */}
        {currentView === 'episode' && !currentAct && (
          <div className="max-w-md mx-auto mt-8 text-center">
            <div className="p-8 bg-slate-900 rounded-2xl">
              <div className="text-6xl mb-4">📖</div>
              <h2 className="text-xl font-bold text-white mb-2">Loading Episode...</h2>
              <p className="text-slate-400 text-sm">Episode data is being loaded. Please wait a moment.</p>
              <button onClick={getHandler('onStartEpisode')}
                className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors">
                Retry
              </button>
            </div>
          </div>
        )}

        {currentView === 'episode' && (
          <div className="max-w-md mx-auto">
            {/* Lines (before or after vocab) */}
            {(actPhase === 'lines_before' || actPhase === 'lines_after') && (
              <>
                {currentLine ? (
                  <LineCard line={currentLine} character={currentCharacter} place={currentPlace} isNarrator={isNarrator} />
                ) : (
                  <div className="text-center p-4 text-slate-500">No line to display</div>
                )}
                <button onClick={getHandler('onTapNextLine')}
                  className="w-full py-3 mt-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                  Next <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Vocab Review */}
            {showVocabReview && (
              <>
                <div className="text-center mb-3">
                  <p className="text-xs text-blue-400 uppercase tracking-wider">Vocab Review</p>
                </div>
                <QuizCard currentCard={currentCard} showingAnswer={showingAnswer}
                  schedulePreview={schedulePreview} onShowAnswer={getHandler('onShowAnswer')}
                  onRateCard={(id, q) => getHandler('onRateCard')(id, q)} onSpeakThai={onSpeakThai} />
                {!showingAnswer && currentCard && (
                  <button onClick={getHandler('onVocabReviewDone')}
                    className="w-full mt-4 py-2 text-slate-500 hover:text-slate-300 text-sm transition-colors">
                    Skip to Next (no new/due cards)
                  </button>
                )}
                {showingAnswer && (
                  <button onClick={getHandler('onVocabReviewDone')}
                    className="w-full mt-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors">
                    Continue Story
                  </button>
                )}
              </>
            )}

            {/* Choice */}
            {actPhase === 'choice' && currentDecision && (
              <ChoiceCard decision={currentDecision} onTapChoice={(i) => getHandler('onTapChoice')(i)} />
            )}

            {/* Outcome */}
            {actPhase === 'outcome' && currentLine && (
              <>
                <LineCard line={currentLine} character={null} place={null} isNarrator={true} />
                <button onClick={getHandler('onOutcomeDone')}
                  className="w-full py-3 mt-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                  Continue <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        )}

        {/* QUIZ (standalone) */}
        {currentView === 'quiz' && (
          <QuizCard currentCard={currentCard} showingAnswer={showingAnswer}
            schedulePreview={schedulePreview} onShowAnswer={getHandler('onShowAnswer')}
            onRateCard={(id, q) => getHandler('onRateCard')(id, q)} onSpeakThai={onSpeakThai} />
        )}
      </main>

      {/* Footer */}
      <Footer subplotScores={subplotScores} subplots={subplots} />

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-red-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-white font-semibold text-lg mb-1">Reset All Progress?</h3>
                <p className="text-sm text-slate-400">This will clear all your card statistics, again queue, and learning progress. Your card content will remain. This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={getHandler('onCancelReset')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">Cancel</button>
              <button onClick={getHandler('onConfirmReset')} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold">Reset Everything</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Drawer */}
      <SettingsDrawer isOpen={isSettingsOpen} dateshift={dateshift}
        onClose={getHandler('onCloseSettings')}
        onCheckForUpdates={getHandler('onCheckForUpdates')} onCheckForNewContent={getHandler('onCheckForNewContent')}
        onExportState={getHandler('onExportState')} onImportState={getHandler('onImportState')}
        onIncrementDateshift={getHandler('onIncrementDateshift')} onDecrementDateshift={getHandler('onDecrementDateshift')}
        onTapResetState={getHandler('onTapResetState')} />
    </div>
  );
}
