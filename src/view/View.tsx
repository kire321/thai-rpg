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