import React, { useState, useEffect } from 'react';
import { Player } from '../types/basketball';
import { X, LogOut, Database } from 'lucide-react';

interface ProfileModalProps {
  player: Player;
  isOpen: boolean;
  onClose: () => void;
  onSaveProfile: (updates: { displayName: string }) => Promise<void>;
  onSignOut: () => Promise<void>;
  onRunAdminMigration?: () => Promise<{ updatedPlayersCount: number; processedAttemptsCount: number }>;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  player,
  isOpen,
  onClose,
  onSaveProfile,
  onSignOut,
  onRunAdminMigration
}) => {
  const [displayName, setDisplayName] = useState(player.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDisplayName(player.name);
      setMigrationStatus(null);
    }
  }, [isOpen, player]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setIsSaving(true);
    try {
      await onSaveProfile({
        displayName: displayName.trim()
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleMigration = async () => {
    if (!onRunAdminMigration || isMigrating) return;
    setIsMigrating(true);
    setMigrationStatus(null);
    try {
      const res = await onRunAdminMigration();
      setMigrationStatus(`${res.updatedPlayersCount} Profile aktualisiert (${res.processedAttemptsCount} Versuche).`);
    } catch (err) {
      setMigrationStatus(err instanceof Error ? err.message : 'Migration fehlgeschlagen.');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-white">Konto</h2>
            <p className="text-xs text-zinc-400">
              @{player.username || player.name} · {player.role === 'coach' ? 'Trainer' : 'Spieler'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Anzeigename
            </label>
            <input
              type="text"
              required
              maxLength={64}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-red-600 min-h-[42px]"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 h-10 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
            >
              {isSaving ? 'Speichern...' : 'Profil speichern'}
            </button>

            <button
              type="button"
              onClick={onSignOut}
              className="px-4 h-10 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Abmelden</span>
            </button>
          </div>

          {player.isAdmin && onRunAdminMigration && (
            <div className="pt-3 border-t border-zinc-800 space-y-2">
              <button
                type="button"
                disabled={isMigrating}
                onClick={handleMigration}
                className="w-full h-10 rounded-xl border border-amber-700/60 bg-amber-950/40 hover:bg-amber-900/50 disabled:opacity-50 text-amber-200 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{isMigrating ? 'Migriere Daten...' : 'Admin: Stats & Details migrieren'}</span>
              </button>
              {migrationStatus && (
                <p className="text-[11px] text-emerald-400 text-center">{migrationStatus}</p>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
