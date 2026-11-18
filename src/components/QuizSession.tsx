import React, { useState, useEffect, useRef } from 'react';
import { Question, QuizOption, QuizAttempt, QuizAttemptAnswer, Player } from '../types/basketball';
import { getWeekKey, getOptionDisplayText } from '../utils/quizEngine';
import { playBuzzer, playSwish } from '../utils/audio';
import { trackEvent } from '../lib/analytics';
import { Timer, Check, X, Volume2, VolumeX } from 'lucide-react';

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
  const [countdown, setCountdown] = useState(3);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(timePerQuestion);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [recordedAnswers, setRecordedAnswers] = useState<QuizAttemptAnswer[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const questionStartTimeRef = useRef<number>(Date.now());
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStarted = countdown <= 0;
  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const [shuffledOptions, setShuffledOptions] = useState<QuizOption[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timeout = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [countdown]);

  useEffect(() => {
    if (!currentQuestion) return;
    const shuffled = [...currentQuestion.options].sort(() => Math.random() - 0.5);
    setShuffledOptions(shuffled);
  }, [currentIndex, currentQuestion]);

  const hasVisualOptions = shuffledOptions.some(o => Boolean(o.imageUrl));

  useEffect(() => {
    if (!isStarted) return;
    startTimeRef.current = Date.now();
  }, [isStarted]);

  useEffect(() => {
    if (!isStarted) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    questionStartTimeRef.current = Date.now();
    setTimeRemaining(timePerQuestion);

    if (hasSubmittedAnswer) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const elapsedOnQuestion = (Date.now() - questionStartTimeRef.current) / 1000;
      const remaining = Math.max(0, Math.round((timePerQuestion - elapsedOnQuestion) * 10) / 10);
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        handleTimeExpired();
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStarted, currentIndex, hasSubmittedAnswer, timePerQuestion]);

  // Unmount cleanup for transition timer
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  const finishSession = (answers: QuizAttemptAnswer[], passed: boolean) => {
    const totalTime = Math.max(0.1, Math.round((Date.now() - startTimeRef.current) / 100) / 10);
    const correctCount = answers.filter(a => a.isCorrect).length;

    onFinishQuiz({
      id: `att-${Date.now()}`,
      playerId: player.id,
      timestamp: new Date().toISOString(),
      weekKey: getWeekKey(),
      totalScore: totalTime, // Score is time in seconds (lower is better)
      correctCount,
      totalQuestions: questions.length,
      totalTimeSeconds: totalTime,
      maxStreak,
      answers,
      passed
    });
  };

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

    const nextAnswers = [...recordedAnswers, answerRecord];
    setRecordedAnswers(nextAnswers);
    setHasSubmittedAnswer(true);

    // Sudden death: failed on timeout
    transitionTimerRef.current = setTimeout(() => {
      finishSession(nextAnswers, false);
    }, 700);
  };

  const handleSelectOption = (option: QuizOption) => {
    if (hasSubmittedAnswer) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedOptionId(option.id);
    const elapsedOnQuestion = (Date.now() - questionStartTimeRef.current) / 1000;
    const timeSpent = Math.max(0.1, Math.min(timePerQuestion, Math.round(elapsedOnQuestion * 10) / 10));
    const isCorrect = option.isCorrect;

    let points = 0;
    if (isCorrect) {
      if (soundEnabled) playSwish();
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) setMaxStreak(nextStreak);
      points = 100;
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

    const nextAnswers = [...recordedAnswers, answerRecord];
    setRecordedAnswers(nextAnswers);
    setHasSubmittedAnswer(true);

    if (isCorrect) {
      if (isLastQuestion) {
        // Successfully passed all questions!
        transitionTimerRef.current = setTimeout(() => {
          finishSession(nextAnswers, true);
        }, 500);
      } else {
        // Correct answer: flash green and show next question right away
        transitionTimerRef.current = setTimeout(() => {
          setSelectedOptionId(null);
          setHasSubmittedAnswer(false);
          setCurrentIndex(prev => prev + 1);
        }, 450);
      }
    } else {
      // Incorrect answer: sudden death failure
      transitionTimerRef.current = setTimeout(() => {
        finishSession(nextAnswers, false);
      }, 700);
    }
  };

  const isUrgent = timeRemaining <= 5 && !hasSubmittedAnswer;

  if (!isStarted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col items-center justify-center min-h-[75dvh]">
        <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 text-center space-y-5 sm:space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-400">
              Quiz startet in
            </p>
            <p className="text-xs text-zinc-400">
              {questions.length} {questions.length === 1 ? 'Frage' : 'Fragen'} · {timePerQuestion}s pro Frage
            </p>
          </div>

          <div className="flex items-center justify-center py-2">
            <div
              key={countdown}
              className="w-28 h-28 rounded-full bg-zinc-950 border-2 border-red-600/80 flex items-center justify-center shadow-lg shadow-red-950/30"
            >
              <span className="text-6xl font-bold font-mono tabular-nums text-white">
                {countdown}
              </span>
            </div>
          </div>

          <p className="text-sm font-medium text-zinc-300">
            Mach dich bereit...
          </p>

          <button
            type="button"
            onClick={() => {
              trackEvent('quiz_abort', {
                stage: 'countdown',
                question_index: 0,
                total_questions: questions.length
              });
              onExit();
            }}
            className="px-4 py-2 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-xs font-medium text-zinc-400 hover:text-white min-h-[40px] transition-colors"
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  const visualRowClassMap: Record<number, string> = {
    1: 'grid-rows-1',
    2: 'grid-rows-2',
    3: 'grid-rows-3',
    4: 'grid-rows-4',
    5: 'grid-rows-5',
    6: 'grid-rows-6'
  };
  const visualRowsClass = visualRowClassMap[shuffledOptions.length] || 'grid-rows-4';

  return (
    <div
      className={`w-full ${
        hasVisualOptions ? 'max-w-2xl flex-1 min-h-0 h-full' : 'max-w-xl'
      } mx-auto px-2.5 sm:px-4 py-2 sm:py-3 flex flex-col gap-2 sm:gap-3`}
    >
      {/* Top Quiz HUD */}
      <div className="shrink-0 space-y-1.5 sm:space-y-2.5">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-white">
              Frage {currentIndex + 1} von {questions.length}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className={`inline-flex items-center gap-1 font-mono font-semibold tabular-nums px-2 py-0.5 rounded-md ${
                isUrgent
                  ? 'bg-red-950 text-red-300 border border-red-700/70'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              {timeRemaining.toFixed(1)}s
            </span>

            <button
              onClick={() => {
                const nextSound = !soundEnabled;
                setSoundEnabled(nextSound);
                trackEvent('quiz_sound_toggle', { enabled: nextSound });
              }}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg min-h-[34px] min-w-[34px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center transition-colors"
              aria-label={soundEnabled ? 'Ton stummschalten' : 'Ton aktivieren'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={() => {
                trackEvent('quiz_abort', {
                  stage: 'in_progress',
                  question_index: currentIndex + 1,
                  total_questions: questions.length
                });
                onExit();
              }}
              className="text-zinc-400 hover:text-white min-h-[34px] sm:min-h-[36px] px-1.5 font-medium transition-colors"
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
      <div
        className={`bg-zinc-900 border border-zinc-800 rounded-2xl ${
          hasVisualOptions
            ? 'p-2.5 sm:p-4 flex-1 min-h-0 flex flex-col gap-2 sm:gap-3'
            : 'p-3.5 sm:p-5 space-y-2.5 sm:space-y-4'
        }`}
      >
        <div className="shrink-0 space-y-1 sm:space-y-1.5">
          {currentQuestion.tags.length > 0 && (
            <div className="text-[11px] sm:text-xs text-zinc-400 leading-tight">
              {currentQuestion.tags.join(' · ')}
            </div>
          )}
          <h2 className="text-[15px] sm:text-lg font-semibold text-white leading-snug">
            {currentQuestion.scenario || currentQuestion.title}
          </h2>
        </div>

        {/* Question Image */}
        {currentQuestion.imageUrl && (
          <div
            className={`shrink-0 rounded-xl overflow-hidden border border-zinc-800 bg-black ${
              hasVisualOptions
                ? 'max-h-[16dvh] sm:max-h-[20dvh]'
                : 'max-h-[24vh] sm:max-h-60'
            }`}
          >
            <img
              src={currentQuestion.imageUrl}
              alt={currentQuestion.scenario || currentQuestion.title}
              referrerPolicy="no-referrer"
              className={`w-full h-full object-contain ${
                hasVisualOptions
                  ? 'max-h-[16dvh] sm:max-h-[20dvh]'
                  : 'max-h-[24vh] sm:max-h-60'
              }`}
            />
          </div>
        )}

        {/* Answer Options (Text and/or Image) */}
        <div
          className={
            hasVisualOptions
              ? `flex-1 min-h-0 grid grid-cols-1 ${visualRowsClass} gap-1.5 sm:gap-2.5`
              : 'space-y-2 sm:space-y-2.5 pt-0.5'
          }
        >
          {shuffledOptions.map(opt => {
            const isSelected = selectedOptionId === opt.id;
            const isCorrect = opt.isCorrect;
            const displayText = getOptionDisplayText(opt.text, Boolean(opt.imageUrl));

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

            if (hasVisualOptions) {
              return (
                <button
                  key={opt.id}
                  disabled={hasSubmittedAnswer}
                  onClick={() => handleSelectOption(opt)}
                  className={`relative w-full h-full min-h-0 min-w-0 text-left ${
                    opt.imageUrl ? 'p-1.5 sm:p-2' : 'p-2.5 sm:p-3.5'
                  } rounded-xl border transition-colors flex flex-col justify-center gap-1 sm:gap-1.5 overflow-hidden ${cardStyle}`}
                >
                  {(displayText || (!opt.imageUrl && hasSubmittedAnswer && (isCorrect || isSelected))) && (
                    <div className="shrink-0 flex items-center justify-between gap-2 sm:gap-3 w-full px-1">
                      {displayText ? (
                        <span className="flex-1 text-[13px] sm:text-sm font-medium leading-tight line-clamp-2">
                          {displayText}
                        </span>
                      ) : (
                        <span className="flex-1" />
                      )}

                      {hasSubmittedAnswer && (
                        <span className="shrink-0">
                          {isCorrect ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : isSelected ? (
                            <X className="w-4 h-4 text-red-400" />
                          ) : null}
                        </span>
                      )}
                    </div>
                  )}

                  {opt.imageUrl && (
                    <div className="relative flex-1 min-h-0 min-w-0 w-full rounded-lg overflow-hidden border border-zinc-800/80 bg-black">
                      <img
                        src={opt.imageUrl}
                        alt={displayText || 'Antwortbild'}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                      {!displayText && hasSubmittedAnswer && (isCorrect || isSelected) && (
                        <span className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/85 border border-zinc-700/80">
                          {isCorrect ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <X className="w-4 h-4 text-red-400" />
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            }

            return (
              <button
                key={opt.id}
                disabled={hasSubmittedAnswer}
                onClick={() => handleSelectOption(opt)}
                className={`w-full text-left p-2.5 sm:p-3.5 rounded-xl border transition-colors flex flex-col justify-center gap-1.5 sm:gap-2.5 min-h-[44px] sm:min-h-[52px] ${cardStyle}`}
              >
                <div className="flex items-center justify-between gap-2 sm:gap-3 w-full">
                  <span className="flex-1 text-[13px] sm:text-sm font-medium leading-snug">
                    {displayText}
                  </span>

                  {hasSubmittedAnswer && (
                    <span className="shrink-0">
                      {isCorrect ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : isSelected ? (
                        <X className="w-4 h-4 text-red-400" />
                      ) : null}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
