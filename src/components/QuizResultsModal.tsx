import React from 'react';
import { QuizAttempt, Question, Player } from '../types/basketball';
import { PlayerMedals, getOptionDisplayText } from '../utils/quizEngine';
import { PlayerLabel } from './PlayerLabel';
import { Check, X, RotateCcw, ArrowRight, Trophy } from 'lucide-react';

interface QuizResultsModalProps {
  attempt: QuizAttempt | null;
  questions: Question[];
  player: Player;
  medals?: PlayerMedals;
  isOpen: boolean;
  onClose: () => void;
  onRetake: () => void;
  onGoToLeaderboard: () => void;
}

export const QuizResultsModal: React.FC<QuizResultsModalProps> = ({
  attempt,
  questions,
  player,
  medals,
  isOpen,
  onClose,
  onRetake,
  onGoToLeaderboard
}) => {
  if (!isOpen || !attempt) return null;

  const questionMap = new Map<string, Question>();
  questions.forEach(q => questionMap.set(q.id, q));

  const passed = attempt.passed ?? (attempt.correctCount === attempt.totalQuestions);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Summary */}
        <div className={`p-6 text-center border-b border-zinc-800 space-y-3 ${passed ? 'bg-emerald-950/20' : 'bg-red-950/30'}`}>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 mb-1">
            {passed ? (
              <Trophy className="w-6 h-6 text-emerald-400" />
            ) : (
              <X className="w-6 h-6 text-red-400" />
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400 flex items-center justify-center gap-1.5 flex-wrap">
              <PlayerLabel name={player.name} medals={medals} />
              <span>· {passed ? 'Quiz erfolgreich bestanden! 🎉' : 'Quiz fehlgeschlagen ❌'}</span>
            </p>
            <h2 className="text-3xl font-bold font-mono tabular-nums text-white mt-1">
              {attempt.totalTimeSeconds.toFixed(1)}s
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              {passed
                ? `Alle ${attempt.totalQuestions} Fragen fehlerfrei gelöst (${attempt.totalTimeSeconds.toFixed(1)} Sekunden)`
                : `Fehler bei Frage ${attempt.correctCount + 1}. Ziel: ${attempt.totalQuestions} Fragen ohne Fehler.`}
            </p>
          </div>
        </div>

        {/* Question Review */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {attempt.answers.map((ans, idx) => {
            const q = questionMap.get(ans.questionId);
            if (!q) return null;

            const correctOption = q.options.find(o => o.isCorrect);

            return (
              <div
                key={ans.questionId}
                className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950 text-xs space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {ans.isCorrect ? (
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <span className="font-semibold text-zinc-100">
                      {idx + 1}. {q.scenario || q.title}
                    </span>
                  </div>
                  <span className="font-mono text-zinc-400 shrink-0 tabular-nums">
                    {ans.timeSpentSeconds.toFixed(1)}s
                  </span>
                </div>

                {!ans.isCorrect && correctOption && (() => {
                  const correctText = getOptionDisplayText(
                    correctOption.text,
                    Boolean(correctOption.imageUrl)
                  );
                  return (
                    <div className="pl-6 space-y-1.5">
                      <p className="text-zinc-400">
                        Richtig:{' '}
                        {correctText ? (
                          <span className="font-medium text-zinc-100">{correctText}</span>
                        ) : (
                          !correctOption.imageUrl && (
                            <span className="font-medium text-zinc-100">{correctOption.text}</span>
                          )
                        )}
                      </p>
                      {correctOption.imageUrl && (
                        <img
                          src={correctOption.imageUrl}
                          alt={correctText || 'Richtige Antwort'}
                          referrerPolicy="no-referrer"
                          className="max-h-24 rounded-lg border border-zinc-800 bg-black object-contain"
                        />
                      )}
                    </div>
                  );
                })()}

                {!ans.isCorrect && q.explanation && (
                  <div className="ml-6 mt-1.5 p-2.5 rounded-lg bg-amber-950/35 border border-amber-700/50 text-amber-100 leading-relaxed">
                    <span className="font-semibold text-amber-300">Trainer-Hinweis: </span>
                    {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex gap-2.5">
          <button
            onClick={onRetake}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[44px] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Nochmal versuchen</span>
          </button>
          <button
            onClick={onGoToLeaderboard}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 min-h-[44px] transition-colors"
          >
            <span>Zur Übersicht</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
