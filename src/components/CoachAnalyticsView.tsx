import React, { useState } from 'react';
import { Player, Question, QuizAttempt, Team } from '../types/basketball';
import {
  calculateTacticalGaps,
  calculateWeeklyLeaderboard,
  calculateWeeklyTrends,
  filterQuestionsForTeam,
  getWeekKey
} from '../utils/quizEngine';
import { getRegistrationUrl } from '../lib/firebase';
import {
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronRight,
  Copy,
  Check,
  SlidersHorizontal
} from 'lucide-react';

interface CoachAnalyticsViewProps {
  players: Player[];
  questions: Question[];
  attempts: QuizAttempt[];
  teams: Team[];
  selectedTeamId: string;
  onSelectTeamId: (teamId: string) => void;
  onOpenTeamConfig?: (team: Team) => void;
  onTogglePriorityFocus: (questionId: string) => void;
  onSelectPlayerDetail: (player: Player) => void;
}

export const CoachAnalyticsView: React.FC<CoachAnalyticsViewProps> = ({
  players,
  questions,
  attempts,
  teams,
  selectedTeamId,
  onSelectTeamId,
  onOpenTeamConfig,
  onTogglePriorityFocus,
  onSelectPlayerDetail
}) => {
  const currentWeek = getWeekKey();
  const activeTeam =
    selectedTeamId !== 'all' ? teams.find(t => t.id === selectedTeamId) || null : null;

  const scopedPlayers = activeTeam
    ? players.filter(p => activeTeam.playerIds.includes(p.id))
    : players;
  const scopedQuestions = activeTeam
    ? filterQuestionsForTeam(questions, activeTeam.id)
    : questions;
  const teamPlayerIdSet = new Set(scopedPlayers.map(p => p.id));
  const scopedAttempts = activeTeam
    ? attempts.filter(
        a =>
          teamPlayerIdSet.has(a.playerId) &&
          (!a.teamId || a.teamId === activeTeam.id)
      )
    : attempts;

  const gaps = calculateTacticalGaps(scopedQuestions, scopedAttempts);
  const leaderboard = calculateWeeklyLeaderboard(scopedPlayers, scopedAttempts, currentWeek);
  const weeklyTrends = calculateWeeklyTrends(scopedAttempts);

  const completedCount = leaderboard.filter(l => l.hasCompletedThisWeek).length;
  const totalAnswers = scopedAttempts.flatMap(a => a.answers);
  const overallAccuracy = totalAnswers.length > 0
    ? Math.round((totalAnswers.filter(a => a.isCorrect).length / totalAnswers.length) * 100)
    : 0;

  const [copiedInvite, setCopiedInvite] = useState(false);
  const registrationUrl = getRegistrationUrl();

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="space-y-6">
      {/* Private Registration Link Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Registrierungslink für Spieler</p>
          <p className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">{registrationUrl}</p>
        </div>
        <button
          onClick={handleCopyInvite}
          className="px-3.5 py-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 shrink-0 min-h-[38px] transition-colors"
        >
          {copiedInvite ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Kopiert</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-zinc-300" />
              <span>Link kopieren</span>
            </>
          )}
        </button>
      </div>
      {/* Team Filter Bar */}
      {teams.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => onSelectTeamId('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors min-h-[34px] ${
                !activeTeam
                  ? 'bg-red-700 text-white'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              Alle Teams ({players.length})
            </button>
            {teams.map(team => (
              <button
                key={team.id}
                type="button"
                onClick={() => onSelectTeamId(team.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors min-h-[34px] ${
                  activeTeam?.id === team.id
                    ? 'bg-red-700 text-white'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {team.name} ({team.playerIds.length})
              </button>
            ))}
          </div>

          {activeTeam && onOpenTeamConfig && (
            <button
              type="button"
              onClick={() => onOpenTeamConfig(activeTeam)}
              className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 min-h-[34px] whitespace-nowrap transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Team-Einstellungen</span>
            </button>
          )}
        </div>
      )}

      {/* 3 Simple Top Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-xs text-zinc-400">Diese Woche</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white mt-1">
            {completedCount}/{scopedPlayers.length}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">fertig</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-xs text-zinc-400">Team-Quote</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white mt-1">
            {overallAccuracy}%
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Gesamtschnitt</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-xs text-zinc-400">Versuche gesamt</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white mt-1">
            {scopedAttempts.length}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Durchgänge</div>
        </div>
      </div>

      {/* Team Improvement Trend Over Time */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Team-Entwicklung</h2>
            <p className="text-xs text-zinc-400">Durchschnittliche Trefferquote & Punkte pro Woche</p>
          </div>
        </div>

        {weeklyTrends.length === 0 ? (
          <div className="text-xs text-zinc-400 py-4">Noch nicht genügend Wochendaten vorhanden.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {weeklyTrends.map((wk, idx) => {
              const prev = idx > 0 ? weeklyTrends[idx - 1] : null;
              const diffAcc = prev ? wk.averageAccuracy - prev.averageAccuracy : 0;

              return (
                <div key={wk.weekKey} className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-zinc-200">
                      {wk.weekKey === currentWeek ? 'Diese Woche' : wk.weekKey}
                    </span>
                    <span className="text-zinc-500 tabular-nums">{wk.attemptCount} {wk.attemptCount === 1 ? 'Versuch' : 'Versuche'}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold font-mono tabular-nums text-white">
                      {wk.averageAccuracy}%
                    </span>
                    {prev && (
                      <span className={`text-xs font-mono font-medium ${diffAcc >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {diffAcc >= 0 ? `+${diffAcc}%` : `${diffAcc}%`}
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-600 rounded-full"
                      style={{ width: `${wk.averageAccuracy}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                    Ø Punkte: {wk.averageScore} Pkt.
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tactical Knowledge Gaps */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-white">Taktische Wissenslücken</h2>
          <p className="text-xs text-zinc-400">Sortiert von der niedrigsten zur höchsten Trefferquote. Markiere Fragen mit dem Stern als Fokus.</p>
        </div>

        <div className="divide-y divide-zinc-800/80">
          {gaps.map(gap => {
            const relatedQuestions = scopedQuestions.filter(q => q.tags.includes(gap.tag));
            const isLow = gap.totalAnswered > 0 && gap.accuracyPercentage < 65;

            return (
              <div key={gap.tag} className="py-3.5 first:pt-1 last:pb-1 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-white">{gap.tag}</span>
                  <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                    <span className="text-zinc-400">
                      {gap.correctAnswered}/{gap.totalAnswered}
                    </span>
                    <span className={`font-bold w-11 text-right ${isLow ? 'text-red-400' : 'text-white'}`}>
                      {gap.totalAnswered > 0 ? `${gap.accuracyPercentage}%` : '—'}
                    </span>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isLow ? 'bg-red-600' : 'bg-zinc-300'}`}
                    style={{ width: `${gap.totalAnswered > 0 ? Math.max(4, gap.accuracyPercentage) : 0}%` }}
                  />
                </div>

                {relatedQuestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {relatedQuestions.map(q => (
                      <button
                        key={q.id}
                        onClick={() => onTogglePriorityFocus(q.id)}
                        className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors min-h-[30px] ${
                          q.isPriorityFocus
                            ? 'bg-red-950/70 border-red-700/70 text-red-200 font-medium'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <Star className={`w-3 h-3 ${q.isPriorityFocus ? 'fill-red-500 text-red-500' : 'text-zinc-500'}`} />
                        <span className="truncate max-w-[180px]">{q.scenario || q.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Player Tracking & Attempts */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-white">Spielerfortschritt & Versuche</h2>
          <p className="text-xs text-zinc-400">Tippe auf einen Spieler für Details, Rolle oder zum Löschen.</p>
        </div>

        <div className="divide-y divide-zinc-800/80">
          {leaderboard.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-400">
              {activeTeam
                ? `Noch keine Spieler im Team „${activeTeam.name}“ ausgewählt.`
                : 'Noch keine Spieler registriert.'}
            </div>
          ) : (
            leaderboard.map(summary => {
              const playerAttempts = scopedAttempts
                .filter(a => a.playerId === summary.player.id)
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

              let trend: 'up' | 'down' | 'flat' = 'flat';
              if (playerAttempts.length >= 2) {
                const last = playerAttempts[playerAttempts.length - 1].totalScore;
                const prev = playerAttempts[playerAttempts.length - 2].totalScore;
                if (last > prev + 20) trend = 'up';
                else if (last < prev - 20) trend = 'down';
              }

              return (
                <button
                  key={summary.player.id}
                  onClick={() => onSelectPlayerDetail(summary.player)}
                  className="w-full flex items-center justify-between py-3 text-left hover:bg-zinc-800/50 transition-colors min-h-[56px]"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {summary.player.name}
                      {summary.player.role === 'coach' && (
                        <span className="text-red-400 font-medium ml-2 text-[11px]">Trainer</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 tabular-nums mt-0.5">
                      {summary.totalAttemptsAllTime} {summary.totalAttemptsAllTime === 1 ? 'Versuch' : 'Versuche'} gesamt · {summary.attemptsThisWeek} diese Woche
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 text-xs font-medium">
                        {trend === 'up' && (
                          <span className="text-emerald-400 inline-flex items-center gap-0.5">
                            <ArrowUpRight className="w-3.5 h-3.5" /> Steigend
                          </span>
                        )}
                        {trend === 'down' && (
                          <span className="text-red-400 inline-flex items-center gap-0.5">
                            <ArrowDownRight className="w-3.5 h-3.5" /> Fallend
                          </span>
                        )}
                        {trend === 'flat' && (
                          <span className="text-zinc-500 inline-flex items-center gap-0.5">
                            <Minus className="w-3.5 h-3.5" /> Konstant
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        {summary.hasCompletedThisWeek ? 'Fertig' : 'Offen'}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
