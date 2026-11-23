import {
  Question,
  QuizConfig,
  QuizAttempt,
  Player,
  TacticalGapReport,
  Team,
  UserStats,
  UserDetails,
  UserDetailsQuestionStat,
  UserDetailsRecentAttempt,
  WeeklyTrendPoint
} from '../types/basketball';
export type { WeeklyTrendPoint };

/**
 * Returns questions applicable to a specific team (team-specific + global "all teams" questions).
 * When no teamId is given, returns global questions (empty/omitted teamIds).
 */
export function filterQuestionsForTeam(
  allQuestions: Question[],
  teamId?: string | null
): Question[] {
  return allQuestions.filter(q => {
    const isGlobal = !q.teamIds || q.teamIds.length === 0;
    if (!teamId) return isGlobal;
    return isGlobal || q.teamIds!.includes(teamId);
  });
}

/**
 * Resolves effective quiz config for a team, falling back to team-wide defaults.
 */
export function getTeamQuizConfig(
  team: Team | null | undefined,
  fallbackConfig: QuizConfig
): QuizConfig {
  if (!team) return fallbackConfig;
  return {
    questionCount: team.questionCount,
    timePerQuestionSeconds: team.timePerQuestionSeconds,
    prioritizeFocusQuestions: team.prioritizeFocusQuestions,
    ensureDiverseTopics: team.ensureDiverseTopics,
    selectedTags: team.selectedTags,
    topicLabels: fallbackConfig.topicLabels
  };
}

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
 * Returns the ISO week key immediately preceding the week of `dateInput`.
 */
export function getPreviousWeekKey(dateInput: Date | string = new Date()): string {
  const d = new Date(dateInput);
  d.setDate(d.getDate() - 7);
  return getWeekKey(d);
}

/**
 * Generates a randomized quiz session with safeguards:
 * 1. Strictly no duplicates within the session.
 * 2. Balances multiple tags/topics so questions aren't all from a single concept.
 * 3. Weights questions marked with `isPriorityFocus` so coach's current training focus rotates more frequently.
 */
export function generateQuizSession(
  allQuestions: Question[],
  config: QuizConfig,
  teamId?: string | null
): Question[] {
  const teamScoped = teamId !== undefined ? filterQuestionsForTeam(allQuestions, teamId) : allQuestions;
  if (teamScoped.length === 0) return [];

  // Filter by selected tags if specified and non-empty
  let pool = teamScoped;
  if (config.selectedTags && config.selectedTags.length > 0) {
    const selectedSet = new Set(config.selectedTags);
    const filtered = teamScoped.filter(q => q.tags.some(t => selectedSet.has(t)));
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
  averageTimeThisWeek: number;
  averageAccuracyThisWeek: number;
  currentStreak: number;
  bestStreak: number;
  lastAttemptDate?: string;
  totalPointsThisWeek: number;
  seasonTotalScore: number;
}

export const ONLINE_WINDOW_MS = 60_000;

/**
 * Returns true if the player started a quiz round within the last minute.
 */
export function isPlayerOnline(
  lastRoundStartedAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!lastRoundStartedAt) return false;
  const startedMs = new Date(lastRoundStartedAt).getTime();
  if (!Number.isFinite(startedMs)) return false;
  const diff = nowMs - startedMs;
  return diff <= ONLINE_WINDOW_MS && diff >= -10_000;
}

/**
 * Returns true only when the player genuinely completed/passed all questions in the attempt.
 */
export function isPassedAttempt(
  att: Pick<QuizAttempt, 'passed' | 'correctCount' | 'totalQuestions' | 'totalTimeSeconds'>
): boolean {
  if (att.passed === false) return false;
  if (!(att.totalQuestions > 0) || !(att.totalTimeSeconds > 0)) return false;
  return att.passed === true || att.correctCount === att.totalQuestions;
}

/**
 * Counts consecutive error-free (passed) quiz attempts starting from the most recent attempt.
 */
export function calculateCurrentErrorFreeStreak(playerAttempts: QuizAttempt[]): number {
  if (playerAttempts.length === 0) return 0;
  const sortedDesc = [...playerAttempts].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  let streak = 0;
  for (const att of sortedDesc) {
    if (!isPassedAttempt(att)) break;
    streak += 1;
  }
  return streak;
}

/**
 * Calculates the highest consecutive streak of error-free (passed) quiz attempts a player has ever achieved.
 */
export function calculateBestErrorFreeStreak(playerAttempts: QuizAttempt[]): number {
  if (playerAttempts.length === 0) return 0;
  const sortedAsc = [...playerAttempts].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  let best = 0;
  let current = 0;
  for (const att of sortedAsc) {
    if (isPassedAttempt(att)) {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

export interface PlayerMedals {
  gold: number;
  silver: number;
  bronze: number;
}

function awardTopThreeMedalsForAttempts(
  weekAttempts: QuizAttempt[],
  medalsByPlayer: Map<string, PlayerMedals>
): void {
  const bestByPlayer = new Map<string, { bestTime: number; earliestTimestamp: number }>();

  for (const att of weekAttempts) {
    const time = Math.round(att.totalTimeSeconds * 10) / 10;
    const ts = new Date(att.timestamp).getTime();
    const existing = bestByPlayer.get(att.playerId);

    if (
      !existing ||
      time < existing.bestTime ||
      (time === existing.bestTime && ts < existing.earliestTimestamp)
    ) {
      bestByPlayer.set(att.playerId, { bestTime: time, earliestTimestamp: ts });
    }
  }

  const ranked = Array.from(bestByPlayer.entries()).sort(([idA, a], [idB, b]) => {
    if (a.bestTime !== b.bestTime) return a.bestTime - b.bestTime;
    if (a.earliestTimestamp !== b.earliestTimestamp) return a.earliestTimestamp - b.earliestTimestamp;
    return idA.localeCompare(idB);
  });

  const medalKeys: Array<keyof PlayerMedals> = ['gold', 'silver', 'bronze'];
  for (let i = 0; i < Math.min(3, ranked.length); i++) {
    const playerId = ranked[i][0];
    const current = medalsByPlayer.get(playerId) || { gold: 0, silver: 0, bronze: 0 };
    current[medalKeys[i]] += 1;
    medalsByPlayer.set(playerId, current);
  }
}

/**
 * Calculates Gold, Silver, and Bronze medals earned for completed weeks in
 * `(afterWeekExclusive, upToWeekInclusive]`.
 */
export function calculateCompletedWeekMedals(
  attempts: QuizAttempt[],
  afterWeekExclusive: string | undefined,
  upToWeekInclusive: string,
  validPlayerIds?: Set<string>
): Map<string, PlayerMedals> {
  const medalsByPlayer = new Map<string, PlayerMedals>();
  const passedByWeek = new Map<string, QuizAttempt[]>();

  for (const att of attempts) {
    if (!att.weekKey) continue;
    if (afterWeekExclusive && att.weekKey <= afterWeekExclusive) continue;
    if (att.weekKey > upToWeekInclusive) continue;
    if (validPlayerIds && !validPlayerIds.has(att.playerId)) continue;
    if (!isPassedAttempt(att)) continue;

    const list = passedByWeek.get(att.weekKey) || [];
    list.push(att);
    passedByWeek.set(att.weekKey, list);
  }

  for (const weekAttempts of passedByWeek.values()) {
    awardTopThreeMedalsForAttempts(weekAttempts, medalsByPlayer);
  }

  return medalsByPlayer;
}

/**
 * Calculates Gold (1st), Silver (2nd), and Bronze (3rd) weekly medals earned by each player
 * across all completed weeks plus the currently active week's live top 3
 * (whose medals transfer if overtaken).
 */
export function calculatePlayerMedals(
  attempts: QuizAttempt[],
  currentWeekKey: string = getWeekKey(),
  validPlayerIds?: Set<string>,
  userStatsMap?: Map<string, UserStats>,
  medalsFinalizedThroughWeek?: string
): Map<string, PlayerMedals> {
  const medalsByPlayer = new Map<string, PlayerMedals>();
  const passedByWeek = new Map<string, QuizAttempt[]>();

  for (const att of attempts) {
    if (!att.weekKey || att.weekKey > currentWeekKey) continue;
    if (validPlayerIds && !validPlayerIds.has(att.playerId)) continue;
    if (!isPassedAttempt(att)) continue;

    const list = passedByWeek.get(att.weekKey) || [];
    list.push(att);
    passedByWeek.set(att.weekKey, list);
  }

  for (const weekAttempts of passedByWeek.values()) {
    awardTopThreeMedalsForAttempts(weekAttempts, medalsByPlayer);
  }

  // When attempts are not loaded, combine accumulated past medals from userStatsMap
  // with any unfinalized past-week standings and live current-week top 3 standings.
  if (attempts.length === 0 && userStatsMap && userStatsMap.size > 0) {
    const hasCompletedAttemptInStats = (s: UserStats): boolean =>
      s.totalAttemptsAllTime > 0 &&
      (s.bestScoreThisWeek > 0 || (s.bestScoreAllTime ?? 0) > 0 || s.bestStreak > 0);

    let maxFinalizedWeek = medalsFinalizedThroughWeek || '';

    for (const [playerId, s] of userStatsMap.entries()) {
      if (validPlayerIds && !validPlayerIds.has(playerId)) continue;
      if (s.medalsThroughWeek && s.medalsThroughWeek > maxFinalizedWeek) {
        maxFinalizedWeek = s.medalsThroughWeek;
      }
      if (!hasCompletedAttemptInStats(s)) continue;

      const pastGold = s.pastGold || 0;
      const pastSilver = s.pastSilver || 0;
      const pastBronze = s.pastBronze || 0;
      if (pastGold > 0 || pastSilver > 0 || pastBronze > 0) {
        medalsByPlayer.set(playerId, {
          gold: pastGold,
          silver: pastSilver,
          bronze: pastBronze
        });
      }
    }

    // Provisional unfinalized past week(s) standing (e.g. Monday morning before coach logs in)
    const unfinalizedPastByWeek = new Map<string, Array<[string, UserStats]>>();
    for (const [playerId, s] of userStatsMap.entries()) {
      if (validPlayerIds && !validPlayerIds.has(playerId)) continue;
      if (!hasCompletedAttemptInStats(s)) continue;
      if (!s.currentWeekKey || s.currentWeekKey >= currentWeekKey) continue;
      if (s.bestScoreThisWeek <= 0) continue;

      const effectiveThrough =
        s.medalsThroughWeek && s.medalsThroughWeek > maxFinalizedWeek
          ? s.medalsThroughWeek
          : maxFinalizedWeek;
      if (effectiveThrough && s.currentWeekKey <= effectiveThrough) continue;

      const list = unfinalizedPastByWeek.get(s.currentWeekKey) || [];
      list.push([playerId, s]);
      unfinalizedPastByWeek.set(s.currentWeekKey, list);
    }

    const medalKeys: Array<keyof PlayerMedals> = ['gold', 'silver', 'bronze'];
    for (const entries of unfinalizedPastByWeek.values()) {
      const sortedPast = [...entries].sort(([idA, a], [idB, b]) => {
        if (a.bestScoreThisWeek !== b.bestScoreThisWeek) {
          return a.bestScoreThisWeek - b.bestScoreThisWeek;
        }
        return idA.localeCompare(idB);
      });
      for (let i = 0; i < Math.min(3, sortedPast.length); i++) {
        const playerId = sortedPast[i][0];
        const current = medalsByPlayer.get(playerId) || { gold: 0, silver: 0, bronze: 0 };
        current[medalKeys[i]] += 1;
        medalsByPlayer.set(playerId, current);
      }
    }

    // Live non-permanent medals for the active current week
    const validCurrentStats = Array.from(userStatsMap.entries())
      .filter(([id, s]) => {
        if (validPlayerIds && !validPlayerIds.has(id)) return false;
        if (!hasCompletedAttemptInStats(s)) return false;
        return s.currentWeekKey === currentWeekKey && s.bestScoreThisWeek > 0;
      })
      .sort(([idA, a], [idB, b]) => {
        if (a.bestScoreThisWeek !== b.bestScoreThisWeek) {
          return a.bestScoreThisWeek - b.bestScoreThisWeek;
        }
        return idA.localeCompare(idB);
      });

    for (let i = 0; i < Math.min(3, validCurrentStats.length); i++) {
      const playerId = validCurrentStats[i][0];
      const current = medalsByPlayer.get(playerId) || { gold: 0, silver: 0, bronze: 0 };
      current[medalKeys[i]] += 1;
      medalsByPlayer.set(playerId, current);
    }
  }

  return medalsByPlayer;
}

/**
 * Hides auto-generated default placeholder text (e.g. "Antwort A", "Option B") when an option has an image.
 */
export function getOptionDisplayText(text: string, hasImage: boolean): string {
  const trimmed = (text || '').trim();
  if (!hasImage) return trimmed;
  if (!trimmed || /^(Antwort|Option|Bild)\s*[A-Z0-9]+$/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

/**
 * Calculates weekly leaderboard and completion status for every player on the roster.
 */
export function calculateWeeklyLeaderboard(
  players: Player[],
  attempts: QuizAttempt[],
  targetWeekKey: string,
  userStatsMap?: Map<string, UserStats>
): PlayerWeeklySummary[] {
  const bestTimestampMap = new Map<string, number>();

  const summaries = players.map(player => {
    const playerAttempts = attempts.filter(a => a.playerId === player.id);
    const thisWeekAttempts = playerAttempts.filter(a => a.weekKey === targetWeekKey);
    const stats = userStatsMap?.get(player.id);

    const passedAttempts = thisWeekAttempts.filter(isPassedAttempt);
    const isStatsForTargetWeek = Boolean(
      stats && (stats.currentWeekKey ? stats.currentWeekKey === targetWeekKey : targetWeekKey === getWeekKey())
    );
    const hasCompletedFromStats = Boolean(
      isStatsForTargetWeek && stats && stats.totalAttemptsAllTime > 0 && stats.bestScoreThisWeek > 0
    );
    const hasCompletedThisWeek = passedAttempts.length > 0 || hasCompletedFromStats;
    const attemptsThisWeek =
      thisWeekAttempts.length > 0
        ? thisWeekAttempts.length
        : isStatsForTargetWeek && stats
        ? stats.attemptsThisWeek !== undefined
          ? stats.attemptsThisWeek
          : hasCompletedFromStats
          ? 1
          : 0
        : 0;
    const totalAttemptsAllTime =
      playerAttempts.length > 0 ? playerAttempts.length : (stats?.totalAttemptsAllTime ?? 0);

    let bestScoreThisWeek = 0;
    let averageTimeThisWeek = 0;
    if (passedAttempts.length > 0) {
      bestScoreThisWeek = Math.round(Math.min(...passedAttempts.map(a => a.totalTimeSeconds)) * 10) / 10;
      const totalPassedTime = passedAttempts.reduce((sum, a) => sum + a.totalTimeSeconds, 0);
      averageTimeThisWeek = Math.round((totalPassedTime / passedAttempts.length) * 10) / 10;

      const bestAttempts = passedAttempts.filter(
        a => Math.round(a.totalTimeSeconds * 10) / 10 === bestScoreThisWeek
      );
      if (bestAttempts.length > 0) {
        bestTimestampMap.set(
          player.id,
          Math.min(...bestAttempts.map(a => new Date(a.timestamp).getTime()))
        );
      }
    } else if (isStatsForTargetWeek && stats && stats.bestScoreThisWeek > 0) {
      bestScoreThisWeek = Math.round(stats.bestScoreThisWeek * 10) / 10;
    }

    let totalPointsThisWeek = 0;
    let totalQuestionsThisWeek = 0;
    let totalCorrectThisWeek = 0;

    for (const att of thisWeekAttempts) {
      totalPointsThisWeek += att.totalScore;
      totalQuestionsThisWeek += att.totalQuestions;
      totalCorrectThisWeek += att.correctCount;
    }

    const averageAccuracyThisWeek = totalQuestionsThisWeek > 0 
      ? Math.round((totalCorrectThisWeek / totalQuestionsThisWeek) * 100) 
      : 0;

    const currentStreak = stats ? stats.currentStreak : calculateCurrentErrorFreeStreak(playerAttempts);
    const bestStreak = stats ? stats.bestStreak : calculateBestErrorFreeStreak(playerAttempts);
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
      averageTimeThisWeek,
      averageAccuracyThisWeek,
      currentStreak,
      bestStreak,
      lastAttemptDate,
      totalPointsThisWeek,
      seasonTotalScore
    };
  });

  return summaries.sort((a, b) => {
    // Priority: completed/passed players first, sorted by lowest time (bestScoreThisWeek) ascending
    if (a.hasCompletedThisWeek && !b.hasCompletedThisWeek) return -1;
    if (!a.hasCompletedThisWeek && b.hasCompletedThisWeek) return 1;
    if (a.hasCompletedThisWeek && b.hasCompletedThisWeek) {
      if (a.bestScoreThisWeek !== b.bestScoreThisWeek) {
        return a.bestScoreThisWeek - b.bestScoreThisWeek;
      }
      const tsA = bestTimestampMap.get(a.player.id) ?? Infinity;
      const tsB = bestTimestampMap.get(b.player.id) ?? Infinity;
      if (tsA !== tsB) return tsA - tsB;
      return a.player.id.localeCompare(b.player.id);
    }
    return b.attemptsThisWeek - a.attemptsThisWeek;
  });
}

/**
 * Calculates all-time leaderboard and completion status for every player on the roster.
 */
export function calculateAllTimeLeaderboard(
  players: Player[],
  attempts: QuizAttempt[],
  userStatsMap?: Map<string, UserStats>
): PlayerWeeklySummary[] {
  return players.map(player => {
    const playerAttempts = attempts.filter(a => a.playerId === player.id);
    const stats = userStatsMap?.get(player.id);
    const passedAttempts = playerAttempts.filter(isPassedAttempt);
    const totalAttemptsAllTime =
      playerAttempts.length > 0 ? playerAttempts.length : (stats?.totalAttemptsAllTime ?? 0);
    const hasCompletedThisWeek =
      passedAttempts.length > 0 ||
      Boolean(
        stats &&
          stats.totalAttemptsAllTime > 0 &&
          ((stats.bestScoreAllTime ?? 0) > 0 || stats.bestScoreThisWeek > 0 || stats.bestStreak > 0)
      );
    const attemptsThisWeek = totalAttemptsAllTime;

    let bestScoreThisWeek = 0;
    let averageTimeThisWeek = 0;
    if (passedAttempts.length > 0) {
      bestScoreThisWeek = Math.round(Math.min(...passedAttempts.map(a => a.totalTimeSeconds)) * 10) / 10;
      const totalPassedTime = passedAttempts.reduce((sum, a) => sum + a.totalTimeSeconds, 0);
      averageTimeThisWeek = Math.round((totalPassedTime / passedAttempts.length) * 10) / 10;
    } else if (stats) {
      const candidateBest =
        stats.bestScoreAllTime && stats.bestScoreAllTime > 0
          ? stats.bestScoreAllTime
          : stats.bestScoreThisWeek > 0
          ? stats.bestScoreThisWeek
          : 0;
      bestScoreThisWeek = Math.round(candidateBest * 10) / 10;
    }

    let totalPointsThisWeek = 0;
    let totalQuestionsThisWeek = 0;
    let totalCorrectThisWeek = 0;

    for (const att of playerAttempts) {
      totalPointsThisWeek += att.totalScore;
      totalQuestionsThisWeek += att.totalQuestions;
      totalCorrectThisWeek += att.correctCount;
    }

    const averageAccuracyThisWeek = totalQuestionsThisWeek > 0 
      ? Math.round((totalCorrectThisWeek / totalQuestionsThisWeek) * 100) 
      : 0;

    const currentStreak = stats ? stats.currentStreak : calculateCurrentErrorFreeStreak(playerAttempts);
    const bestStreak = stats ? stats.bestStreak : calculateBestErrorFreeStreak(playerAttempts);
    const seasonTotalScore = playerAttempts.reduce((acc, a) => acc + a.totalScore, 0);

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
      averageTimeThisWeek,
      averageAccuracyThisWeek,
      currentStreak,
      bestStreak,
      lastAttemptDate,
      totalPointsThisWeek,
      seasonTotalScore
    };
  }).sort((a, b) => {
    if (a.hasCompletedThisWeek && !b.hasCompletedThisWeek) return -1;
    if (!a.hasCompletedThisWeek && b.hasCompletedThisWeek) return 1;
    if (a.hasCompletedThisWeek && b.hasCompletedThisWeek) {
      if (a.bestScoreThisWeek > 0 && b.bestScoreThisWeek > 0 && a.bestScoreThisWeek !== b.bestScoreThisWeek) {
        return a.bestScoreThisWeek - b.bestScoreThisWeek;
      }
      if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
      return b.totalAttemptsAllTime - a.totalAttemptsAllTime;
    }
    return b.totalAttemptsAllTime - a.totalAttemptsAllTime;
  });
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
    // Only passed attempts count towards average completion time
    const passedAttempts = weekAttempts.filter(isPassedAttempt);
    const totalPassedTime = passedAttempts.reduce(
      (sum, a) => sum + (a.totalTimeSeconds || a.totalScore || 0),
      0
    );
    const averageScore = passedAttempts.length > 0
      ? Math.round((totalPassedTime / passedAttempts.length) * 10) / 10
      : 0;

    const totalQuestions = weekAttempts.reduce((sum, a) => sum + a.totalQuestions, 0);
    const totalCorrect = weekAttempts.reduce((sum, a) => sum + a.correctCount, 0);

    return {
      weekKey,
      attemptCount: weekAttempts.length,
      averageScore,
      averageAccuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0
    };
  });
}

/**
 * Formats a time in seconds to exactly one decimal place (e.g. 14.2s, 0.8s).
 */
export function formatSeconds(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds <= 0) return '—';
  return `${seconds.toFixed(1)}s`;
}

export interface QuestionPerformanceStat {
  questionId: string;
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
  timedCount: number;
  totalTimeSeconds: number;
  averageTimeSeconds: number;
  lastIsCorrect: boolean;
  lastAttemptTimestamp: string;
}

/**
 * Aggregates per-question accuracy and average response time (1 decimal place)
 * across the given quiz attempts.
 */
export function calculateQuestionStats(
  attempts: QuizAttempt[]
): Map<string, QuestionPerformanceStat> {
  const map = new Map<string, QuestionPerformanceStat>();
  const chronological = [...attempts].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const att of chronological) {
    for (const ans of att.answers) {
      const cur = map.get(ans.questionId) || {
        questionId: ans.questionId,
        total: 0,
        correct: 0,
        wrong: 0,
        accuracy: 0,
        timedCount: 0,
        totalTimeSeconds: 0,
        averageTimeSeconds: 0,
        lastIsCorrect: ans.isCorrect,
        lastAttemptTimestamp: att.timestamp
      };

      cur.total += 1;
      if (ans.isCorrect) cur.correct += 1;
      else cur.wrong += 1;

      if (typeof ans.timeSpentSeconds === 'number' && ans.timeSpentSeconds > 0) {
        cur.timedCount += 1;
        cur.totalTimeSeconds += ans.timeSpentSeconds;
      }

      cur.lastIsCorrect = ans.isCorrect;
      cur.lastAttemptTimestamp = att.timestamp;
      map.set(ans.questionId, cur);
    }
  }

  for (const cur of map.values()) {
    cur.accuracy = cur.total > 0 ? Math.round((cur.correct / cur.total) * 100) : 0;
    cur.averageTimeSeconds =
      cur.timedCount > 0 ? Math.round((cur.totalTimeSeconds / cur.timedCount) * 10) / 10 : 0;
  }

  return map;
}

/**
 * Builds aggregated UserStats for a player from their attempts.
 */
export function buildUserStatsFromAttempts(
  playerId: string,
  allPlayerAttempts: QuizAttempt[],
  currentWeekKey: string = getWeekKey()
): UserStats {
  const playerAttempts = allPlayerAttempts.filter(a => a.playerId === playerId);
  const thisWeekAttempts = playerAttempts.filter(a => a.weekKey === currentWeekKey);
  const passedThisWeek = thisWeekAttempts.filter(isPassedAttempt);
  const passedAllTime = playerAttempts.filter(isPassedAttempt);

  const clampTime = (val: number) =>
    Number.isFinite(val) ? Math.min(3600, Math.max(0, Math.round(val * 10) / 10)) : 0;

  const bestScoreThisWeek =
    passedThisWeek.length > 0
      ? clampTime(Math.min(...passedThisWeek.map(a => a.totalTimeSeconds)))
      : 0;
  const bestScoreAllTime =
    passedAllTime.length > 0
      ? clampTime(Math.min(...passedAllTime.map(a => a.totalTimeSeconds)))
      : 0;

  return {
    userId: playerId,
    currentStreak: Math.min(1000, Math.max(0, Math.round(calculateCurrentErrorFreeStreak(playerAttempts)))),
    bestStreak: Math.min(1000, Math.max(0, Math.round(calculateBestErrorFreeStreak(playerAttempts)))),
    totalAttemptsAllTime: Math.min(10000, Math.max(0, Math.round(playerAttempts.length))),
    attemptsThisWeek: Math.min(10000, Math.max(0, Math.round(thisWeekAttempts.length))),
    currentWeekKey,
    bestScoreThisWeek,
    bestScoreAllTime
  };
}

/**
 * Builds precalculated UserDetails for a single-read PlayerDetailModal view.
 */
export function buildUserDetailsFromAttempts(
  playerId: string,
  allPlayerAttempts: QuizAttempt[],
  currentWeekKey: string = getWeekKey()
): UserDetails {
  const playerAttempts = allPlayerAttempts.filter(a => a.playerId === playerId);
  const passedList = playerAttempts.filter(isPassedAttempt);
  const clampTime = (val: number) =>
    Number.isFinite(val) ? Math.min(3600, Math.max(0, Math.round(val * 10) / 10)) : 0;

  const bestTimeAllTime =
    passedList.length > 0
      ? clampTime(Math.min(...passedList.map(a => a.totalTimeSeconds)))
      : 0;
  const averagePassedTime =
    passedList.length > 0
      ? clampTime(
          passedList.reduce((sum, a) => sum + (Number(a.totalTimeSeconds) || 0), 0) /
            passedList.length
        )
      : 0;

  let ansSum = 0;
  let ansCount = 0;
  for (const att of playerAttempts) {
    for (const ans of att.answers) {
      if (typeof ans.timeSpentSeconds === 'number' && ans.timeSpentSeconds > 0) {
        ansSum += ans.timeSpentSeconds;
        ansCount += 1;
      }
    }
  }
  const overallAvgQuestionTime = ansCount > 0 ? clampTime(ansSum / ansCount) : 0;

  const thisWeekPassed = playerAttempts.some(
    a => a.weekKey === currentWeekKey && isPassedAttempt(a)
  );

  const weeklyTrends = calculateWeeklyTrends(playerAttempts)
    .filter(w => Boolean(w.weekKey))
    .slice(-300)
    .map(w => ({
      weekKey: w.weekKey,
      attemptCount: Math.max(0, Math.round(w.attemptCount)),
      averageScore: clampTime(w.averageScore),
      averageAccuracy: Math.min(100, Math.max(0, Math.round(w.averageAccuracy)))
    }));

  const qStatsMap = calculateQuestionStats(playerAttempts);
  const questionStats: UserDetailsQuestionStat[] = Array.from(qStatsMap.values())
    .slice(0, 500)
    .map(stat => ({
      questionId: String(stat.questionId),
      total: Math.max(0, Math.round(stat.total)),
      correct: Math.max(0, Math.round(stat.correct)),
      wrong: Math.max(0, Math.round(stat.wrong)),
      accuracy: Math.min(100, Math.max(0, Math.round(stat.accuracy))),
      timedCount: Math.max(0, Math.round(stat.timedCount)),
      totalTimeSeconds: Math.max(0, Math.round(stat.totalTimeSeconds * 10) / 10),
      averageTimeSeconds: clampTime(stat.averageTimeSeconds),
      lastIsCorrect: Boolean(stat.lastIsCorrect),
      lastAttemptTimestamp: String(stat.lastAttemptTimestamp || '')
    }));

  const recentAttempts: UserDetailsRecentAttempt[] = [...playerAttempts]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50)
    .map(att => ({
      id: String(att.id),
      weekKey: String(att.weekKey || ''),
      timestamp: String(att.timestamp || ''),
      totalTimeSeconds: clampTime(att.totalTimeSeconds),
      correctCount: Math.max(0, Math.round(att.correctCount || 0)),
      totalQuestions: Math.max(1, Math.round(att.totalQuestions || 1)),
      passed: isPassedAttempt(att)
    }));

  return {
    userId: playerId,
    totalAttempts: Math.min(10000, Math.max(0, Math.round(playerAttempts.length))),
    passedAttempts: Math.min(10000, Math.max(0, Math.round(passedList.length))),
    bestTimeAllTime,
    averagePassedTime,
    overallAvgQuestionTime,
    currentStreak: Math.min(1000, Math.max(0, Math.round(calculateCurrentErrorFreeStreak(playerAttempts)))),
    bestStreak: Math.min(1000, Math.max(0, Math.round(calculateBestErrorFreeStreak(playerAttempts)))),
    currentWeekKey,
    thisWeekPassed,
    weeklyTrends,
    questionStats,
    recentAttempts
  };
}

/**
 * Computes tactical topic gaps directly from precalculated per-question stats
 * and the loaded question catalog (no raw attempts required).
 */
export function calculateTacticalGapsFromQuestionStats(
  allQuestions: Question[],
  questionStats: UserDetailsQuestionStat[]
): TacticalGapReport[] {
  const questionMap = new Map<string, Question>();
  allQuestions.forEach(q => questionMap.set(q.id, q));

  const tagStats = new Map<string, { total: number; correct: number; questionIds: Set<string> }>();
  allQuestions.forEach(q => {
    q.tags.forEach(tag => {
      if (!tagStats.has(tag)) {
        tagStats.set(tag, { total: 0, correct: 0, questionIds: new Set() });
      }
    });
  });

  for (const qStat of questionStats) {
    const q = questionMap.get(qStat.questionId);
    if (!q) continue;
    for (const tag of q.tags) {
      let stat = tagStats.get(tag);
      if (!stat) {
        stat = { total: 0, correct: 0, questionIds: new Set() };
        tagStats.set(tag, stat);
      }
      stat.total += qStat.total;
      stat.correct += qStat.correct;
      stat.questionIds.add(q.id);
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

  return reports.sort((a, b) => {
    if (a.totalAnswered === 0 && b.totalAnswered > 0) return 1;
    if (b.totalAnswered === 0 && a.totalAnswered > 0) return -1;
    return a.accuracyPercentage - b.accuracyPercentage;
  });
}

/**
 * Aggregates per-question performance statistics across precalculated UserDetails documents,
 * optionally filtered to a specific player or set of team player IDs.
 */
export function aggregateQuestionStatsFromUserDetails(
  userDetailsList: UserDetails[],
  options: {
    playerIdFilter?: string;
    teamPlayerIds?: Set<string> | null;
  } = {}
): Map<string, QuestionPerformanceStat> {
  const map = new Map<string, QuestionPerformanceStat>();
  const { playerIdFilter, teamPlayerIds } = options;

  for (const details of userDetailsList) {
    if (playerIdFilter && playerIdFilter !== 'all' && details.userId !== playerIdFilter) {
      continue;
    }
    if (
      (!playerIdFilter || playerIdFilter === 'all') &&
      teamPlayerIds &&
      !teamPlayerIds.has(details.userId)
    ) {
      continue;
    }

    for (const qStat of details.questionStats || []) {
      const existing = map.get(qStat.questionId);
      if (!existing) {
        map.set(qStat.questionId, {
          questionId: qStat.questionId,
          total: qStat.total,
          correct: qStat.correct,
          wrong: qStat.wrong,
          accuracy: qStat.accuracy,
          timedCount: qStat.timedCount,
          totalTimeSeconds: qStat.totalTimeSeconds,
          averageTimeSeconds: qStat.averageTimeSeconds,
          lastIsCorrect: qStat.lastIsCorrect,
          lastAttemptTimestamp: qStat.lastAttemptTimestamp
        });
      } else {
        existing.total += qStat.total;
        existing.correct += qStat.correct;
        existing.wrong += qStat.wrong;
        existing.timedCount += qStat.timedCount;
        existing.totalTimeSeconds += qStat.totalTimeSeconds;

        const incomingTs = qStat.lastAttemptTimestamp
          ? new Date(qStat.lastAttemptTimestamp).getTime()
          : 0;
        const existingTs = existing.lastAttemptTimestamp
          ? new Date(existing.lastAttemptTimestamp).getTime()
          : 0;
        if (incomingTs >= existingTs) {
          existing.lastIsCorrect = qStat.lastIsCorrect;
          existing.lastAttemptTimestamp = qStat.lastAttemptTimestamp;
        }
      }
    }
  }

  for (const cur of map.values()) {
    cur.accuracy = cur.total > 0 ? Math.round((cur.correct / cur.total) * 100) : 0;
    cur.averageTimeSeconds =
      cur.timedCount > 0 ? Math.round((cur.totalTimeSeconds / cur.timedCount) * 10) / 10 : 0;
  }

  return map;
}



