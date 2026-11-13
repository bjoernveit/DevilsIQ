import React, { useState, useMemo } from 'react';
import { Player, QuizAttempt, Question } from '../types/basketball';
import { calculateTacticalGaps, calculateWeeklyTrends, getWeekKey } from '../utils/quizEngine';
import { X, Trash2, Star, ExternalLink, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';

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
  onTogglePriorityFocus?: (questionId: string) => void;
  onSwitchToQuestions?: (playerId: string) => void;
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
  onDeletePlayer,
  onTogglePriorityFocus,
  onSwitchToQuestions
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'questions'>('overview');
  const [questionSubFilter, setQuestionSubFilter] = useState<'all' | 'struggling' | 'solid'>('all');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  React.useEffect(() => {
    setActiveTab('overview');
    setQuestionSubFilter('all');
    setExpandedQuestionId(null);
    setConfirmDelete(false);
    setIsDeleting(false);
    setActionError(null);
  }, [isOpen, player?.id]);

  const currentWeek = getWeekKey();
  const playerAttempts = useMemo(() => {
    if (!player) return [];
    return attempts
      .filter(a => a.playerId === player.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [attempts, player?.id]);

  const thisWeekAttempts = playerAttempts.filter(a => a.weekKey === currentWeek);
  const thisWeekPassed = thisWeekAttempts.some(a => a.passed === true || a.correctCount === a.totalQuestions);
  const passedAttempts = playerAttempts.filter(a => a.passed === true || a.correctCount === a.totalQuestions);
  const averagePassedTime = passedAttempts.length > 0
    ? Math.round((passedAttempts.reduce((sum, a) => sum + a.totalTimeSeconds, 0) / passedAttempts.length) * 10) / 10
    : 0;

  const playerGaps = useMemo(() => {
    if (!player) return [];
    return calculateTacticalGaps(questions, playerAttempts, player.id).filter(g => g.totalAnswered > 0);
  }, [questions, playerAttempts, player?.id]);

  const playerTrends = useMemo(() => {
    if (!player) return [];
    return calculateWeeklyTrends(attempts, player.id);
  }, [attempts, player?.id]);

  // Compute question-by-question performance specifically for this player
  const playerQuestionStats = useMemo(() => {
    if (!player) return [];
    const statsMap = new Map<
      string,
      {
        questionId: string;
        total: number;
        correct: number;
        wrong: number;
        lastIsCorrect: boolean;
        lastAttemptTimestamp: string;
      }
    >();

    // Process attempts in chronological order (oldest to newest) to determine last answer status
    const chronologicalAttempts = [...playerAttempts].reverse();
    for (const att of chronologicalAttempts) {
      for (const ans of att.answers) {
        const cur = statsMap.get(ans.questionId) || {
          questionId: ans.questionId,
          total: 0,
          correct: 0,
          wrong: 0,
          lastIsCorrect: ans.isCorrect,
          lastAttemptTimestamp: att.timestamp
        };
        cur.total += 1;
        if (ans.isCorrect) cur.correct += 1;
        else cur.wrong += 1;
        cur.lastIsCorrect = ans.isCorrect;
        cur.lastAttemptTimestamp = att.timestamp;
        statsMap.set(ans.questionId, cur);
      }
    }

    const questionMap = new Map<string, Question>(questions.map(q => [q.id, q]));

    const list: Array<{
      question: Question;
      total: number;
      correct: number;
      wrong: number;
      accuracy: number;
      lastIsCorrect: boolean;
      lastAttemptTimestamp: string;
      isStruggling: boolean;
    }> = [];

    statsMap.forEach((stat, qId) => {
      const q = questionMap.get(qId);
      if (!q) return;
      const accuracy = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
      // Considered struggling if accuracy < 75% or has at least 1 wrong answer
      const isStruggling = accuracy < 75 || stat.wrong > 0;
      list.push({
        question: q,
        total: stat.total,
        correct: stat.correct,
        wrong: stat.wrong,
        accuracy,
        lastIsCorrect: stat.lastIsCorrect,
        lastAttemptTimestamp: stat.lastAttemptTimestamp,
        isStruggling
      });
    });

    // Sort: problem questions first (lowest accuracy first, then highest wrong count)
    return list.sort((a, b) => {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return b.wrong - a.wrong;
    });
  }, [playerAttempts, questions, player?.id]);

  const canView = viewerIsCoach || (Boolean(currentUserId) && player?.id === currentUserId);
  if (!isOpen || !player || !canView) return null;

  const strugglingCount = playerQuestionStats.filter(q => q.isStruggling).length;
  const solidCount = playerQuestionStats.length - strugglingCount;

  const filteredQuestionStats = playerQuestionStats.filter(stat => {
    if (questionSubFilter === 'struggling') return stat.isStruggling;
    if (questionSubFilter === 'solid') return !stat.isStruggling;
    return true;
  });

  const canManageMember = Boolean(viewerIsCoach && currentUserId && player.id !== currentUserId);
  const canManageRole = Boolean(canManageMember && onToggleRole);
  const canDeleteMember = Boolean(canManageMember && onDeletePlayer);
  const isTargetCoach = player.role === 'coach';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
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

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/60 px-5 pt-2 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-red-600 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Übersicht & Verlauf
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'questions'
                ? 'border-red-600 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Fragen-Analyse
            {strugglingCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-950 text-red-300 border border-red-800 font-mono font-bold">
                {strugglingCount} Schwächen
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400 font-mono">
                {playerQuestionStats.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {activeTab === 'overview' ? (
            <>
              {/* Weekly Status */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">Diese Woche</div>
                  <div className="text-base font-bold font-mono text-white mt-0.5">
                    {thisWeekPassed ? 'Fertig' : 'Offen'}
                  </div>
                </div>
                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">Bestanden / Gesamt</div>
                  <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                    {passedAttempts.length} / {playerAttempts.length}
                  </div>
                </div>
                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">
                    {averagePassedTime > 0 && passedAttempts.length > 1 ? `Bestzeit (Ø ${averagePassedTime.toFixed(1)}s)` : 'Bestzeit'}
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                    {passedAttempts.length > 0
                      ? `${Math.min(...passedAttempts.map(a => a.totalTimeSeconds)).toFixed(1)}s`
                      : '—'}
                  </div>
                </div>
              </div>

              {/* Quick Callout to Questions tab if player has struggling questions */}
              {strugglingCount > 0 && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-900/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-xs text-red-200">
                      <span className="font-semibold">{strugglingCount} Fragen</span> liegen {player.name} aktuell noch nicht.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('questions')}
                    className="text-xs font-semibold text-red-300 hover:text-white underline underline-offset-2 shrink-0 transition-colors"
                  >
                    Fragen ansehen
                  </button>
                </div>
              )}

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
                          {t.averageAccuracy}% Quote · {t.averageScore > 0 ? `Ø ${t.averageScore.toFixed(1)}s` : 'Kein Durchgang bestanden'}
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
                          <div className="font-bold text-white">{att.totalTimeSeconds.toFixed(1)}s</div>
                          <div className="text-[11px] text-zinc-400">
                            {att.correctCount}/{att.totalQuestions} · {att.passed ? 'Bestanden' : 'Fehlgeschlagen'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* QUESTIONS ANALYSIS TAB */
            <div className="space-y-4">
              {/* Header with Switch-to-Questions button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Fragen-Leistung von {player.name}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Schwächste Fragen stehen oben. Klicke auf den Stern, um eine Frage als Trainingsfokus zu setzen.
                  </p>
                </div>

                {viewerIsCoach && onSwitchToQuestions && (
                  <button
                    type="button"
                    onClick={() => onSwitchToQuestions(player.id)}
                    className="px-3 py-1.5 rounded-lg border border-red-700/60 bg-red-950/60 hover:bg-red-900/60 text-xs font-semibold text-red-200 inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors min-h-[34px]"
                  >
                    <span>Im Fragenkatalog öffnen</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sub-Filters */}
              <div className="inline-flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setQuestionSubFilter('all')}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    questionSubFilter === 'all'
                      ? 'bg-red-700 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Alle ({playerQuestionStats.length})
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionSubFilter('struggling')}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                    questionSubFilter === 'struggling'
                      ? 'bg-red-700 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>Liegen dem Spieler nicht</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-950/80 text-red-300 font-mono font-bold">
                    {strugglingCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionSubFilter('solid')}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    questionSubFilter === 'solid'
                      ? 'bg-red-700 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Sicher ({solidCount})
                </button>
              </div>

              {/* Question Items List */}
              {filteredQuestionStats.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-xl">
                  {playerQuestionStats.length === 0
                    ? `${player.name} hat bisher noch keine Fragen in einem Quiz beantwortet.`
                    : 'Keine Fragen in dieser Kategorie.'}
                </div>
              ) : (
                <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
                  {filteredQuestionStats.map(stat => {
                    const promptText = stat.question.scenario || stat.question.title;
                    const isExpanded = expandedQuestionId === stat.question.id;

                    return (
                      <div
                        key={stat.question.id}
                        className={`p-3.5 transition-colors ${
                          stat.isStruggling ? 'bg-red-950/15 hover:bg-red-950/25' : 'hover:bg-zinc-900/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            {/* Tags & Accuracy Badge */}
                            <div className="flex items-center gap-1.5 flex-wrap text-xs">
                              {stat.question.tags.length > 0 && (
                                <span className="text-zinc-400">
                                  {stat.question.tags.join(' · ')}
                                </span>
                              )}
                              <span aria-hidden="true" className="text-zinc-600">·</span>

                              <span
                                className={`inline-flex items-center gap-1 font-mono font-semibold px-2 py-0.5 rounded-md text-[11px] ${
                                  stat.accuracy >= 75
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                                    : stat.accuracy >= 50
                                    ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                    : 'bg-red-950 text-red-200 border border-red-800'
                                }`}
                              >
                                {stat.accuracy}% Quote ({stat.correct}/{stat.total})
                              </span>

                              {stat.wrong > 0 && (
                                <span className="text-[11px] text-red-400 font-mono">
                                  {stat.wrong} {stat.wrong === 1 ? 'Fehler' : 'Fehler'}
                                </span>
                              )}

                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                  stat.lastIsCorrect ? 'text-emerald-400' : 'text-red-400'
                                }`}
                              >
                                {stat.lastIsCorrect ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Zuletzt richtig</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-3 h-3" />
                                    <span>Zuletzt falsch</span>
                                  </>
                                )}
                              </span>
                            </div>

                            {/* Question Title */}
                            <p className="text-sm font-medium text-white leading-snug">
                              {promptText}
                            </p>
                          </div>

                          {/* Quick Actions: Priority Focus Star & Expand */}
                          <div className="flex items-center gap-1 shrink-0">
                            {viewerIsCoach && onTogglePriorityFocus && (
                              <button
                                type="button"
                                onClick={() => onTogglePriorityFocus(stat.question.id)}
                                className="p-1.5 rounded-lg hover:bg-zinc-800 min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                                title={
                                  stat.question.isPriorityFocus
                                    ? 'Aus Wochenfokus entfernen'
                                    : 'Als Wochenfokus priorisieren'
                                }
                                aria-label="Wochenfokus umschalten"
                              >
                                <Star
                                  className={`w-4 h-4 ${
                                    stat.question.isPriorityFocus
                                      ? 'fill-red-500 text-red-500'
                                      : 'text-zinc-500 hover:text-zinc-300'
                                  }`}
                                />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setExpandedQuestionId(isExpanded ? null : stat.question.id)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
                              aria-label={isExpanded ? 'Optionen einklappen' : 'Optionen anzeigen'}
                              title={isExpanded ? 'Einklappen' : 'Antwortoptionen anzeigen'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Expanded details: Question Image & Options */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2.5">
                            {stat.question.imageUrl && (
                              <div className="rounded-lg overflow-hidden border border-zinc-800 max-h-44 bg-black">
                                <img
                                  src={stat.question.imageUrl}
                                  alt={promptText}
                                  className="w-full h-full object-contain max-h-44"
                                />
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                                Antwortoptionen (Richtige Antwort hervorgehoben):
                              </p>
                              <div className="grid grid-cols-1 gap-1.5">
                                {stat.question.options.map(opt => (
                                  <div
                                    key={opt.id}
                                    className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                                      opt.isCorrect
                                        ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200 font-medium'
                                        : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                    }`}
                                  >
                                    <span>{opt.text}</span>
                                    {opt.isCorrect && (
                                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-800 text-white font-bold">
                                        Richtig
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {stat.question.explanation && (
                              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
                                <span className="font-semibold text-white">Erklärung: </span>
                                {stat.question.explanation}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
