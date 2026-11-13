import React from 'react';
import { Player, QuizAttempt, Question } from '../types/basketball';
import { calculateTacticalGaps, calculateWeeklyTrends, getWeekKey } from '../utils/quizEngine';
import { X, Trash2 } from 'lucide-react';

interface PlayerDetailModalProps {
  player: Player | null;
  attempts: QuizAttempt[];
  questions: Question[];
  isOpen: boolean;
  onClose: () => void;
  viewerIsCoach?: boolean;
  currentUserId?: string;
  onToggleRole?: (player: Player, nextRole: 'player' | 'coach') => Promise<void>;
  onDeletePlayer?: (player: Player) => Promise<void>;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({
  player,
  attempts,
  questions,
  isOpen,
  onClose,
  viewerIsCoach,
  currentUserId,
  onToggleRole,
  onDeletePlayer
}) => {
  const [isUpdatingRole, setIsUpdatingRole] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setConfirmDelete(false);
    setIsDeleting(false);
    setActionError(null);
  }, [isOpen, player?.id]);

  if (!isOpen || !player) return null;

  const currentWeek = getWeekKey();
  const playerAttempts = attempts
    .filter(a => a.playerId === player.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const thisWeekAttempts = playerAttempts.filter(a => a.weekKey === currentWeek);
  const playerGaps = calculateTacticalGaps(questions, playerAttempts, player.id).filter(g => g.totalAnswered > 0);
  const playerTrends = calculateWeeklyTrends(attempts, player.id);

  const canManageMember = Boolean(viewerIsCoach && currentUserId && player.id !== currentUserId);
  const canManageRole = Boolean(canManageMember && onToggleRole);
  const canDeleteMember = Boolean(canManageMember && onDeletePlayer);
  const isTargetCoach = player.role === 'coach';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">
              {player.name}
            </h2>
            <p className="text-xs text-zinc-400">
              {isTargetCoach ? 'Trainer · ' : ''}
              {playerAttempts.length} {playerAttempts.length === 1 ? 'Versuch' : 'Versuche'} gesamt
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManageRole && onToggleRole && (
              <button
                type="button"
                disabled={isUpdatingRole || isDeleting}
                onClick={async () => {
                  setActionError(null);
                  setIsUpdatingRole(true);
                  try {
                    await onToggleRole(player, isTargetCoach ? 'player' : 'coach');
                  } catch {
                    setActionError('Rolle konnte nicht geändert werden.');
                  } finally {
                    setIsUpdatingRole(false);
                  }
                }}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 transition-colors"
              >
                {isUpdatingRole ? 'Speichern...' : isTargetCoach ? 'Zum Spieler machen' : 'Zum Trainer machen'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Schließen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Weekly Status */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-[11px] text-zinc-400">Diese Woche</div>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                {thisWeekAttempts.length > 0 ? 'Fertig' : 'Offen'}
              </div>
            </div>
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-[11px] text-zinc-400">Versuche</div>
              <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                {playerAttempts.length}
              </div>
            </div>
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
              <div className="text-[11px] text-zinc-400">Bestwert</div>
              <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                {playerAttempts.length > 0 ? Math.max(...playerAttempts.map(a => a.totalScore)) : '—'}
              </div>
            </div>
          </div>

          {/* Improvement Trend */}
          {playerTrends.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400">
                Wochentrend
              </h3>
              <div className="space-y-1.5">
                {playerTrends.map(t => (
                  <div key={t.weekKey} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                    <span className="font-mono text-zinc-300">
                      {t.weekKey === currentWeek ? 'Diese Woche' : t.weekKey}
                    </span>
                    <span className="font-mono tabular-nums text-white font-semibold">
                      {t.averageAccuracy}% Quote · Ø {t.averageScore} Pkt.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Topic Breakdown */}
          {playerGaps.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400">
                Trefferquote nach Thema
              </h3>
              <div className="space-y-2">
                {playerGaps.map(gap => (
                  <div key={gap.tag} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-200 font-medium">{gap.tag}</span>
                      <span className="font-mono tabular-nums text-zinc-400">
                        {gap.accuracyPercentage}% ({gap.correctAnswered}/{gap.totalAnswered})
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${gap.accuracyPercentage < 65 ? 'bg-red-600' : 'bg-zinc-300'}`}
                        style={{ width: `${Math.max(4, gap.accuracyPercentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Attempts */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400">
              Letzte Versuche
            </h3>
            {playerAttempts.length === 0 ? (
              <div className="text-xs text-zinc-400 py-4 text-center bg-zinc-950 border border-zinc-800 rounded-xl">
                Noch keine Quiz-Versuche erfasst.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
                {playerAttempts.map(att => (
                  <div key={att.id} className="flex items-center justify-between px-3.5 py-2.5 text-xs bg-zinc-950">
                    <div>
                      <div className="font-medium text-white">{att.weekKey}</div>
                      <div className="text-[11px] text-zinc-500">
                        {new Date(att.timestamp).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="font-bold text-white">{att.totalScore} Pkt.</div>
                      <div className="text-[11px] text-zinc-400">
                        {att.correctCount}/{att.totalQuestions} · {att.totalTimeSeconds}s
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Action Error */}
          {actionError && (
            <div
              role="alert"
              className="text-xs text-red-200 bg-red-950/70 border border-red-800 rounded-xl px-3.5 py-2.5"
            >
              {actionError}
            </div>
          )}

          {/* Coach Danger Zone: Delete Player/User */}
          {canDeleteMember && onDeletePlayer && (
            <div className="pt-2 border-t border-zinc-800">
              {!confirmDelete ? (
                <button
                  type="button"
                  disabled={isUpdatingRole || isDeleting}
                  onClick={() => {
                    setActionError(null);
                    setConfirmDelete(true);
                  }}
                  className="w-full h-10 rounded-xl border border-red-800/70 bg-red-950/40 hover:bg-red-950/70 disabled:opacity-50 text-red-200 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isTargetCoach ? 'Benutzer löschen' : 'Spieler löschen'}</span>
                </button>
              ) : (
                <div className="bg-red-950/50 border border-red-800/80 rounded-xl p-3.5 space-y-3">
                  <p className="text-xs text-red-100 leading-relaxed">
                    „{player.name}“ wirklich löschen? Alle Profil- und Quizdaten dieses Kontos werden entfernt.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setConfirmDelete(false)}
                      className="h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-zinc-200 transition-colors"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={async () => {
                        setActionError(null);
                        setIsDeleting(true);
                        try {
                          await onDeletePlayer(player);
                        } catch {
                          setActionError('Benutzer konnte nicht gelöscht werden.');
                          setIsDeleting(false);
                        }
                      }}
                      className="h-9 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-xs font-semibold text-white transition-colors"
                    >
                      {isDeleting ? 'Wird gelöscht...' : 'Endgültig löschen'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
