import { Question, QuizConfig, QuizAttempt, Player, TacticalGapReport } from '../types/basketball';

/**
 * Returns a standardized ISO week identifier, e.g. "2026-W45"
 */
export function getWeekKey(dateInput: Date | string = new Date()): string {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  const weekNumber = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Generates a randomized quiz session with safeguards:
 * 1. Strictly no duplicates within the session.
 * 2. Balances multiple tags/topics so questions aren't all from a single concept.
 * 3. Weights questions marked with `isPriorityFocus` so coach's current training focus rotates more frequently.
 */
export function generateQuizSession(
  allQuestions: Question[],
  config: QuizConfig
): Question[] {
  if (allQuestions.length === 0) return [];

  // Filter by selected tags if specified and non-empty
  let pool = allQuestions;
  if (config.selectedTags && config.selectedTags.length > 0) {
    const selectedSet = new Set(config.selectedTags);
    const filtered = allQuestions.filter(q => q.tags.some(t => selectedSet.has(t)));
    if (filtered.length > 0) {
      pool = filtered;
    }
  }

  const targetCount = Math.min(config.questionCount, pool.length);
  if (targetCount === 0) return [];

  const selectedQuestions: Question[] = [];
  const selectedIds = new Set<string>();
  const coveredTopics = new Set<string>();

  // Helper to get priority weight: priority focus questions get weight 3, normal gets 1
  const getWeight = (q: Question) => (config.prioritizeFocusQuestions && q.isPriorityFocus ? 3 : 1);

  // Phase 1: Topic Diversity Safeguard
  // If topic diversity is enabled, attempt to select questions from unrepresented topics first
  if (config.ensureDiverseTopics) {
    // Gather all distinct primary tags
    const allTags = Array.from(new Set(pool.flatMap(q => q.tags)));
    // Shuffle tags
    const shuffledTags = [...allTags].sort(() => Math.random() - 0.5);

    for (const tag of shuffledTags) {
      if (selectedQuestions.length >= targetCount) break;

      const candidates = pool.filter(q => !selectedIds.has(q.id) && q.tags.includes(tag));
      if (candidates.length === 0) continue;

      // Weighted random pick from candidates
      const totalWeight = candidates.reduce((sum, q) => sum + getWeight(q), 0);
      let rand = Math.random() * totalWeight;
      let chosen = candidates[0];

      for (const cand of candidates) {
        rand -= getWeight(cand);
        if (rand <= 0) {
          chosen = cand;
          break;
        }
      }

      selectedQuestions.push(chosen);
      selectedIds.add(chosen.id);
      chosen.tags.forEach(t => coveredTopics.add(t));
    }
  }

  // Phase 2: Fill remaining quota with weighted random selection from remaining pool
  while (selectedQuestions.length < targetCount) {
    const remaining = pool.filter(q => !selectedIds.has(q.id));
    if (remaining.length === 0) break;

    const totalWeight = remaining.reduce((sum, q) => sum + getWeight(q), 0);
    let rand = Math.random() * totalWeight;
    let chosen = remaining[0];

    for (const cand of remaining) {
      rand -= getWeight(cand);
      if (rand <= 0) {
        chosen = cand;
        break;
      }
    }

    selectedQuestions.push(chosen);
    selectedIds.add(chosen.id);
    chosen.tags.forEach(t => coveredTopics.add(t));
  }

  // Shuffle final quiz order so topics are mixed and not grouped
  return [...selectedQuestions].sort(() => Math.random() - 0.5);
}

/**
 * Calculates score for an answered question:
 * Base: 100
 * Speed bonus: up to +50 based on fraction of time remaining
 * Streak bonus: +15 points per current streak count (capped at +75)
 */
export function calculateQuestionScore(
  isCorrect: boolean,
  timeRemainingSeconds: number,
  maxTimeSeconds: number,
  currentStreak: number
): number {
  if (!isCorrect) return 0;

  const basePoints = 100;
  const timeRatio = maxTimeSeconds > 0 ? Math.max(0, Math.min(1, timeRemainingSeconds / maxTimeSeconds)) : 0;
  const speedBonus = Math.round(timeRatio * 50);
  const streakBonus = Math.min(currentStreak * 15, 75);

  return basePoints + speedBonus + streakBonus;
}

/**
 * Aggregates all attempts into tactical knowledge gaps categorized by topic labels.
 * Highlights weak areas across the team or for individual players.
 */
export function calculateTacticalGaps(
  allQuestions: Question[],
  attempts: QuizAttempt[],
  playerIdFilter?: string
): TacticalGapReport[] {
  const questionMap = new Map<string, Question>();
  allQuestions.forEach(q => questionMap.set(q.id, q));

  // Filter attempts if player specified
  const targetAttempts = playerIdFilter 
    ? attempts.filter(a => a.playerId === playerIdFilter)
    : attempts;

  const tagStats = new Map<string, { total: number; correct: number; questionIds: Set<string> }>();

  // Initial populate with all existing tags so even untried tags are visible
  allQuestions.forEach(q => {
    q.tags.forEach(tag => {
      if (!tagStats.has(tag)) {
        tagStats.set(tag, { total: 0, correct: 0, questionIds: new Set() });
      }
    });
  });

  // Tally attempts
  for (const attempt of targetAttempts) {
    for (const ans of attempt.answers) {
      const q = questionMap.get(ans.questionId);
      if (!q) continue;

      for (const tag of q.tags) {
        let stat = tagStats.get(tag);
        if (!stat) {
          stat = { total: 0, correct: 0, questionIds: new Set() };
          tagStats.set(tag, stat);
        }
        stat.total += 1;
        if (ans.isCorrect) {
          stat.correct += 1;
        }
        stat.questionIds.add(q.id);
      }
    }
  }

  const reports: TacticalGapReport[] = [];

  tagStats.forEach((stat, tag) => {
    const accuracy = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
    
    let status: TacticalGapReport['status'] = 'solid';
    if (stat.total === 0) {
      status = 'needs_work';
    } else if (accuracy < 60) {
      status = 'critical_gap';
    } else if (accuracy < 75) {
      status = 'needs_work';
    } else if (accuracy < 90) {
      status = 'solid';
    } else {
      status = 'mastered';
    }

    reports.push({
      tag,
      totalAnswered: stat.total,
      correctAnswered: stat.correct,
      accuracyPercentage: accuracy,
      status,
      sampleQuestionIds: Array.from(stat.questionIds)
    });
  });

  // Sort lowest accuracy first (worst gaps first)
  return reports.sort((a, b) => {
    if (a.totalAnswered === 0 && b.totalAnswered > 0) return 1;
    if (b.totalAnswered === 0 && a.totalAnswered > 0) return -1;
    return a.accuracyPercentage - b.accuracyPercentage;
  });
}

export interface PlayerWeeklySummary {
  player: Player;
  hasCompletedThisWeek: boolean;
  attemptsThisWeek: number;
  totalAttemptsAllTime: number;
  bestScoreThisWeek: number;
  averageAccuracyThisWeek: number;
  lastAttemptDate?: string;
  totalPointsThisWeek: number;
  seasonTotalScore: number;
}

/**
 * Calculates weekly leaderboard and completion status for every player on the roster.
 */
export function calculateWeeklyLeaderboard(
  players: Player[],
  attempts: QuizAttempt[],
  targetWeekKey: string
): PlayerWeeklySummary[] {
  return players.map(player => {
    const playerAttempts = attempts.filter(a => a.playerId === player.id);
    const thisWeekAttempts = playerAttempts.filter(a => a.weekKey === targetWeekKey);

    const hasCompletedThisWeek = thisWeekAttempts.length >= 1;
    const attemptsThisWeek = thisWeekAttempts.length;
    const totalAttemptsAllTime = playerAttempts.length;

    let bestScoreThisWeek = 0;
    let totalPointsThisWeek = 0;
    let totalQuestionsThisWeek = 0;
    let totalCorrectThisWeek = 0;

    for (const att of thisWeekAttempts) {
      if (att.totalScore > bestScoreThisWeek) {
        bestScoreThisWeek = att.totalScore;
      }
      totalPointsThisWeek += att.totalScore;
      totalQuestionsThisWeek += att.totalQuestions;
      totalCorrectThisWeek += att.correctCount;
    }

    const averageAccuracyThisWeek = totalQuestionsThisWeek > 0 
      ? Math.round((totalCorrectThisWeek / totalQuestionsThisWeek) * 100) 
      : 0;

    const seasonTotalScore = playerAttempts.reduce((acc, a) => acc + a.totalScore, 0);

    // Get latest attempt timestamp
    const sortedAttempts = [...playerAttempts].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const lastAttemptDate = sortedAttempts[0]?.timestamp;

    return {
      player,
      hasCompletedThisWeek,
      attemptsThisWeek,
      totalAttemptsAllTime,
      bestScoreThisWeek,
      averageAccuracyThisWeek,
      lastAttemptDate,
      totalPointsThisWeek,
      seasonTotalScore
    };
  }).sort((a, b) => {
    // Priority: completed players with higher best scores first
    if (a.hasCompletedThisWeek && !b.hasCompletedThisWeek) return -1;
    if (!a.hasCompletedThisWeek && b.hasCompletedThisWeek) return 1;
    return b.bestScoreThisWeek - a.bestScoreThisWeek;
  });
}

export interface WeeklyTrendPoint {
  weekKey: string;
  attemptCount: number;
  averageScore: number;
  averageAccuracy: number;
}

/**
 * Computes weekly score and accuracy trends over time for the team or an individual player.
 */
export function calculateWeeklyTrends(
  attempts: QuizAttempt[],
  playerIdFilter?: string
): WeeklyTrendPoint[] {
  const filtered = playerIdFilter
    ? attempts.filter(a => a.playerId === playerIdFilter)
    : attempts;

  const byWeek = new Map<string, QuizAttempt[]>();
  for (const att of filtered) {
    const list = byWeek.get(att.weekKey) || [];
    list.push(att);
    byWeek.set(att.weekKey, list);
  }

  const weeks = Array.from(byWeek.keys()).sort();
  return weeks.map(weekKey => {
    const weekAttempts = byWeek.get(weekKey) || [];
    const totalScore = weekAttempts.reduce((sum, a) => sum + a.totalScore, 0);
    const totalQuestions = weekAttempts.reduce((sum, a) => sum + a.totalQuestions, 0);
    const totalCorrect = weekAttempts.reduce((sum, a) => sum + a.correctCount, 0);

    return {
      weekKey,
      attemptCount: weekAttempts.length,
      averageScore: Math.round(totalScore / weekAttempts.length),
      averageAccuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0
    };
  });
}

