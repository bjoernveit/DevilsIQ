import React, { useState, useEffect, useRef } from 'react';
import { Question, QuizOption, QuizAttempt, QuizAttemptAnswer, Player } from '../types/basketball';
import { calculateQuestionScore, getWeekKey } from '../utils/quizEngine';
import { playBuzzer, playSwish } from '../utils/audio';
import { Timer, Check, X, ArrowRight, Volume2, VolumeX } from 'lucide-react';

interface QuizSessionProps {
  questions: Question[];
  player: Player;
  timePerQuestion: number;
  onFinishQuiz: (attempt: QuizAttempt) => void;
  onExit: () => void;
}

export const QuizSession: React.FC<QuizSessionProps> = ({
  questions,
  player,
  timePerQuestion,
  onFinishQuiz,
  onExit
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(timePerQuestion);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [recordedAnswers, setRecordedAnswers] = useState<QuizAttemptAnswer[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const hasVisualOptions = currentQuestion.options.some(o => Boolean(o.imageUrl));

  useEffect(() => {
    if (hasSubmittedAnswer) return;
    setTimeRemaining(timePerQuestion);

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, hasSubmittedAnswer]);

  const handleTimeExpired = () => {
    if (hasSubmittedAnswer) return;
    if (soundEnabled) playBuzzer();

    const answerRecord: QuizAttemptAnswer = {
      questionId: currentQuestion.id,
      selectedOptionId: 'TIME_EXPIRED',
      isCorrect: false,
      timeSpentSeconds: timePerQuestion,
      pointsEarned: 0
    };

    setStreak(0);
    setRecordedAnswers(prev => [...prev, answerRecord]);
    setHasSubmittedAnswer(true);
  };

  const handleSelectOption = (option: QuizOption) => {
    if (hasSubmittedAnswer) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedOptionId(option.id);
    const timeSpent = Math.max(1, timePerQuestion - timeRemaining);
    const isCorrect = option.isCorrect;

    let points = 0;
    if (isCorrect) {
      if (soundEnabled) playSwish();
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) setMaxStreak(nextStreak);
      points = calculateQuestionScore(true, timeRemaining, timePerQuestion, streak);
      setTotalScore(prev => prev + points);
    } else {
      if (soundEnabled) playBuzzer();
      setStreak(0);
    }

    const answerRecord: QuizAttemptAnswer = {
      questionId: currentQuestion.id,
      selectedOptionId: option.id,
      isCorrect,
      timeSpentSeconds: timeSpent,
      pointsEarned: points
    };

    setRecordedAnswers(prev => [...prev, answerRecord]);
    setHasSubmittedAnswer(true);
  };

  const handleNextQuestion = () => {
    if (isLastQuestion) {
      const totalTime = recordedAnswers.reduce((sum, a) => sum + a.timeSpentSeconds, 0);
      const correctCount = recordedAnswers.filter(a => a.isCorrect).length;

      onFinishQuiz({
        id: `att-${Date.now()}`,
        playerId: player.id,
        timestamp: new Date().toISOString(),
        weekKey: getWeekKey(),
        totalScore,
        correctCount,
        totalQuestions: questions.length,
        totalTimeSeconds: totalTime,
        maxStreak,
        answers: recordedAnswers
      });
    } else {
      setSelectedOptionId(null);
      setHasSubmittedAnswer(false);
      setCurrentIndex(prev => prev + 1);
    }
  };

  const isUrgent = timeRemaining <= 5 && !hasSubmittedAnswer;

  return (
    <div className="max-w-xl mx-auto px-4 py-4 flex flex-col min-h-[82vh] justify-between">
      {/* Top Quiz HUD */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-white">
              {currentIndex + 1} / {questions.length}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{totalScore} Pkt.</span>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1 font-mono font-semibold tabular-nums px-2 py-0.5 rounded-md ${
                isUrgent
                  ? 'bg-red-950 text-red-300 border border-red-700/70'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              {timeRemaining}s
            </span>

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
              aria-label={soundEnabled ? 'Ton stummschalten' : 'Ton aktivieren'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={onExit}
              className="text-zinc-400 hover:text-white min-h-[36px] px-1.5 font-medium transition-colors"
            >
              Beenden
            </button>
          </div>
        </div>

        {/* Thin Progress Bar */}
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-600 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question Card */}
      <div className="my-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="space-y-1.5">
          {currentQuestion.tags.length > 0 && (
            <div className="text-xs text-zinc-400">
              {currentQuestion.tags.join(' · ')}
            </div>
          )}
          <h2 className="text-base sm:text-lg font-semibold text-white leading-snug">
            {currentQuestion.scenario || currentQuestion.title}
          </h2>
        </div>

        {/* Question Image */}
        {currentQuestion.imageUrl && (
          <div className="rounded-xl overflow-hidden border border-zinc-800 max-h-60 bg-black">
            <img
              src={currentQuestion.imageUrl}
              alt={currentQuestion.scenario || currentQuestion.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain max-h-60"
            />
          </div>
        )}

        {/* Answer Options (Text and/or Image) */}
        <div className={hasVisualOptions ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1' : 'space-y-2.5 pt-1'}>
          {currentQuestion.options.map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const isSelected = selectedOptionId === opt.id;
            const isCorrect = opt.isCorrect;

            let cardStyle = 'bg-zinc-950 border-zinc-800 text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800/50';
            if (hasSubmittedAnswer) {
              if (isCorrect) {
                cardStyle = 'bg-emerald-950/50 border-emerald-600 text-emerald-100';
              } else if (isSelected) {
                cardStyle = 'bg-red-950/60 border-red-600 text-red-100';
              } else {
                cardStyle = 'bg-zinc-950/60 border-zinc-800/70 text-zinc-500 opacity-60';
              }
            }

            return (
              <button
                key={opt.id}
                disabled={hasSubmittedAnswer}
                onClick={() => handleSelectOption(opt)}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors flex flex-col gap-2.5 min-h-[52px] ${cardStyle}`}
              >
                <div className="flex items-start gap-3 w-full">
                  <span
                    className={`w-6 h-6 rounded-md font-mono font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                      hasSubmittedAnswer && isCorrect
                        ? 'bg-emerald-600 text-white'
                        : hasSubmittedAnswer && isSelected
                        ? 'bg-red-600 text-white'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {letter}
                  </span>

                  <span className="flex-1 text-sm font-medium leading-snug">
                    {opt.text}
                  </span>

                  {hasSubmittedAnswer && (
                    <span className="shrink-0 mt-0.5">
                      {isCorrect ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : isSelected ? (
                        <X className="w-4 h-4 text-red-400" />
                      ) : null}
                    </span>
                  )}
                </div>

                {opt.imageUrl && (
                  <div className="w-full rounded-lg overflow-hidden border border-zinc-800 max-h-36 bg-black">
                    <img
                      src={opt.imageUrl}
                      alt={opt.text}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain max-h-36"
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Minimal Post-Answer Feedback */}
        {hasSubmittedAnswer && (
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 leading-relaxed space-y-1">
            <div className="font-semibold text-white">
              {selectedOptionId && currentQuestion.options.find(o => o.id === selectedOptionId)?.isCorrect
                ? `Richtig (+${recordedAnswers[recordedAnswers.length - 1]?.pointsEarned || 0} Pkt.)`
                : selectedOptionId === 'TIME_EXPIRED'
                ? 'Zeit abgelaufen'
                : 'Falsch'}
            </div>
            {currentQuestion.explanation && <p>{currentQuestion.explanation}</p>}
          </div>
        )}
      </div>

      {/* Bottom Action */}
      <div>
        {hasSubmittedAnswer ? (
          <button
            onClick={handleNextQuestion}
            className="w-full h-12 rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            <span>{isLastQuestion ? 'Quiz beenden' : 'Nächste Frage'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="h-12" />
        )}
      </div>
    </div>
  );
};
