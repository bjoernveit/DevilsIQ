import React, { useState, useEffect } from 'react';
import { Player, Question, Team } from '../types/basketball';
import { filterQuestionsForTeam, isPlayerOnline, PlayerMedals } from '../utils/quizEngine';
import { PlayerLabel } from './PlayerLabel';
import {
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Check,
  Edit3,
  BookOpen,
  UserPlus
} from 'lucide-react';

interface CoachTeamsViewProps {
  teams: Team[];
  players: Player[];
  questions: Question[];
  medalsByPlayer?: Map<string, PlayerMedals>;
  nowMs?: number;
  selectedTeamId: string | null;
  onSelectTeamId: (teamId: string | null) => void;
  onCreateTeam: (name: string) => Promise<string>;
  onUpdateTeam: (
    teamId: string,
    updates: { name?: string; playerIds?: string[] }
  ) => Promise<void>;
  onSetDefaultTeam: (teamId: string | null) => Promise<void>;
  onDeleteTeam: (teamId: string) => Promise<void>;
  onOpenTeamConfig: (team: Team) => void;
  onGoToTeamQuestions: (teamId: string) => void;
}

export const CoachTeamsView: React.FC<CoachTeamsViewProps> = ({
  teams,
  players,
  questions,
  medalsByPlayer,
  nowMs = Date.now(),
  selectedTeamId,
  onSelectTeamId,
  onCreateTeam,
  onUpdateTeam,
  onSetDefaultTeam,
  onDeleteTeam,
  onOpenTeamConfig,
  onGoToTeamQuestions
}) => {
  const [newTeamName, setNewTeamName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeTeam = teams.find(t => t.id === selectedTeamId) || teams[0] || null;

  useEffect(() => {
    setIsEditingName(false);
    setConfirmDelete(false);
    setErrorMsg(null);
    if (activeTeam) {
      setDraftName(activeTeam.name);
    }
  }, [activeTeam?.id, activeTeam?.name]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTeamName.trim();
    if (!trimmed || isCreating) return;
    setErrorMsg(null);
    setIsCreating(true);
    try {
      const createdId = await onCreateTeam(trimmed);
      setNewTeamName('');
      onSelectTeamId(createdId);
    } catch {
      setErrorMsg('Team konnte nicht erstellt werden.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRenameSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeam) return;
    const trimmed = draftName.trim();
    if (!trimmed || isSaving) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onUpdateTeam(activeTeam.id, { name: trimmed });
      setIsEditingName(false);
    } catch {
      setErrorMsg('Teamname konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePlayer = async (playerId: string) => {
    if (!activeTeam || isSaving) return;
    setErrorMsg(null);
    const exists = activeTeam.playerIds.includes(playerId);
    const nextIds = exists
      ? activeTeam.playerIds.filter(id => id !== playerId)
      : [...activeTeam.playerIds, playerId];

    setIsSaving(true);
    try {
      await onUpdateTeam(activeTeam.id, { playerIds: nextIds });
    } catch {
      setErrorMsg('Spielerauswahl konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectAllFiltered = async (select: boolean) => {
    if (!activeTeam || isSaving) return;
    setErrorMsg(null);
    const currentSet = new Set(activeTeam.playerIds);
    for (const p of filteredPlayers) {
      if (select) currentSet.add(p.id);
      else currentSet.delete(p.id);
    }
    setIsSaving(true);
    try {
      await onUpdateTeam(activeTeam.id, { playerIds: Array.from(currentSet) });
    } catch {
      setErrorMsg('Spielerauswahl konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDeleteTeam = async () => {
    if (!activeTeam || isSaving) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onDeleteTeam(activeTeam.id);
      setConfirmDelete(false);
      onSelectTeamId(null);
    } catch {
      setErrorMsg('Team konnte nicht gelöscht werden.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDefaultTeam = async () => {
    if (!activeTeam || isSaving) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onSetDefaultTeam(activeTeam.isDefault ? null : activeTeam.id);
    } catch {
      setErrorMsg('Standard-Team konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const filteredPlayers = sortedPlayers.filter(p =>
    p.name.toLowerCase().includes(playerSearch.trim().toLowerCase()) ||
    (p.username && p.username.toLowerCase().includes(playerSearch.trim().toLowerCase()))
  );

  const teamApplicableQuestions = activeTeam
    ? filterQuestionsForTeam(questions, activeTeam.id)
    : [];
  const teamSpecificCount = activeTeam
    ? questions.filter(q => q.teamIds && q.teamIds.includes(activeTeam.id)).length
    : 0;
  const globalQuestionCount = questions.filter(
    q => !q.teamIds || q.teamIds.length === 0
  ).length;

  return (
    <div className="space-y-5">
      {/* Create New Team Bar */}
      <form
        onSubmit={handleCreateSubmit}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-2.5"
      >
        <input
          type="text"
          maxLength={64}
          value={newTeamName}
          onChange={e => setNewTeamName(e.target.value)}
          placeholder="Neues Team (z. B. Herren 1, U18, Damen)..."
          className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 min-h-[42px]"
        />
        <button
          type="submit"
          disabled={!newTeamName.trim() || isCreating}
          className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5 min-h-[42px] whitespace-nowrap shrink-0 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>{isCreating ? 'Erstellen...' : 'Team erstellen'}</span>
        </button>
      </form>

      {errorMsg && (
        <div
          role="alert"
          className="text-xs text-red-200 bg-red-950/70 border border-red-800 rounded-xl px-4 py-2.5"
        >
          {errorMsg}
        </div>
      )}

      {teams.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-white">Noch keine Teams angelegt</p>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            Erstelle gemeinsame Teams für alle Trainer. Jedem Team kannst du beliebige Spieler, eigene Quiz-Einstellungen und team-spezifische Fragen zuweisen.
          </p>
        </div>
      ) : (
        <>
          {/* Shared Team Selector Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {teams.map(team => {
              const isSelected = activeTeam?.id === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => onSelectTeamId(team.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors min-h-[38px] tabular-nums inline-flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-red-700 text-white font-semibold'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span>
                    {team.name} ({team.playerIds.length})
                  </span>
                  {team.isDefault && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        isSelected
                          ? 'bg-black/25 text-white'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                      }`}
                    >
                      Standard
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTeam && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Active Team Header & Actions */}
              <div className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditingName ? (
                      <form onSubmit={handleRenameSave} className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={64}
                          value={draftName}
                          onChange={e => setDraftName(e.target.value)}
                          autoFocus
                          className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-sm font-bold text-white focus:outline-none focus:border-red-600 min-h-[36px]"
                        />
                        <button
                          type="submit"
                          disabled={!draftName.trim() || isSaving}
                          className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-xs font-semibold text-white min-h-[36px]"
                        >
                          Speichern
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingName(false);
                            setDraftName(activeTeam.name);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white min-h-[36px]"
                        >
                          Abbrechen
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-white truncate">
                          {activeTeam.name}
                        </h2>
                        <button
                          type="button"
                          onClick={() => setIsEditingName(true)}
                          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                          aria-label="Team umbenennen"
                          title="Team umbenennen"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400 mt-1 tabular-nums">
                      <span>{activeTeam.playerIds.length} Spieler</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {activeTeam.questionCount}{' '}
                        {activeTeam.questionCount === 1 ? 'Frage' : 'Fragen'} ·{' '}
                        {activeTeam.timePerQuestionSeconds}s
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {teamApplicableQuestions.length} aktive Fragen ({teamSpecificCount} Team, {globalQuestionCount} Alle)
                      </span>
                    </div>
                    {activeTeam.isDefault && (
                      <p className="text-[11px] text-emerald-400 mt-1.5">
                        Standard-Team: Neue Spieler werden bei der Registrierung automatisch hinzugefügt.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleToggleDefaultTeam}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 min-h-[38px] whitespace-nowrap transition-colors ${
                        activeTeam.isDefault
                          ? 'border-emerald-700/70 bg-emerald-950/60 hover:bg-emerald-900/50 text-emerald-200'
                          : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      }`}
                      title="Neue Spieler bei Registrierung automatisch diesem Team hinzufügen"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{activeTeam.isDefault ? 'Standard-Team ✓' : 'Als Standard-Team'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenTeamConfig(activeTeam)}
                      className="px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white inline-flex items-center gap-1.5 min-h-[38px] whitespace-nowrap transition-colors"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Einstellungen</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onGoToTeamQuestions(activeTeam.id)}
                      className="px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white inline-flex items-center gap-1.5 min-h-[38px] whitespace-nowrap transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Fragen</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmDelete(prev => !prev)}
                      className="p-2 rounded-xl border border-zinc-800 bg-zinc-950 hover:border-red-800 text-zinc-400 hover:text-red-400 min-h-[38px] min-w-[38px] flex items-center justify-center transition-colors"
                      aria-label={`Team ${activeTeam.name} löschen`}
                      title="Team löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {confirmDelete && (
                  <div className="bg-red-950/50 border border-red-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-xs text-red-100">
                      Team „{activeTeam.name}“ wirklich löschen? Zugewiesene Fragen bleiben im Katalog erhalten.
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 min-h-[34px]"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={handleConfirmDeleteTeam}
                        className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-xs font-semibold text-white min-h-[34px]"
                      >
                        {isSaving ? 'Löschen...' : 'Endgültig löschen'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Player Selection Section */}
              <div className="border-t border-zinc-800 p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h3 className="text-xs font-semibold text-white">
                      Spieler auswählen ({activeTeam.playerIds.length} / {players.length})
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Alle Trainer sehen dieselbe Team-Auswahl. Ein Spieler kann in mehreren Teams sein.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isSaving || filteredPlayers.length === 0}
                      onClick={() => handleSelectAllFiltered(true)}
                      className="text-xs font-medium text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 disabled:opacity-50 transition-colors"
                    >
                      Alle wählen
                    </button>
                    <button
                      type="button"
                      disabled={isSaving || activeTeam.playerIds.length === 0}
                      onClick={() => handleSelectAllFiltered(false)}
                      className="text-xs font-medium text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 disabled:opacity-50 transition-colors"
                    >
                      Keine
                    </button>
                  </div>
                </div>

                {/* Search players */}
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                    placeholder="Spieler suchen..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 min-h-[40px]"
                  />
                </div>

                {/* Clickable Player List */}
                <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
                  {filteredPlayers.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-400">
                      Keine passenden Spieler gefunden.
                    </div>
                  ) : (
                    filteredPlayers.map(member => {
                      const isInTeam = activeTeam.playerIds.includes(member.id);
                      const otherTeams = teams
                        .filter(t => t.id !== activeTeam.id && t.playerIds.includes(member.id))
                        .map(t => t.name);

                      return (
                        <button
                          key={member.id}
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleTogglePlayer(member.id)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors min-h-[48px] ${
                            isInTeam ? 'bg-red-950/25 hover:bg-red-950/40' : 'hover:bg-zinc-900'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isInTeam
                                  ? 'bg-red-700 border-red-600 text-white'
                                  : 'bg-zinc-900 border-zinc-700 text-transparent'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            </span>

                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-white flex items-center gap-1.5 min-w-0">
                                <PlayerLabel
                                  name={member.name}
                                  medals={medalsByPlayer?.get(member.id)}
                                  isOnline={isPlayerOnline(member.lastRoundStartedAt, nowMs)}
                                />
                                {member.role === 'coach' && (
                                  <span className="text-red-400 font-medium text-[11px] shrink-0">
                                    Trainer
                                  </span>
                                )}
                              </div>
                              {otherTeams.length > 0 && (
                                <div className="text-[11px] text-zinc-500 truncate">
                                  Auch in: {otherTeams.join(', ')}
                                </div>
                              )}
                            </div>
                          </div>

                          <span
                            className={`text-[11px] font-medium shrink-0 ml-2 ${
                              isInTeam ? 'text-red-300' : 'text-zinc-500'
                            }`}
                          >
                            {isInTeam ? 'Im Team' : 'Hinzufügen'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
