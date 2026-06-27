// View.tsx - React components for Thai RPG PWA
// Stateless - all control flow via if/switch, no business logic

import React, { useRef, useState } from 'react';
import {
  Settings, RefreshCw, Download, Upload, X,
  Plus, Minus, Trash2, AlertTriangle,
  Volume2, Eye,
} from 'lucide-react';
import type { ViewProps } from '../types';

// Header component with gear icon and counters
interface HeaderProps {
  showGearIcon: boolean;
  doneCount: number;
  dueCount: number;
  newCount: number;
  leftCount: number;
  dateshift: number;
  showDateshift: boolean;
  onTapGear: () => void;
}

const Header: React.FC<HeaderProps> = ({
  showGearIcon,
  doneCount,
  dueCount,
  newCount,
  leftCount,
  dateshift,
  showDateshift,
  onTapGear,
}) => (
  <header className="fixed top-0 left-0 right-0 h-14 bg-slate-900 flex items-center justify-between px-2 z-40 shadow-md">
    {/* Centered counters */}
    <div className="flex-1 flex items-center justify-center gap-3 text-xs">
      <span className="text-slate-500">Done:<span className="text-green-400 ml-1">{doneCount}</span></span>
      <span className="text-slate-500">Due:<span className="text-yellow-400 ml-1">{dueCount}</span></span>
      <span className="text-slate-500">New:<span className="text-blue-400 ml-1">{newCount}</span></span>
      <span className="text-slate-500">Left:<span className="text-purple-400 ml-1">{leftCount}</span></span>
      {showDateshift && (
        <span className="text-slate-500">Dateshift:<span className="text-orange-400 ml-1">{dateshift}</span></span>
      )}
    </div>

    {/* Gear icon right */}
    {showGearIcon && (
      <div className="flex items-center gap-2">
        <button
          onClick={onTapGear}
          className="p-2 rounded-full hover:bg-slate-700 transition-colors"
          aria-label="Open settings"
        >
          <Settings className="w-6 h-6 text-slate-300" />
        </button>
      </div>
    )}
  </header>
);

// Settings Drawer component
interface SettingsDrawerProps {
  isOpen: boolean;
  dateshift: number;
  onClose: () => void;
  onSwipeDown: () => void;
  onCheckForUpdates: () => void;
  onCheckForNewContent: () => void;
  onExportState: () => void;
  onImportState: (content: string) => void;
  onIncrementDateshift: () => void;
  onDecrementDateshift: () => void;
  onTapResetState: () => void;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  dateshift,
  onClose,
  onSwipeDown,
  onCheckForUpdates,
  onCheckForNewContent,
  onExportState,
  onImportState,
  onIncrementDateshift,
  onDecrementDateshift,
  onTapResetState,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 0) setDragOffset(diff);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragOffset > 100) onSwipeDown();
    setDragOffset(0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        onImportState(content);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  const transformStyle = isDragging ? { transform: `translateY(${dragOffset}px)` } : {};

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={handleBackdropClick}>
      <div
        ref={drawerRef}
        className="absolute bottom-0 left-0 right-0 bg-slate-800 rounded-t-2xl shadow-2xl transition-transform"
        style={transformStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700 transition-colors" aria-label="Close settings">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Dateshift control */}
        <div className="px-4 py-3 border-b border-slate-700">
          <p className="text-sm text-slate-400 mb-2">Dateshift (debugging)</p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={onDecrementDateshift}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              aria-label="Decrease dateshift"
            >
              <Minus className="w-5 h-5 text-white" />
            </button>
            <span className="text-2xl font-bold text-white w-12 text-center">{dateshift}</span>
            <button
              onClick={onIncrementDateshift}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              aria-label="Increase dateshift"
            >
              <Plus className="w-5 h-5 text-white" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1 text-center">Shift the effective date for testing</p>
        </div>

        {/* Settings buttons */}
        <div className="p-4 space-y-3">
          <button
            onClick={onCheckForNewContent}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-left"
          >
            <RefreshCw className="w-5 h-5 text-purple-400" />
            <span className="text-white">Check for New Content</span>
          </button>

          <button
            onClick={onCheckForUpdates}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-left"
          >
            <RefreshCw className="w-5 h-5 text-blue-400" />
            <span className="text-white">Check for updates</span>
          </button>

          <button
            onClick={onExportState}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-left"
          >
            <Download className="w-5 h-5 text-green-400" />
            <span className="text-white">Export state</span>
          </button>

          <button
            onClick={handleImportClick}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-left"
          >
            <Upload className="w-5 h-5 text-orange-400" />
            <span className="text-white">Import state</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".md"
            onChange={handleFileSelect}
            className="hidden"
            aria-label="Import state file"
          />

        </div>

        {/* Reset State Section */}
        <div className="px-4 pb-4">
          <button
            onClick={onTapResetState}
            className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold text-left flex items-center gap-3 transition-colors"
            type="button"
          >
            <Trash2 className="w-5 h-5" /> Reset State
          </button>
        </div>

        {/* Swipe hint */}
        <div className="px-4 pb-6 text-center">
          <p className="text-sm text-slate-500">Swipe down to close</p>
        </div>
      </div>
    </div>
  );
};

// Quiz Card component
interface QuizCardProps {
  currentCard: any;
  showingAnswer: boolean;
  dueDate: number | null;
  showPhonetics: boolean;
  cardStats: any;
  schedulePreview: { again: number; hard: number; good: number; easy: number } | null;
  onShowAnswer: () => void;
  onRateCard: (cardId: string, quality: number) => void;
  onSpeakThai: (text: string) => void;
}

const QuizCard: React.FC<QuizCardProps> = ({
  currentCard,
  showingAnswer,
  dueDate,
  showPhonetics,
  cardStats,
  schedulePreview,
  onShowAnswer,
  onRateCard,
  onSpeakThai,
}) => {
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
      {/* Card */}
      <div className="w-full bg-slate-800 rounded-2xl shadow-xl overflow-hidden mb-4">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-700 border-b border-slate-600">
          <span className="text-xs text-slate-400">
            {currentCard.direction === 'thai-eng' ? 'Thai → English' : 'English → Thai'}
          </span>
          <div className="flex items-center gap-2">
            {dueDate !== null && (
              <span className="text-xs text-slate-500">Due: {dueDate >= 0 ? `${dueDate}d` : 'now'}</span>
            )}
            {cardStats && (
              <span className="text-xs text-slate-500">R:{cardStats.repetitions || 0} I:{cardStats.interval || 0}</span>
            )}
          </div>
        </div>

        {/* Card body */}
        <div className="p-6 min-h-[160px] flex items-center justify-center">
          <div className="text-center">
            {/* Front text */}
            <p className="text-2xl font-bold text-white mb-2">{currentCard.front}</p>

            {/* Speak button for Thai front */}
            {isThaiFront && !showingAnswer && (
              <button
                onClick={() => onSpeakThai(currentCard.front)}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-full text-sm text-slate-300 transition-colors"
              >
                <Volume2 className="w-4 h-4" />
                Listen
              </button>
            )}

            {/* Answer section */}
            {showingAnswer && (
              <div className="mt-4 pt-4 border-t border-slate-600">
                <p className="text-xl text-green-400 mb-2">{currentCard.back}</p>
                {showPhonetics && currentCard.phonetics && (
                  <p className="text-sm text-slate-500 italic">{currentCard.phonetics}</p>
                )}
                {/* Speak button for Thai back */}
                {!isThaiFront && (
                  <button
                    onClick={() => onSpeakThai(currentCard.back)}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-full text-sm text-slate-300 transition-colors"
                  >
                    <Volume2 className="w-4 h-4" />
                    Listen
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {!showingAnswer ? (
        <button
          onClick={onShowAnswer}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <Eye className="w-5 h-5" />
          Show Answer
        </button>
      ) : (
        <div className="w-full grid grid-cols-4 gap-2">
          <button
            onClick={() => onRateCard(currentCard.id, 1)}
            className="py-2 px-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors text-xs leading-tight"
          >
            <div>Again</div>
            <div className="text-red-200 text-[10px]">{schedulePreview ? `${schedulePreview.again}d` : '-'}</div>
          </button>
          <button
            onClick={() => onRateCard(currentCard.id, 3)}
            className="py-2 px-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl transition-colors text-xs leading-tight"
          >
            <div>Hard</div>
            <div className="text-orange-200 text-[10px]">{schedulePreview ? `${schedulePreview.hard}d` : '-'}</div>
          </button>
          <button
            onClick={() => onRateCard(currentCard.id, 4)}
            className="py-2 px-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-xs leading-tight"
          >
            <div>Good</div>
            <div className="text-blue-200 text-[10px]">{schedulePreview ? `${schedulePreview.good}d` : '-'}</div>
          </button>
          <button
            onClick={() => onRateCard(currentCard.id, 5)}
            className="py-2 px-1 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors text-xs leading-tight"
          >
            <div>Easy</div>
            <div className="text-green-200 text-[10px]">{schedulePreview ? `${schedulePreview.easy}d` : '-'}</div>
          </button>
        </div>
      )}
    </div>
  );
};

// Main View component
export const View: React.FC<ViewProps> = ({
  showGearIcon,
  isSettingsOpen,
  showResetConfirm,
  doneCount,
  dueCount,
  newCount,
  leftCount,
  dateshift,
  showDateshift,
  currentView,
  currentCard,
  showingAnswer,
  dueDate,
  showPhonetics,
  cardStats,
  schedulePreview,
  getHandler,
}) => {
  return (
    <div className="min-h-screen bg-slate-950">
      <Header
        showGearIcon={showGearIcon}
        doneCount={doneCount}
        dueCount={dueCount}
        newCount={newCount}
        leftCount={leftCount}
        dateshift={dateshift}
        showDateshift={showDateshift}
        onTapGear={getHandler('onTapGear')}
      />

      {/* Main content area */}
      <main className="pt-16 p-4">
        {currentView === 'welcome' && (
          <div className="max-w-md mx-auto mt-8 text-center">
            <div className="p-8 bg-slate-900 rounded-2xl shadow-lg">
              <h2 className="text-2xl font-bold text-white mb-4">Welcome to Thai RPG</h2>
              <p className="text-slate-400 mb-6">
                Learn Thai language through spaced repetition!
              </p>
              <div className="text-6xl mb-4">🏯</div>
              <button
                onClick={getHandler('onTapNext')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
              >
                Start Learning
              </button>
              <p className="text-sm text-slate-500 mt-4">
                {leftCount > 0 ? `${leftCount} cards ready to learn` : 'Tap Start to begin'}
              </p>
            </div>
          </div>
        )}

        {currentView === 'quiz' && (
          <QuizCard
            currentCard={currentCard}
            showingAnswer={showingAnswer}
            dueDate={dueDate}
            showPhonetics={showPhonetics}
            cardStats={cardStats}
            schedulePreview={schedulePreview}
            onShowAnswer={getHandler('onShowAnswer')}
            onRateCard={(cardId, quality) => getHandler('onRateCard')(cardId, quality)}
            onSpeakThai={(text) => {
              if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(text);
                u.lang = 'th-TH';
                u.rate = 0.8;
                window.speechSynthesis.speak(u);
              }
            }}
          />
        )}
      </main>

      {/* Reset State Confirmation Overlay */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-red-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-white font-semibold text-lg mb-1">Reset All Progress?</h3>
                <p className="text-sm text-slate-400">
                  This will clear all your card statistics, again queue, and learning progress. Your card content will remain. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={getHandler('onCancelReset')}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={getHandler('onConfirmReset')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold"
              >
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        dateshift={dateshift}
        onClose={getHandler('onCloseSettings')}
        onSwipeDown={getHandler('onSwipeDownSettings')}
        onCheckForUpdates={getHandler('onCheckForUpdates')}
        onCheckForNewContent={getHandler('onCheckForNewContent')}
        onExportState={getHandler('onExportState')}
        onImportState={getHandler('onImportState')}
        onIncrementDateshift={getHandler('onIncrementDateshift')}
        onDecrementDateshift={getHandler('onDecrementDateshift')}
        onTapResetState={getHandler('onTapResetState')}
      />
    </div>
  );
};
