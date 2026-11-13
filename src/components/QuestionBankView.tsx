import React, { useState } from 'react';
import { Question, Team } from '../types/basketball';
import { Plus, Search, Star, Trash2, Edit3, X } from 'lucide-react';

interface QuestionBankViewProps {
  questions: Question[];
  teams: Team[];
  selectedTeamFilter: string;
  onChangeTeamFilter: (teamFilter: string) => void;
  topicLabels: string[];
  onAddQuestion: () => void;
  onEditQuestion: (question: Question) => void;
  onDeleteQuestion: (questionId: string) => void;
  onTogglePriorityFocus: (questionId: string) => void;
  onRemoveTopicLabel: (tag: string) => Promise<void>;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  questions,
  teams,
  selectedTeamFilter,
  onChangeTeamFilter,
  topicLabels,
  onAddQuestion,
  onEditQuestion,
  onDeleteQuestion,
  onTogglePriorityFocus,
  onRemoveTopicLabel
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [onlyFocus, setOnlyFocus] = useState<boolean>(false);
  const [isEditingLabels, setIsEditingLabels] = useState<boolean>(false);
  const [removingTag, setRemovingTag] = useState<string | null>(null);

  const allTags = Array.from(new Set([...topicLabels, ...questions.flatMap(q => q.tags)])).sort();

  const teamNameById = new Map(teams.map(t => [t.id, t.name]));

  const filteredQuestions = questions.filter(q => {
    const matchesSearch =
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.scenario.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (selectedTag !== 'All' && !q.tags.includes(selectedTag)) return false;
    if (onlyFocus && !q.isPriorityFocus) return false;

    const isGlobal = !q.teamIds || q.teamIds.length === 0;
    if (selectedTeamFilter === 'global' && !isGlobal) return false;
    if (
      selectedTeamFilter !== 'all' &&
      selectedTeamFilter !== 'global' &&
      !(isGlobal || q.teamIds?.includes(selectedTeamFilter))
    ) {
      return false;
    }

    return true;
  });

  const priorityCount = questions.filter(q => q.isPriorityFocus).length;

  const handleRemoveLabel = async (tag: string) => {
    setRemovingTag(tag);
    try {
      await onRemoveTopicLabel(tag);
      if (selectedTag === tag) {
        setSelectedTag('All');
      }
    } finally {
      setRemovingTag(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search + Filters + Add Button */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Fragen oder Themen suchen..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 min-h-[44px]"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setOnlyFocus(!onlyFocus)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors min-h-[44px] whitespace-nowrap ${
              onlyFocus
                ? 'bg-red-950/70 border-red-700/70 text-red-200'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${onlyFocus ? 'fill-red-500 text-red-500' : 'text-zinc-500'}`} />
            <span>Fokus ({priorityCount})</span>
          </button>

          <button
            onClick={onAddQuestion}
            className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold text-xs flex items-center gap-1.5 min-h-[44px] whitespace-nowrap transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Neu</span>
          </button>
        </div>
      </div>

      {/* Team Scope Filter Row */}
      {teams.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => onChangeTeamFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors min-h-[34px] ${
              selectedTeamFilter === 'all'
                ? 'bg-red-700 text-white font-medium'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            Alle Fragen
          </button>
          <button
            type="button"
            onClick={() => onChangeTeamFilter('global')}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors min-h-[34px] ${
              selectedTeamFilter === 'global'
                ? 'bg-red-700 text-white font-medium'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            Für alle Teams
          </button>
          {teams.map(team => (
            <button
              key={team.id}
              type="button"
              onClick={() => onChangeTeamFilter(team.id)}
              className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors min-h-[34px] ${
                selectedTeamFilter === team.id
                  ? 'bg-red-700 text-white font-medium'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {team.name}
            </button>
          ))}
        </div>
      )}

      {/* Topic Filter Row */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedTag('All')}
          className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors min-h-[34px] ${
            selectedTag === 'All'
              ? 'bg-red-700 text-white font-medium'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          Alle ({questions.length})
        </button>

        {allTags.map(tag => (
          <div
            key={tag}
            className={`inline-flex items-center rounded-lg border text-xs whitespace-nowrap transition-colors min-h-[34px] ${
              selectedTag === tag
                ? 'bg-red-700 border-red-700 text-white font-medium'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setSelectedTag(tag)}
              className="px-3 py-1.5 text-left"
            >
              {tag}
            </button>
            {isEditingLabels && (
              <button
                type="button"
                disabled={removingTag === tag}
                onClick={() => handleRemoveLabel(tag)}
                aria-label={`Label ${tag} entfernen`}
                title={`„${tag}“ entfernen`}
                className={`pr-2 pl-0.5 py-1.5 flex items-center justify-center disabled:opacity-40 ${
                  selectedTag === tag ? 'text-red-200 hover:text-white' : 'text-zinc-400 hover:text-red-400'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {allTags.length > 0 && (
          <button
            type="button"
            onClick={() => setIsEditingLabels(prev => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors min-h-[34px] ${
              isEditingLabels
                ? 'text-red-300 font-semibold bg-red-950/70'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {isEditingLabels ? 'Fertig' : 'Labels entfernen'}
          </button>
        )}
      </div>

      {/* Clean Question List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/80 overflow-hidden">
        {filteredQuestions.length === 0 ? (
          <div className="py-12 text-center px-4">
            <p className="text-xs text-zinc-400">
              {questions.length === 0 ? 'Noch keine Fragen im Katalog.' : 'Keine Fragen passend zu den Filtern.'}
            </p>
          </div>
        ) : (
          filteredQuestions.map(q => {
            const promptText = q.scenario || q.title;
            const hasOptionImages = q.options.some(o => Boolean(o.imageUrl));
            const validTeamNames = (q.teamIds || [])
              .map(id => teamNameById.get(id))
              .filter((name): name is string => Boolean(name));
            const teamLabel = validTeamNames.length > 0 ? validTeamNames.join(', ') : 'Alle Teams';

            return (
              <div
                key={q.id}
                className="p-4 flex items-start justify-between gap-3 hover:bg-zinc-800/40 transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-xs text-zinc-400 flex items-center gap-1.5 flex-wrap">
                    <span className={validTeamNames.length > 0 ? 'text-red-300 font-medium' : 'text-zinc-300'}>
                      {teamLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{q.tags.length > 0 ? q.tags.join(', ') : 'Ohne Label'}</span>
                    {(q.imageUrl || hasOptionImages) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-zinc-300 font-medium">
                          {hasOptionImages ? 'Bild-Antworten' : 'Mit Bild'}
                        </span>
                      </>
                    )}
                  </div>

                  <p className="text-sm font-medium text-white leading-snug line-clamp-2">
                    {promptText}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onTogglePriorityFocus(q.id)}
                    className="p-2 rounded-lg hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors"
                    title={q.isPriorityFocus ? 'Aus Wochenfokus entfernen' : 'Für Wochenfokus priorisieren'}
                    aria-label={`Trainingsfokus umschalten für ${promptText}`}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        q.isPriorityFocus ? 'fill-red-500 text-red-500' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => onEditQuestion(q)}
                    className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors"
                    aria-label={`Frage bearbeiten: ${promptText}`}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onDeleteQuestion(q.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800 min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors"
                    aria-label={`Frage löschen: ${promptText}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
