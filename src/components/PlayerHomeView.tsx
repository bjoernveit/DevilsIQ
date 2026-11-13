import React from 'react';
import { Player, QuizAttempt, QuizConfig, Team } from '../types/basketball';
import { calculateWeeklyLeaderboard, getWeekKey } from '../utils/quizEngine';
import { LeaderboardView } from './LeaderboardView';
import { Play, SlidersHorizontal, Check, Clock } from 'lucide-react';

interface PlayerHomeViewProps {
  player: Player;
  players: Player[];
  attempts: QuizAttempt[];
  teams: Team[];
  selectableTeams: Team[];
  activeTeam: Team | null;
  onSelectTeamId: (teamId: string | null) => void;
  quizConfig: QuizConfig;
  questionCount: number;
  isCoach: boolean;
  onStartQuiz: () => void;
  onOpenConfig: () => void;
  onSelectPlayerDetail?: (player: Player) => void;
  onGoToCoachQuestions?: () => void;
}

export const PlayerHomeView: React.FC<PlayerHomeViewProps> = ({
  player,
  players,
  attempts,
  teams,
  selectableTeams,
  activeTeam,
  onSelectTeamId,
  quizConfig,
  questionCount,
  isCoach,
  onStartQuiz,
  onOpenConfig,
  onSelectPlayerDetail,
  onGoToCoachQuestions
}) => {
  const currentWeek = getWeekKey();
  const scopedAttempts = activeTeam
    ? attempts.filter(a => !a.teamId || a.teamId === activeTeam.id)
    : attempts;

  const leaderboard = calculateWeeklyLeaderboard([player], scopedAttempts, currentWeek);
  const mySummary = leaderboard[0];

  const hasCompleted = mySummary?.hasCompletedThisWeek ?? false;
  const bestScore = mySummary?.bestScoreThisWeek ?? 0;
  const attemptsThisWeek = mySummary?.attemptsThisWeek ?? 0;
  const effectiveCount = Math.min(quizConfig.questionCount, questionCount);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10 space-y-8">
      {/* Player Identity Row & Team Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-zinc-400">
            KW {currentWeek.split('-W')[1] || currentWeek}
            {activeTeam ? ` · ${activeTeam.name}` : ''}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">
            {player.name}
          </h1>
        </div>

        {(selectableTeams.length > 1 || (isCoach && selectableTeams.length > 0)) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {isCoach && (
              <button
                type="button"
                onClick={() => onSelectTeamId(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[34px] whitespace-nowrap ${
                  !activeTeam
                    ? 'bg-red-700 text-white'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                Standard
              </button>
            )}
            {selectableTeams.map(team => (
              <button
                key={team.id}
                type="button"
                onClick={() => onSelectTeamId(team.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[34px] whitespace-nowrap ${
                  activeTeam?.id === team.id
                    ? 'bg-red-700 text-white'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {team.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Weekly Quiz Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
        {/* Status Line */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            {hasCompleted ? (
              <span className="w-6 h-6 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/70 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </span>
            ) : (
              <span className="w-6 h-6 rounded-full bg-red-950 text-red-400 border border-red-800/70 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5" />
              </span>
            )}
            <div>
              <p className="text-sm font-semibold text-white">
                {hasCompleted ? 'Wochenquiz abgeschlossen' : 'Wochenquiz offen'}
              </p>
              <p className="text-xs text-zinc-400">
                {hasCompleted
                  ? `${attemptsThisWeek} ${attemptsThisWeek === 1 ? 'Versuch' : 'Versuche'} diese Woche`
                  : 'Mindestens einmal diese Woche abschließen'}
              </p>
            </div>
          </div>

          {hasCompleted && (
            <div className="text-right">
              <p className="text-lg font-bold font-mono tabular-nums text-white">
                {bestScore > 0 ? `${bestScore.toFixed(1)}s` : '—'}
              </p>
              <p className="text-[11px] text-zinc-400">
                {mySummary?.averageTimeThisWeek && mySummary.averageTimeThisWeek > 0 && mySummary.averageTimeThisWeek !== bestScore
                  ? `Bestzeit (Ø ${mySummary.averageTimeThisWeek.toFixed(1)}s)`
                  : 'Bestzeit'}
              </p>
            </div>
          )}
        </div>

        {/* Simple Quiz Parameters & Settings Trigger */}
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>
            {effectiveCount > 0
              ? `${effectiveCount} ${effectiveCount === 1 ? 'Frage' : 'Fragen'} · ${quizConfig.timePerQuestionSeconds}s pro Frage`
              : 'Noch keine passenden Fragen vorhanden'}
          </span>
          {isCoach && (
            <button
              onClick={onOpenConfig}
              className="text-zinc-300 hover:text-white font-medium inline-flex items-center gap-1.5 py-1.5 px-2 -mr-2 rounded-lg hover:bg-zinc-800 min-h-[36px] transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Anpassen</span>
            </button>
          )}
        </div>

        {/* Primary CTA */}
        {effectiveCount > 0 ? (
          <button
            onClick={onStartQuiz}
            className="w-full h-12 rounded-xl bg-red-700 hover:bg-red-600 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Let's Go!</span>
          </button>
        ) : isCoach && onGoToCoachQuestions ? (
          <button
            onClick={onGoToCoachQuestions}
            className="w-full h-12 rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all"
          >
            <span>Fragen im Trainer-Bereich hinzufügen</span>
          </button>
        ) : (
          <div className="w-full h-12 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 font-medium text-xs flex items-center justify-center">
            Warte auf Fragen vom Trainer
          </div>
        )}
      </div>

      {/* Inline Weekly Leaderboard */}
      <LeaderboardView
        players={players}
        attempts={attempts}
        currentPlayerId={player.id}
        activeTeam={activeTeam}
        teams={teams}
        onSelectPlayerDetail={onSelectPlayerDetail}
        viewerIsCoach={isCoach}
        embedded
      />
    </div>
  );
};
