import React from 'react';
import { QuizConfig } from '../types/basketball';
import { X } from 'lucide-react';

interface QuizConfigModalProps {
  config: QuizConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: QuizConfig) => void;
  availableTags: string[];
}

export const QuizConfigModal: React.FC<QuizConfigModalProps> = ({
  config,
  isOpen,
  onClose,
  onSave,
  availableTags
}) => {
  const [questionCount, setQuestionCount] = React.useState(config.questionCount);
  const [timePerQuestion, setTimePerQuestion] = React.useState(config.timePerQuestionSeconds);
  const [prioritizeFocus, setPrioritizeFocus] = React.useState(config.prioritizeFocusQuestions);
  const [ensureDiverse, setEnsureDiverse] = React.useState(config.ensureDiverseTopics);
  const [selectedTags, setSelectedTags] = React.useState<string[]>(config.selectedTags || []);

  React.useEffect(() => {
    if (isOpen) {
      setQuestionCount(config.questionCount);
      setTimePerQuestion(config.timePerQuestionSeconds);
      setPrioritizeFocus(config.prioritizeFocusQuestions);
      setEnsureDiverse(config.ensureDiverseTopics);
      setSelectedTags(config.selectedTags || []);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleToggleTag = (tag: string) => {
    setSelectedTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
  };

  const handleSave = () => {
    onSave({
      questionCount,
      timePerQuestionSeconds: timePerQuestion,
      prioritizeFocusQuestions: prioritizeFocus,
      ensureDiverseTopics: ensureDiverse,
      selectedTags: selectedTags.length > 0 ? selectedTags : undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-bold text-white">Quiz-Einstellungen</h2>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-sm">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              Fragen pro Quiz
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[3, 5, 8, 10].map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuestionCount(count)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[42px] ${
                    questionCount === count
                      ? 'bg-red-700 border-red-700 text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              Sekunden pro Frage
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[15, 24, 35].map(time => (
                <button
                  key={time}
                  type="button"
                  onClick={() => setTimePerQuestion(time)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[42px] ${
                    timePerQuestion === time
                      ? 'bg-red-700 border-red-700 text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {time}s
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-zinc-800">
            <label className="flex items-start gap-3 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={prioritizeFocus}
                onChange={e => setPrioritizeFocus(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-red-600"
              />
              <div>
                <div className="text-xs font-semibold text-white">Trainingsfokus priorisieren</div>
                <div className="text-[11px] text-zinc-400">Markierte Fragen erscheinen häufiger</div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={ensureDiverse}
                onChange={e => setEnsureDiverse(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-red-600"
              />
              <div>
                <div className="text-xs font-semibold text-white">Themen abwechslungsreich mischen</div>
                <div className="text-[11px] text-zinc-400">Vermeidet Wiederholungen und deckt verschiedene Themen ab</div>
              </div>
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-zinc-300">Themen filtern (Optional)</span>
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="text-[11px] text-zinc-400 hover:text-white"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map(tag => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors min-h-[30px] ${
                      isSelected
                        ? 'bg-red-700 border-red-700 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-zinc-800 bg-zinc-950">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 text-xs font-semibold min-h-[40px] transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold text-xs min-h-[40px] transition-colors"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};
