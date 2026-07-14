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
// in-memory image data AND killed the Service Worker. We must wait for
// the SW to restart before retrying image loads, otherwise the retry
// fires while the SW is still booting and images fail again.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      imageDiagnostics.lastHidden = Date.now();
    } else {
      imageDiagnostics.lastShown = Date.now();

      // Force SW update check — the browser may not check on resume.
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) reg.update().catch(() => {});
        }).catch(() => {});
      }

      // Wait for SW to be ready, then dispatch retry.
      // If SW is already active this resolves immediately.
      const dispatchRetry = () => {
        window.dispatchEvent(new CustomEvent('thai-rpg-retry-images'));
      };

      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready
          .then(() => {
            dispatchRetry();
            // Second retry after 2s in case SW was still booting on first attempt
            setTimeout(dispatchRetry, 2000);
            // Third retry after 5s as final fallback
            setTimeout(dispatchRetry, 5000);
          })
          .catch(() => {
            // SW failed to become ready — retry anyway (network might be online)
            dispatchRetry();
            setTimeout(dispatchRetry, 3000);
          });
      } else {
        // No SW support — just retry
        dispatchRetry();
      }
    }
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