import React, { useState, useEffect } from 'react';
import { Player, QuizAttempt, Team } from '../types/basketball';
import {
  calculateWeeklyLeaderboard,
  calculateAllTimeLeaderboard,
  getWeekKey,
  isPlayerOnline,
  PlayerMedals
} from '../utils/quizEngine';
import { PlayerLabel } from './PlayerLabel';
import { Flame, Trophy } from 'lucide-react';

interface LeaderboardViewProps {
  players: Player[];
  attempts: QuizAttempt[];
  currentPlayerId: string;
  activeTeam?: Team | null;
  teams?: Team[];
  medalsByPlayer?: Map<string, PlayerMedals>;
  nowMs?: number;
  onSelectPlayerDetail?: (player: Player) => void;
  viewerIsCoach?: boolean;
  embedded?: boolean;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  players,
  attempts,
  currentPlayerId,
  activeTeam = null,
  teams = [],
  medalsByPlayer,
  nowMs = Date.now(),
  onSelectPlayerDetail,
  viewerIsCoach = false,
  embedded = false
}) => {
  const [boardType, setBoardType] = useState<'weekly' | 'alltime'>('weekly');
  const currentWeekKey = getWeekKey();
  const [selectedWeek, setSelectedWeek] = useState<string>(currentWeekKey);
  const [filterMode, setFilterMode] = useState<'all' | 'completed' | 'pending'>('all');
  const [scopeMode, setScopeMode] = useState<'team' | 'club'>(activeTeam ? 'team' : 'club');

  useEffect(() => {
    setScopeMode(activeTeam ? 'team' : 'club');
  }, [activeTeam?.id]);

  const effectiveScopeMode = viewerIsCoach ? scopeMode : activeTeam ? 'team' : 'club';
  const isTeamScoped = Boolean(activeTeam && effectiveScopeMode === 'team');
  const scopedPlayers = isTeamScoped && activeTeam
    ? players.filter(
        p =>
          activeTeam.playerIds.includes(p.id) ||
          (p.role === 'coach' &&
            attempts.some(a => a.playerId === p.id && a.teamId === activeTeam.id))
      )
    : viewerIsCoach
    ? players
    : players.filter(p => p.id === currentPlayerId);
  const scopedAttempts = isTeamScoped && activeTeam
    ? attempts.filter(a => a.teamId === activeTeam.id)
    : viewerIsCoach
    ? attempts
    : attempts.filter(a => a.playerId === currentPlayerId);

  const leaderboardData = boardType === 'weekly'
    ? calculateWeeklyLeaderboard(scopedPlayers, scopedAttempts, selectedWeek)
    : calculateAllTimeLeaderboard(scopedPlayers, scopedAttempts);

  const availableWeeks = Array.from(
    new Set([currentWeekKey, ...scopedAttempts.map(a => a.weekKey)])
  ).sort().reverse();

  const totalPlayers = scopedPlayers.length;
  const completedPlayers = leaderboardData.filter(d => d.hasCompletedThisWeek).length;

  const filteredLeaderboard = leaderboardData.filter(item => {
    if (filterMode === 'completed') return item.hasCompletedThisWeek;
    if (filterMode === 'pending') return !item.hasCompletedThisWeek;
    return true;
  });

  return (
    <div className={embedded ? 'space-y-4 pt-2' : 'max-w-2xl mx-auto px-4 py-6 space-y-5'}>
      {/* Board Type Selector Toggle */}
      <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
        <button
          onClick={() => setBoardType('weekly')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors min-h-[36px] ${
            boardType === 'weekly' ? 'bg-red-700 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Diese Woche
        </button>
        <button
          onClick={() => setBoardType('alltime')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors min-h-[36px] ${
            boardType === 'alltime' ? 'bg-red-700 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All-Time Rangliste
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          {embedded ? (
            <h2 className="text-base font-bold text-white">
              {boardType === 'weekly' ? 'Wochen-Rangliste' : 'All-Time Rangliste'}{isTeamScoped && activeTeam ? ` · ${activeTeam.name}` : ''}
            </h2>
          ) : (
            <h1 className="text-xl font-bold text-white">
              {boardType === 'weekly' ? 'Wochen-Rangliste' : 'All-Time Rangliste'}{isTeamScoped && activeTeam ? ` · ${activeTeam.name}` : ''}
            </h1>
          )}
          <p className="text-xs text-zinc-400 mt-0.5 tabular-nums">
            {completedPlayers} von {totalPlayers} Spielern · {boardType === 'weekly' ? (selectedWeek === currentWeekKey ? 'Diese Woche' : selectedWeek) : 'Gesamtwertung'}
          </p>
        </div>

        {/* Week Selector */}
        {boardType === 'weekly' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {availableWeeks.map(wk => (
              <button
                key={wk}
                onClick={() => setSelectedWeek(wk)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[36px] whitespace-nowrap ${
                  selectedWeek === wk
                    ? 'bg-red-700 text-white'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {wk === currentWeekKey ? 'Diese Woche' : wk.split('-')[1] || wk}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter & Team Scope Segmented Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
              filterMode === 'all' ? 'bg-red-700 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Alle ({totalPlayers})
          </button>
          <button
            onClick={() => setFilterMode('completed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
              filterMode === 'completed' ? 'bg-red-700 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Fertig ({completedPlayers})
          </button>
          <button
            onClick={() => setFilterMode('pending')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
              filterMode === 'pending' ? 'bg-red-700 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Offen ({totalPlayers - completedPlayers})
          </button>
        </div>

        {viewerIsCoach && activeTeam && (
          <div className="inline-flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => setScopeMode('team')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
                scopeMode === 'team' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {activeTeam.name}
            </button>
            <button
              type="button"
              onClick={() => setScopeMode('club')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] whitespace-nowrap ${
                scopeMode === 'club' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Alle Spieler
            </button>
          </div>
        )}
      </div>

      {/* Flat Standings List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/80 overflow-hidden">
        {filteredLeaderboard.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-400">
            Keine Spieler in dieser Ansicht.
          </div>
        ) : (
          filteredLeaderboard.map((item, index) => {
            const isMe = item.player.id === currentPlayerId;
            const canViewDetail = viewerIsCoach || isMe;
            const rank = index + 1;
            const playerTeams = !isTeamScoped
              ? teams.filter(t => t.playerIds.includes(item.player.id)).map(t => t.name)
              : [];

            const medals = medalsByPlayer?.get(item.player.id);
            const rowContent = (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-5 text-xs font-mono font-semibold text-zinc-500 tabular-nums shrink-0">
                    {rank}
                  </span>

                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5 min-w-0">
                      <PlayerLabel
                        name={item.player.name}
                        medals={medals}
                        isOnline={isPlayerOnline(item.player.lastRoundStartedAt, nowMs)}
                      />
                      {item.player.role === 'coach' && (
                        <span className="text-red-400 font-medium text-[11px] shrink-0">Trainer</span>
                      )}
                      {isMe && <span className="text-red-400 font-normal text-xs shrink-0">(Du)</span>}
                    </div>
                    <div className="text-xs text-zinc-400 tabular-nums truncate">
                      {item.attemptsThisWeek} {item.attemptsThisWeek === 1 ? 'Versuch' : 'Versuche'}
                      {playerTeams.length > 0 && ` · ${playerTeams.join(', ')}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-right">
                  <div>
                    <div
                      className={`text-sm font-bold font-mono tabular-nums inline-flex items-center justify-end gap-1 ${
                        item.currentStreak > 0 ? 'text-amber-400' : 'text-zinc-500'
                      }`}
                      title={`${item.currentStreak} ${item.currentStreak === 1 ? 'Durchgang' : 'Durchgänge'} in Folge ohne Fehler`}
                    >
                      <Flame
                        className={`w-3.5 h-3.5 ${
                          item.currentStreak > 0
                            ? 'fill-amber-400/20 text-amber-400'
                            : 'text-zinc-600'
                        }`}
                      />
                      <span>{item.currentStreak}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Serie
                    </div>
                  </div>

                  {boardType === 'alltime' && (
                    <div>
                      <div
                        className={`text-sm font-bold font-mono tabular-nums inline-flex items-center justify-end gap-1 ${
                          item.bestStreak > 0 ? 'text-amber-300' : 'text-zinc-500'
                        }`}
                        title={`Maximale Serie: ${item.bestStreak} ${item.bestStreak === 1 ? 'Durchgang' : 'Durchgänge'} in Folge ohne Fehler`}
                      >
                        <Trophy
                          className={`w-3.5 h-3.5 ${
                            item.bestStreak > 0 ? 'text-amber-400' : 'text-zinc-600'
                          }`}
                        />
                        <span>{item.bestStreak}</span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Max. Serie
                      </div>
                    </div>
                  )}

                  <div className="min-w-[54px]">
                    <div className="text-sm font-bold font-mono tabular-nums text-white">
                      {item.bestScoreThisWeek > 0 ? `${item.bestScoreThisWeek.toFixed(1)}s` : '—'}
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                      {item.bestScoreThisWeek > 0 ? 'Bestzeit' : 'Offen'}
                    </div>
                  </div>
                </div>
              </>
            );

            if (canViewDetail && onSelectPlayerDetail) {
              return (
                <button
                  key={item.player.id}
                  onClick={() => onSelectPlayerDetail(item.player)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-zinc-800/60 min-h-[60px] cursor-pointer ${
                    isMe ? 'bg-red-950/35' : ''
                  }`}
                >
                  {rowContent}
                </button>
              );
            }

            return (
              <div
                key={item.player.id}
                className={`w-full flex items-center justify-between px-4 py-3.5 text-left min-h-[60px] ${
                  isMe ? 'bg-red-950/35' : ''
                }`}
              >
                {rowContent}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
