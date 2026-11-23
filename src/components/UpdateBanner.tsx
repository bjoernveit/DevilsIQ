import React from 'react';
import { RefreshCw, X } from 'lucide-react';

interface UpdateBannerProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ onUpdate, onDismiss }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-red-950/95 border-b border-red-800/80 text-zinc-100 px-3 sm:px-6 py-2.5"
    >
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-pulse" />
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-white truncate">
              Neue App-Version verfügbar
            </p>
            <p className="text-[11px] text-red-200/85 truncate hidden sm:block">
              Tippe auf Aktualisieren, um die neueste Version zu laden.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onUpdate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold min-h-[34px] transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Aktualisieren</span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-red-200/80 hover:text-white hover:bg-red-900/60 min-h-[34px] min-w-[34px] flex items-center justify-center transition-colors"
            aria-label="Hinweis ausblenden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
