import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWeekKey,
  getPreviousWeekKey,
  generateQuizSession,
  calculateQuestionScore,
  calculateTacticalGaps,
  calculateWeeklyLeaderboard,
  calculateAllTimeLeaderboard,
  calculateWeeklyTrends,
  filterQuestionsForTeam,
  getTeamQuizConfig,
  calculateCurrentErrorFreeStreak,
  calculateBestErrorFreeStreak,
  calculatePlayerMedals,
  calculateCompletedWeekMedals,
  calculateQuestionStats,
  getOptionDisplayText,
  ONLINE_WINDOW_MS,
  isPlayerOnline,
  buildUserStatsFromAttempts,
  buildUserDetailsFromAttempts,
  calculateTacticalGapsFromQuestionStats,
  aggregateQuestionStatsFromUserDetails
} from './quizEngine';
import { Question, QuizConfig, QuizAttempt, Player, Team, UserDetails, UserStats } from '../types/basketball';

const dummyQuestions: Question[] = [
  {
    id: 'q1',
    title: 'Pick & Roll Drop Coverage',
    scenario: 'Ball handler attacks middle off high screen',
    tags: ['Pick & Roll', 'Defense'],
    isPriorityFocus: true,
    keyConcept: 'Drop Coverage',
    explanation: 'Big stays in drop to deter paint floater',
    createdAt: '2026-01-01',
    options: [
      { id: 'opt1', text: 'Drop to free throw circle', isCorrect: true },
      { id: 'opt2', text: 'Trap aggressively at halfcourt', isCorrect: false }
    ]
  },
  {
    id: 'q2',
    title: 'Corner 3 Kickout',
    scenario: 'Help defender tags roller from strong side corner',
    tags: ['Motion Offense', 'Shooting'],
    isPriorityFocus: false,
    keyConcept: 'Weakside Spacing',
    explanation: 'Pass to vacant corner for open catch-and-shoot',
    createdAt: '2026-01-02',
    options: [
      { id: 'opt3', text: 'Skip pass to corner shooter', isCorrect: true },
      { id: 'opt4', text: 'Contested floater', isCorrect: false }
    ]
  },
  {
    id: 'q3',
    title: '2-3 Zone Weak Spot',
    scenario: 'Facing active 2-3 zone defense',
    tags: ['Zone Offense', 'Passing'],
    isPriorityFocus: false,
    keyConcept: 'High Post Flash',
    explanation: 'High post flash collapses top two defenders',
    createdAt: '2026-01-03',
    options: [
      { id: 'opt5', text: 'Flash 4 to the nail / free throw line', isCorrect: true },
      { id: 'opt6', text: 'Dribble straight into the center', isCorrect: false }
    ]
  },
  {
    id: 'q4',
    title: 'Baseline Inbounds Box Play',
    scenario: '3 seconds left on shot clock from baseline',
    tags: ['Inbounds (BLOB)', 'Set Play'],
    isPriorityFocus: true,
    keyConcept: 'Cross Screen for Shooter',
    explanation: 'Cross screen frees up 2 guard in opposite corner',
    createdAt: '2026-01-04',
    options: [
      { id: 'opt7', text: 'Execute cross screen for 2 guard', isCorrect: true },
      { id: 'opt8', text: 'Throw full court lob', isCorrect: false }
    ]
  }
];

test('getWeekKey formats ISO week correctly', () => {
  const week = getWeekKey(new Date('2026-11-03T12:00:00Z'));
  assert.match(week, /^2026-W\d{2}$/);
});

test('generateQuizSession prevents duplicates and respects questionCount', () => {
  const config: QuizConfig = {
    questionCount: 3,
    timePerQuestionSeconds: 20,
    prioritizeFocusQuestions: true,
    ensureDiverseTopics: true
  };

  const session = generateQuizSession(dummyQuestions, config);
  assert.equal(session.length, 3);

  // Check no duplicates
  const uniqueIds = new Set(session.map(q => q.id));
  assert.equal(uniqueIds.size, 3);
});

test('generateQuizSession ensures diverse topics when requested', () => {
  const config: QuizConfig = {
    questionCount: 3,
    timePerQuestionSeconds: 20,
    prioritizeFocusQuestions: false,
    ensureDiverseTopics: true
  };

  const session = generateQuizSession(dummyQuestions, config);
  const distinctTags = new Set(session.flatMap(q => q.tags));
  // At least 3 different tags should be represented across 3 questions
  assert.ok(distinctTags.size >= 3);
});

test('calculateQuestionScore awards points for correctness, speed, and streaks', () => {
  // Wrong answer -> 0
  assert.equal(calculateQuestionScore(false, 15, 20, 0), 0);

  // Correct answer with half time left and no streak
  // Base 100 + round(10/20 * 50 = 25) + 0 = 125
  const score1 = calculateQuestionScore(true, 10, 20, 0);
  assert.equal(score1, 125);

  // Correct answer with full time and 3 streak
  // Base 100 + 50 + min(3 * 15 = 45, 75) = 195
  const score2 = calculateQuestionScore(true, 20, 20, 3);
  assert.equal(score2, 195);
});

test('calculateTacticalGaps computes accuracy and identifies critical gaps', () => {
  const dummyAttempts: QuizAttempt[] = [
    {
      id: 'att1',
      playerId: 'p1',
      timestamp: '2026-11-03T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 100,
      correctCount: 1,
      totalQuestions: 2,
      totalTimeSeconds: 25,
      maxStreak: 1,
      answers: [
        { questionId: 'q1', selectedOptionId: 'opt2', isCorrect: false, timeSpentSeconds: 10, pointsEarned: 0 },
        { questionId: 'q2', selectedOptionId: 'opt3', isCorrect: true, timeSpentSeconds: 15, pointsEarned: 120 }
      ]
    }
  ];

  const gaps = calculateTacticalGaps(dummyQuestions, dummyAttempts);
  const pnrGap = gaps.find(g => g.tag === 'Pick & Roll');
  assert.ok(pnrGap);
  assert.equal(pnrGap.totalAnswered, 1);
  assert.equal(pnrGap.correctAnswered, 0);
  assert.equal(pnrGap.accuracyPercentage, 0);
  assert.equal(pnrGap.status, 'critical_gap');

  const motionGap = gaps.find(g => g.tag === 'Motion Offense');
  assert.ok(motionGap);
  assert.equal(motionGap.accuracyPercentage, 100);
  assert.equal(motionGap.status, 'mastered');
});

test('calculateWeeklyLeaderboard accurately tracks completion and ranks players', () => {
  const players: Player[] = [
    { id: 'p1', name: 'Marcus Smart', avatarColor: '#10b981' },
    { id: 'p2', name: 'Jayson Tatum', avatarColor: '#3b82f6' }
  ];

  const attempts: QuizAttempt[] = [
    {
      id: 'att1',
      playerId: 'p1',
      timestamp: '2026-11-02T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 450,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 60,
      maxStreak: 3,
      answers: [],
      passed: true
    }
  ];

  const leaderboard = calculateWeeklyLeaderboard(players, attempts, '2026-W45');
  assert.equal(leaderboard.length, 2);

  // Player 1 completed this week
  assert.equal(leaderboard[0].player.id, 'p1');
  assert.equal(leaderboard[0].hasCompletedThisWeek, true);
  assert.equal(leaderboard[0].bestScoreThisWeek, 60);
  assert.equal(leaderboard[0].averageTimeThisWeek, 60);

  // Player 2 has NOT completed this week
  assert.equal(leaderboard[1].player.id, 'p2');
  assert.equal(leaderboard[1].hasCompletedThisWeek, false);
  assert.equal(leaderboard[1].bestScoreThisWeek, 0);
  assert.equal(leaderboard[1].averageTimeThisWeek, 0);
});

test('calculateWeeklyTrends aggregates scores and accuracy chronologically, excluding failed quizzes from average time', () => {
  const attempts: QuizAttempt[] = [
    {
      id: 'a1',
      playerId: 'p1',
      timestamp: '2026-11-01T10:00:00Z',
      weekKey: '2026-W44',
      totalScore: 50,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 50,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'a2',
      playerId: 'p1',
      timestamp: '2026-11-08T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 40,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 40,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'a3-failed',
      playerId: 'p1',
      timestamp: '2026-11-08T11:00:00Z',
      weekKey: '2026-W45',
      totalScore: 5,
      correctCount: 1,
      totalQuestions: 5,
      totalTimeSeconds: 5,
      maxStreak: 1,
      answers: [],
      passed: false
    }
  ];

  const trends = calculateWeeklyTrends(attempts);
  assert.equal(trends.length, 2);
  assert.equal(trends[0].weekKey, '2026-W44');
  assert.equal(trends[0].averageScore, 50);
  assert.equal(trends[0].averageAccuracy, 100);
  assert.equal(trends[1].weekKey, '2026-W45');
  // W45 has 1 passed attempt (40s) and 1 failed attempt (5s) -> average time must be 40s (not 22s!)
  assert.equal(trends[1].averageScore, 40);
  assert.equal(trends[1].averageAccuracy, 60);
});

test('filterQuestionsForTeam includes global and team-specific questions while excluding other teams', () => {
  const mixedQuestions: Question[] = [
    { ...dummyQuestions[0], id: 'global-1' }, // omitted teamIds -> all teams
    { ...dummyQuestions[1], id: 'global-2', teamIds: [] }, // empty teamIds -> all teams
    { ...dummyQuestions[2], id: 'u18-only', teamIds: ['team-u18'] },
    { ...dummyQuestions[3], id: 'h1-only', teamIds: ['team-h1'] }
  ];

  const u18Pool = filterQuestionsForTeam(mixedQuestions, 'team-u18').map(q => q.id);
  assert.deepEqual(u18Pool, ['global-1', 'global-2', 'u18-only']);

  const globalOnlyPool = filterQuestionsForTeam(mixedQuestions, null).map(q => q.id);
  assert.deepEqual(globalOnlyPool, ['global-1', 'global-2']);

  const session = generateQuizSession(
    mixedQuestions,
    {
      questionCount: 10,
      timePerQuestionSeconds: 20,
      prioritizeFocusQuestions: false,
      ensureDiverseTopics: false
    },
    'team-h1'
  );
  assert.deepEqual(
    session.map(q => q.id).sort(),
    ['global-1', 'global-2', 'h1-only']
  );
});

test('getTeamQuizConfig applies team overrides while preserving topicLabels', () => {
  const fallback: QuizConfig = {
    questionCount: 5,
    timePerQuestionSeconds: 24,
    prioritizeFocusQuestions: true,
    ensureDiverseTopics: true,
    topicLabels: ['Offense', 'Defense']
  };

  const team: Team = {
    id: 'team-u18',
    name: 'U18',
    playerIds: ['p1', 'p2'],
    questionCount: 8,
    timePerQuestionSeconds: 15,
    prioritizeFocusQuestions: false,
    ensureDiverseTopics: false,
    selectedTags: ['Defense'],
    createdBy: 'coach-1',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01'
  };

  const resolved = getTeamQuizConfig(team, fallback);
  assert.equal(resolved.questionCount, 8);
  assert.equal(resolved.timePerQuestionSeconds, 15);
  assert.equal(resolved.prioritizeFocusQuestions, false);
  assert.deepEqual(resolved.selectedTags, ['Defense']);
  assert.deepEqual(resolved.topicLabels, ['Offense', 'Defense']);

  assert.deepEqual(getTeamQuizConfig(null, fallback), fallback);
});

test('calculateAllTimeLeaderboard aggregates all attempts across weeks', () => {
  const players: Player[] = [
    { id: 'p1', name: 'Marcus Smart', avatarColor: '#10b981' }
  ];

  const attempts: QuizAttempt[] = [
    {
      id: 'att1',
      playerId: 'p1',
      timestamp: '2026-10-01T10:00:00Z',
      weekKey: '2026-W40',
      totalScore: 300,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 45,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'att2',
      playerId: 'p1',
      timestamp: '2026-11-02T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 450,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 30,
      maxStreak: 5,
      answers: [],
      passed: true
    }
  ];

  const leaderboard = calculateAllTimeLeaderboard(players, attempts);
  assert.equal(leaderboard.length, 1);
  assert.equal(leaderboard[0].player.id, 'p1');
  assert.equal(leaderboard[0].bestScoreThisWeek, 30);
  assert.equal(leaderboard[0].currentStreak, 2);
  assert.equal(leaderboard[0].bestStreak, 2);
});

test('calculateCurrentErrorFreeStreak counts trailing passed attempts accurately', () => {
  const attempts: QuizAttempt[] = [
    {
      id: 'a1',
      playerId: 'p1',
      timestamp: '2026-11-01T10:00:00Z',
      weekKey: '2026-W44',
      totalScore: 20.5,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 20.5,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'a2',
      playerId: 'p1',
      timestamp: '2026-11-02T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 5.1,
      correctCount: 1,
      totalQuestions: 5,
      totalTimeSeconds: 5.1,
      maxStreak: 1,
      answers: [],
      passed: false
    },
    {
      id: 'a3',
      playerId: 'p1',
      timestamp: '2026-11-03T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 18.2,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 18.2,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'a4',
      playerId: 'p1',
      timestamp: '2026-11-04T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 16.7,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 16.7,
      maxStreak: 5,
      answers: [],
      passed: true
    }
  ];

  assert.equal(calculateCurrentErrorFreeStreak(attempts), 2);
  assert.equal(calculateCurrentErrorFreeStreak([]), 0);

  // If latest run is a fail, streak resets to 0
  const withLatestFail: QuizAttempt[] = [
    ...attempts,
    {
      id: 'a5',
      playerId: 'p1',
      timestamp: '2026-11-05T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 4.0,
      correctCount: 0,
      totalQuestions: 5,
      totalTimeSeconds: 4.0,
      maxStreak: 0,
      answers: [],
      passed: false
    }
  ];
  assert.equal(calculateCurrentErrorFreeStreak(withLatestFail), 0);
  // Highest streak before that fail was 2 (a3 + a4)
  assert.equal(calculateBestErrorFreeStreak(withLatestFail), 2);
});

test('calculateBestErrorFreeStreak finds peak consecutive passed runs across history', () => {
  const mk = (id: string, ts: string, passed: boolean): QuizAttempt => ({
    id,
    playerId: 'p1',
    timestamp: ts,
    weekKey: '2026-W45',
    totalScore: 15,
    correctCount: passed ? 5 : 2,
    totalQuestions: 5,
    totalTimeSeconds: 15,
    maxStreak: passed ? 5 : 2,
    answers: [],
    passed
  });

  const history: QuizAttempt[] = [
    mk('1', '2026-11-01T10:00:00Z', true),
    mk('2', '2026-11-02T10:00:00Z', true),
    mk('3', '2026-11-03T10:00:00Z', true),
    mk('4', '2026-11-04T10:00:00Z', false),
    mk('5', '2026-11-05T10:00:00Z', true)
  ];

  assert.equal(calculateCurrentErrorFreeStreak(history), 1);
  assert.equal(calculateBestErrorFreeStreak(history), 3);
  assert.equal(calculateBestErrorFreeStreak([]), 0);
});

test('getOptionDisplayText hides default placeholders when option has an image while keeping custom text', () => {
  assert.equal(getOptionDisplayText('Antwort A', true), '');
  assert.equal(getOptionDisplayText('Option B', true), '');
  assert.equal(getOptionDisplayText('Bild 1', true), '');
  assert.equal(getOptionDisplayText('Drop Coverage', true), 'Drop Coverage');
  assert.equal(getOptionDisplayText('Antwort A', false), 'Antwort A');
});

test('calculatePlayerMedals awards Gold, Silver, and Bronze for completed weeks AND current week top 3 (transferring when overtaken)', () => {
  const players: Player[] = [
    { id: 'p1', name: 'Spieler 1', avatarColor: '#111', role: 'player' },
    { id: 'p2', name: 'Spieler 2', avatarColor: '#333', role: 'player' },
    { id: 'p3', name: 'Spieler 3', avatarColor: '#444', role: 'player' },
    { id: 'c1', name: 'Trainer 1', avatarColor: '#222', role: 'coach' }
  ];

  const attempts: QuizAttempt[] = [
    // W43: p1 passes (Gold), p2 passes slower (Silver), c1 fails -> no Bronze
    {
      id: 'w43-p1',
      playerId: 'p1',
      timestamp: '2026-10-20T10:00:00Z',
      weekKey: '2026-W43',
      totalScore: 25.4,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 25.4,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'w43-p2',
      playerId: 'p2',
      timestamp: '2026-10-20T10:30:00Z',
      weekKey: '2026-W43',
      totalScore: 28.0,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 28.0,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'w43-c1-fail',
      playerId: 'c1',
      timestamp: '2026-10-20T11:00:00Z',
      weekKey: '2026-W43',
      totalScore: 5.0,
      correctCount: 1,
      totalQuestions: 5,
      totalTimeSeconds: 5.0,
      maxStreak: 1,
      answers: [],
      passed: false
    },
    // W44: c1 (14.2s -> Gold), p1 (19.8s -> Silver), p3 (22.1s -> Bronze), p2 (24.0s -> 4th, no medal)
    {
      id: 'w44-p1',
      playerId: 'p1',
      timestamp: '2026-10-27T10:00:00Z',
      weekKey: '2026-W44',
      totalScore: 19.8,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 19.8,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'w44-c1',
      playerId: 'c1',
      timestamp: '2026-10-27T11:00:00Z',
      weekKey: '2026-W44',
      totalScore: 14.2,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 14.2,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'w44-p3',
      playerId: 'p3',
      timestamp: '2026-10-27T12:00:00Z',
      weekKey: '2026-W44',
      totalScore: 22.1,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 22.1,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'w44-p2',
      playerId: 'p2',
      timestamp: '2026-10-27T13:00:00Z',
      weekKey: '2026-W44',
      totalScore: 24.0,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 24.0,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    // W45 (current week): p1 leads in 10.1s (Gold), p2 in 12.0s (Silver)
    {
      id: 'w45-p1',
      playerId: 'p1',
      timestamp: '2026-11-03T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 10.1,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 10.1,
      maxStreak: 5,
      answers: [],
      passed: true
    },
    {
      id: 'w45-p2',
      playerId: 'p2',
      timestamp: '2026-11-03T11:00:00Z',
      weekKey: '2026-W45',
      totalScore: 12.0,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 12.0,
      maxStreak: 5,
      answers: [],
      passed: true
    }
  ];

  const medalsBefore = calculatePlayerMedals(
    attempts,
    '2026-W45',
    new Set(players.map(p => p.id))
  );
  assert.deepEqual(medalsBefore.get('p1'), { gold: 2, silver: 1, bronze: 0 });
  assert.deepEqual(medalsBefore.get('p2'), { gold: 0, silver: 2, bronze: 0 });
  assert.deepEqual(medalsBefore.get('p3'), { gold: 0, silver: 0, bronze: 1 });
  assert.deepEqual(medalsBefore.get('c1'), { gold: 1, silver: 0, bronze: 0 });

  // c1 posts faster time in W45 (9.4s) -> c1 takes W45 Gold, p1 shifts to W45 Silver, p2 shifts to W45 Bronze
  const attemptsAfterOvertake: QuizAttempt[] = [
    ...attempts,
    {
      id: 'w45-c1-lead',
      playerId: 'c1',
      timestamp: '2026-11-04T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 9.4,
      correctCount: 5,
      totalQuestions: 5,
      totalTimeSeconds: 9.4,
      maxStreak: 5,
      answers: [],
      passed: true
    }
  ];

  const medalsAfter = calculatePlayerMedals(
    attemptsAfterOvertake,
    '2026-W45',
    new Set(players.map(p => p.id))
  );
  assert.deepEqual(medalsAfter.get('c1'), { gold: 2, silver: 0, bronze: 0 });
  assert.deepEqual(medalsAfter.get('p1'), { gold: 1, silver: 2, bronze: 0 });
  assert.deepEqual(medalsAfter.get('p2'), { gold: 0, silver: 1, bronze: 1 });
  assert.deepEqual(medalsAfter.get('p3'), { gold: 0, silver: 0, bronze: 1 });

  // Coaches are included on the weekly leaderboard
  const w44Board = calculateWeeklyLeaderboard(players, attempts, '2026-W44');
  assert.equal(w44Board[0].player.id, 'c1');
  assert.equal(w44Board[0].bestScoreThisWeek, 14.2);
  assert.equal(w44Board[1].player.id, 'p1');
  assert.equal(w44Board[1].bestScoreThisWeek, 19.8);
});

test('calculateQuestionStats computes average time per question to 1 decimal place and latest answer status', () => {
  const attempts: QuizAttempt[] = [
    {
      id: 'att1',
      playerId: 'p1',
      timestamp: '2026-11-01T10:00:00Z',
      weekKey: '2026-W44',
      totalScore: 10.5,
      correctCount: 1,
      totalQuestions: 2,
      totalTimeSeconds: 10.5,
      maxStreak: 1,
      answers: [
        { questionId: 'q1', selectedOptionId: 'opt1', isCorrect: true, timeSpentSeconds: 3.2, pointsEarned: 100 },
        { questionId: 'q2', selectedOptionId: 'opt4', isCorrect: false, timeSpentSeconds: 7.3, pointsEarned: 0 }
      ],
      passed: false
    },
    {
      id: 'att2',
      playerId: 'p2',
      timestamp: '2026-11-02T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 8.6,
      correctCount: 2,
      totalQuestions: 2,
      totalTimeSeconds: 8.6,
      maxStreak: 2,
      answers: [
        { questionId: 'q1', selectedOptionId: 'opt1', isCorrect: true, timeSpentSeconds: 4.5, pointsEarned: 100 },
        { questionId: 'q2', selectedOptionId: 'opt3', isCorrect: true, timeSpentSeconds: 4.1, pointsEarned: 100 }
      ],
      passed: true
    }
  ];

  const stats = calculateQuestionStats(attempts);
  const q1 = stats.get('q1');
  assert.ok(q1);
  assert.equal(q1.total, 2);
  assert.equal(q1.correct, 2);
  assert.equal(q1.accuracy, 100);
  // (3.2 + 4.5) / 2 = 3.85 -> 3.9s
  assert.equal(q1.averageTimeSeconds, 3.9);
  assert.equal(q1.lastIsCorrect, true);

  const q2 = stats.get('q2');
  assert.ok(q2);
  assert.equal(q2.total, 2);
  assert.equal(q2.correct, 1);
  assert.equal(q2.wrong, 1);
  assert.equal(q2.accuracy, 50);
  // (7.3 + 4.1) / 2 = 5.7s
  assert.equal(q2.averageTimeSeconds, 5.7);
  assert.equal(q2.lastIsCorrect, true);
});

test('calculateAllTimeLeaderboard tracks bestStreak even after a later failed run resets currentStreak', () => {
  const players: Player[] = [
    { id: 'p1', name: 'Marcus Smart', avatarColor: '#10b981' }
  ];
  const mkAttempt = (id: string, ts: string, passed: boolean): QuizAttempt => ({
    id,
    playerId: 'p1',
    timestamp: ts,
    weekKey: '2026-W45',
    totalScore: 20,
    correctCount: passed ? 5 : 2,
    totalQuestions: 5,
    totalTimeSeconds: 20,
    maxStreak: passed ? 5 : 2,
    answers: [],
    passed
  });

  const attempts: QuizAttempt[] = [
    mkAttempt('a1', '2026-11-01T10:00:00Z', true),
    mkAttempt('a2', '2026-11-02T10:00:00Z', true),
    mkAttempt('a3', '2026-11-03T10:00:00Z', true),
    mkAttempt('a4', '2026-11-04T10:00:00Z', false),
    mkAttempt('a5', '2026-11-05T10:00:00Z', true)
  ];

  const leaderboard = calculateAllTimeLeaderboard(players, attempts);
  assert.equal(leaderboard[0].currentStreak, 1);
  assert.equal(leaderboard[0].bestStreak, 3);
});

test('isPlayerOnline returns true only when a round was started within the last minute', () => {
  const nowMs = new Date('2026-11-10T12:00:00.000Z').getTime();

  assert.equal(isPlayerOnline(undefined, nowMs), false);
  assert.equal(isPlayerOnline(null, nowMs), false);
  assert.equal(isPlayerOnline('invalid-date', nowMs), false);

  // Started 0ms ago, 30s ago, and exactly 60s ago -> online
  assert.equal(isPlayerOnline(new Date(nowMs).toISOString(), nowMs), true);
  assert.equal(isPlayerOnline(new Date(nowMs - 30_000).toISOString(), nowMs), true);
  assert.equal(isPlayerOnline(new Date(nowMs - ONLINE_WINDOW_MS).toISOString(), nowMs), true);

  // Slight client/server clock skew ahead by 5s -> online
  assert.equal(isPlayerOnline(new Date(nowMs + 5_000).toISOString(), nowMs), true);

  // Started 60.001s ago or 5m ago -> offline
  assert.equal(isPlayerOnline(new Date(nowMs - ONLINE_WINDOW_MS - 1).toISOString(), nowMs), false);
  assert.equal(isPlayerOnline(new Date(nowMs - 300_000).toISOString(), nowMs), false);
});

test('calculateWeeklyLeaderboard and calculateAllTimeLeaderboard read attempt counts and scores from userStatsMap when attempts are unloaded', () => {
  const players: Player[] = [
    { id: 'p1', name: 'Luka', avatarColor: '#111' },
    { id: 'p2', name: 'Franz', avatarColor: '#222' },
    { id: 'p3', name: 'Dennis', avatarColor: '#333' }
  ];

  const userStatsMap = new Map([
    [
      'p1',
      {
        userId: 'p1',
        currentStreak: 3,
        bestStreak: 5,
        totalAttemptsAllTime: 14,
        attemptsThisWeek: 4,
        currentWeekKey: '2026-W46',
        bestScoreThisWeek: 18.4,
        bestScoreAllTime: 12.7
      }
    ],
    [
      'p2',
      {
        userId: 'p2',
        currentStreak: 0,
        bestStreak: 2,
        totalAttemptsAllTime: 7,
        attemptsThisWeek: 2,
        currentWeekKey: '2026-W46',
        bestScoreThisWeek: 0,
        bestScoreAllTime: 15.1
      }
    ],
    [
      'p3',
      {
        userId: 'p3',
        currentStreak: 1,
        bestStreak: 1,
        totalAttemptsAllTime: 3,
        attemptsThisWeek: 5,
        currentWeekKey: '2026-W45', // stale week
        bestScoreThisWeek: 11.2,
        bestScoreAllTime: 11.2
      }
    ]
  ]);

  const weekly = calculateWeeklyLeaderboard(players, [], '2026-W46', userStatsMap);
  const p1Weekly = weekly.find(w => w.player.id === 'p1')!;
  const p2Weekly = weekly.find(w => w.player.id === 'p2')!;
  const p3Weekly = weekly.find(w => w.player.id === 'p3')!;

  assert.equal(p1Weekly.hasCompletedThisWeek, true);
  assert.equal(p1Weekly.attemptsThisWeek, 4);
  assert.equal(p1Weekly.totalAttemptsAllTime, 14);
  assert.equal(p1Weekly.bestScoreThisWeek, 18.4);

  assert.equal(p2Weekly.hasCompletedThisWeek, false);
  assert.equal(p2Weekly.attemptsThisWeek, 2);
  assert.equal(p2Weekly.totalAttemptsAllTime, 7);

  // p3 stats are from W45 -> should not count as W46 completion or attempts
  assert.equal(p3Weekly.hasCompletedThisWeek, false);
  assert.equal(p3Weekly.attemptsThisWeek, 0);
  assert.equal(p3Weekly.totalAttemptsAllTime, 3);
  assert.equal(p3Weekly.bestScoreThisWeek, 0);

  const allTime = calculateAllTimeLeaderboard(players, [], userStatsMap);
  assert.equal(allTime[0].player.id, 'p3'); // 11.2s best all time
  assert.equal(allTime[0].totalAttemptsAllTime, 3);
  assert.equal(allTime[0].bestScoreThisWeek, 11.2);
  assert.equal(allTime.find(a => a.player.id === 'p1')!.totalAttemptsAllTime, 14);
  assert.equal(allTime.find(a => a.player.id === 'p1')!.bestScoreThisWeek, 12.7);
  assert.equal(allTime.find(a => a.player.id === 'p2')!.totalAttemptsAllTime, 7);
  assert.equal(allTime.find(a => a.player.id === 'p2')!.bestScoreThisWeek, 15.1);

  const medals = calculatePlayerMedals([], '2026-W46', new Set(['p1', 'p2', 'p3']), userStatsMap);
  assert.deepEqual(medals.get('p1'), { gold: 1, silver: 0, bronze: 0 });
  // p3 has an unfinalized W45 best score (11.2s) -> receives provisional Gold for W45 until finalized
  assert.deepEqual(medals.get('p3'), { gold: 1, silver: 0, bronze: 0 });
});

test('buildUserStatsFromAttempts and buildUserDetailsFromAttempts precalculate all detail metrics and match tactical gaps', () => {
  const attempts: QuizAttempt[] = [
    {
      id: 'a1',
      playerId: 'p1',
      timestamp: '2026-11-01T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 22.0,
      correctCount: 2,
      totalQuestions: 2,
      totalTimeSeconds: 22.0,
      maxStreak: 2,
      passed: true,
      answers: [
        { questionId: 'q1', selectedOptionId: 'opt1', isCorrect: true, timeSpentSeconds: 10.0, pointsEarned: 100 },
        { questionId: 'q2', selectedOptionId: 'opt3', isCorrect: true, timeSpentSeconds: 12.0, pointsEarned: 100 }
      ]
    },
    {
      id: 'a2',
      playerId: 'p1',
      timestamp: '2026-11-08T10:00:00Z',
      weekKey: '2026-W46',
      totalScore: 15.0,
      correctCount: 1,
      totalQuestions: 2,
      totalTimeSeconds: 15.0,
      maxStreak: 1,
      passed: false,
      answers: [
        { questionId: 'q1', selectedOptionId: 'opt2', isCorrect: false, timeSpentSeconds: 5.0, pointsEarned: 0 },
        { questionId: 'q2', selectedOptionId: 'opt3', isCorrect: true, timeSpentSeconds: 10.0, pointsEarned: 100 }
      ]
    },
    {
      id: 'a3',
      playerId: 'p1',
      timestamp: '2026-11-09T10:00:00Z',
      weekKey: '2026-W46',
      totalScore: 14.0,
      correctCount: 2,
      totalQuestions: 2,
      totalTimeSeconds: 14.0,
      maxStreak: 2,
      passed: true,
      answers: [
        { questionId: 'q1', selectedOptionId: 'opt1', isCorrect: true, timeSpentSeconds: 6.0, pointsEarned: 100 },
        { questionId: 'q2', selectedOptionId: 'opt3', isCorrect: true, timeSpentSeconds: 8.0, pointsEarned: 100 }
      ]
    },
    {
      id: 'other-player',
      playerId: 'p2',
      timestamp: '2026-11-09T11:00:00Z',
      weekKey: '2026-W46',
      totalScore: 10.0,
      correctCount: 2,
      totalQuestions: 2,
      totalTimeSeconds: 10.0,
      maxStreak: 2,
      passed: true,
      answers: []
    }
  ];

  const stats = buildUserStatsFromAttempts('p1', attempts, '2026-W46');
  assert.equal(stats.totalAttemptsAllTime, 3);
  assert.equal(stats.attemptsThisWeek, 2);
  assert.equal(stats.currentWeekKey, '2026-W46');
  assert.equal(stats.bestScoreThisWeek, 14.0);
  assert.equal(stats.bestScoreAllTime, 14.0);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.bestStreak, 1);

  const details = buildUserDetailsFromAttempts('p1', attempts, '2026-W46');
  assert.equal(details.totalAttempts, 3);
  assert.equal(details.passedAttempts, 2);
  assert.equal(details.bestTimeAllTime, 14.0);
  assert.equal(details.averagePassedTime, 18.0); // (22 + 14) / 2
  assert.equal(details.overallAvgQuestionTime, 8.5); // (10+12+5+10+6+8)/6 = 51/6 = 8.5
  assert.equal(details.thisWeekPassed, true);
  assert.equal(details.weeklyTrends.length, 2);
  assert.equal(details.recentAttempts.length, 3);
  assert.equal(details.recentAttempts[0].id, 'a3'); // newest first

  const directGaps = calculateTacticalGaps(dummyQuestions, attempts, 'p1');
  const precalcGaps = calculateTacticalGapsFromQuestionStats(dummyQuestions, details.questionStats);
  assert.deepEqual(precalcGaps, directGaps);
});

test('aggregateQuestionStatsFromUserDetails aggregates per-question stats across players and respects filters', () => {
  const p1Details: UserDetails = {
    userId: 'p1',
    totalAttempts: 2,
    passedAttempts: 1,
    bestTimeAllTime: 14.0,
    averagePassedTime: 14.0,
    overallAvgQuestionTime: 6.0,
    thisWeekPassed: true,
    currentWeekKey: '2026-W46',
    currentStreak: 1,
    bestStreak: 1,
    weeklyTrends: [],
    recentAttempts: [],
    questionStats: [
      {
        questionId: 'q1',
        total: 2,
        correct: 1,
        wrong: 1,
        accuracy: 50,
        timedCount: 2,
        totalTimeSeconds: 10.0,
        averageTimeSeconds: 5.0,
        lastIsCorrect: false,
        lastAttemptTimestamp: '2026-11-08T10:00:00Z'
      },
      {
        questionId: 'q2',
        total: 1,
        correct: 1,
        wrong: 0,
        accuracy: 100,
        timedCount: 1,
        totalTimeSeconds: 8.0,
        averageTimeSeconds: 8.0,
        lastIsCorrect: true,
        lastAttemptTimestamp: '2026-11-08T10:00:00Z'
      }
    ]
  };

  const p2Details: UserDetails = {
    userId: 'p2',
    totalAttempts: 1,
    passedAttempts: 1,
    bestTimeAllTime: 10.0,
    averagePassedTime: 10.0,
    overallAvgQuestionTime: 4.5,
    thisWeekPassed: true,
    currentWeekKey: '2026-W46',
    currentStreak: 1,
    bestStreak: 1,
    weeklyTrends: [],
    recentAttempts: [],
    questionStats: [
      {
        questionId: 'q1',
        total: 2,
        correct: 2,
        wrong: 0,
        accuracy: 100,
        timedCount: 2,
        totalTimeSeconds: 7.0,
        averageTimeSeconds: 3.5,
        lastIsCorrect: true,
        lastAttemptTimestamp: '2026-11-09T12:00:00Z'
      }
    ]
  };

  const allStats = aggregateQuestionStatsFromUserDetails([p1Details, p2Details]);
  const q1All = allStats.get('q1')!;
  assert.equal(q1All.total, 4);
  assert.equal(q1All.correct, 3);
  assert.equal(q1All.wrong, 1);
  assert.equal(q1All.accuracy, 75);
  // (10.0 + 7.0) / 4 = 4.25 -> 4.3s
  assert.equal(q1All.averageTimeSeconds, 4.3);
  // Latest timestamp is p2 on 2026-11-09
  assert.equal(q1All.lastIsCorrect, true);
  assert.equal(q1All.lastAttemptTimestamp, '2026-11-09T12:00:00Z');
  assert.equal(allStats.get('q2')?.total, 1);

  // Filter to specific player p1
  const p1Only = aggregateQuestionStatsFromUserDetails([p1Details, p2Details], {
    playerIdFilter: 'p1'
  });
  assert.equal(p1Only.get('q1')?.total, 2);
  assert.equal(p1Only.get('q1')?.correct, 1);
  assert.equal(p1Only.get('q1')?.accuracy, 50);
  assert.equal(p1Only.get('q1')?.lastIsCorrect, false);

  // Filter by teamPlayerIds when playerIdFilter is 'all'
  const teamOnly = aggregateQuestionStatsFromUserDetails([p1Details, p2Details], {
    playerIdFilter: 'all',
    teamPlayerIds: new Set(['p2'])
  });
  assert.equal(teamOnly.get('q1')?.total, 2);
  assert.equal(teamOnly.get('q1')?.correct, 2);
  assert.equal(teamOnly.get('q2'), undefined);
});

test('getPreviousWeekKey steps back one ISO week including year boundaries', () => {
  assert.equal(getWeekKey('2026-11-16T12:00:00Z'), '2026-W47');
  assert.equal(getPreviousWeekKey('2026-11-16T12:00:00Z'), '2026-W46');

  // 2027-01-04 is Monday of 2027-W01; 7 days prior is 2026-12-28 (2026-W53)
  assert.equal(getWeekKey('2027-01-04T12:00:00Z'), '2027-W01');
  assert.equal(getPreviousWeekKey('2027-01-04T12:00:00Z'), '2026-W53');
});

test('calculateCompletedWeekMedals scopes strictly to (afterWeekExclusive, upToWeekInclusive]', () => {
  const mk = (id: string, playerId: string, weekKey: string, secs: number): QuizAttempt => ({
    id,
    playerId,
    timestamp: '2026-11-01T10:00:00Z',
    weekKey,
    totalScore: secs,
    correctCount: 5,
    totalQuestions: 5,
    totalTimeSeconds: secs,
    maxStreak: 5,
    answers: [],
    passed: true
  });

  const attempts: QuizAttempt[] = [
    mk('w44-1', 'p1', '2026-W44', 10),
    mk('w45-1', 'p2', '2026-W45', 12),
    mk('w46-1', 'p1', '2026-W46', 14),
    mk('w46-2', 'p2', '2026-W46', 16),
    mk('w47-1', 'p3', '2026-W47', 8) // current week -> excluded when upToWeekInclusive = 2026-W46
  ];

  // Incremental finalization for W46 only (after W45, through W46)
  const w46Only = calculateCompletedWeekMedals(attempts, '2026-W45', '2026-W46', new Set(['p1', 'p2', 'p3']));
  assert.deepEqual(w46Only.get('p1'), { gold: 1, silver: 0, bronze: 0 });
  assert.deepEqual(w46Only.get('p2'), { gold: 0, silver: 1, bronze: 0 });
  assert.equal(w46Only.get('p3'), undefined);

  // Full backfill through W46 (W44 + W45 + W46)
  const allPast = calculateCompletedWeekMedals(attempts, undefined, '2026-W46', new Set(['p1', 'p2', 'p3']));
  assert.deepEqual(allPast.get('p1'), { gold: 2, silver: 0, bronze: 0 });
  assert.deepEqual(allPast.get('p2'), { gold: 1, silver: 1, bronze: 0 });
  assert.equal(allPast.get('p3'), undefined);
});

test('calculatePlayerMedals accumulates past medals, provisional unfinalized past weeks, and live current week from userStatsMap', () => {
  const validIds = new Set(['p1', 'p2', 'p3', 'p4']);
  const statsMap = new Map<string, UserStats>([
    [
      'p1',
      {
        userId: 'p1',
        currentStreak: 2,
        bestStreak: 3,
        totalAttemptsAllTime: 10,
        attemptsThisWeek: 1,
        currentWeekKey: '2026-W47',
        bestScoreThisWeek: 15.0,
        pastGold: 2,
        pastSilver: 1,
        pastBronze: 0,
        medalsThroughWeek: '2026-W45'
      }
    ],
    [
      'p2',
      {
        userId: 'p2',
        currentStreak: 1,
        bestStreak: 2,
        totalAttemptsAllTime: 8,
        attemptsThisWeek: 1,
        currentWeekKey: '2026-W46', // unfinalized past week (> W45 and < W47)
        bestScoreThisWeek: 12.0, // fastest in W46 -> provisional Gold
        pastGold: 0,
        pastSilver: 1,
        pastBronze: 1,
        medalsThroughWeek: '2026-W45'
      }
    ],
    [
      'p3',
      {
        userId: 'p3',
        currentStreak: 1,
        bestStreak: 1,
        totalAttemptsAllTime: 5,
        attemptsThisWeek: 2,
        currentWeekKey: '2026-W47',
        bestScoreThisWeek: 11.0, // faster than p1 in W47 -> live Gold; p1 gets live Silver
        pastGold: 0,
        pastSilver: 0,
        pastBronze: 0,
        medalsThroughWeek: '2026-W45'
      }
    ],
    [
      'p4',
      {
        userId: 'p4',
        currentStreak: 1,
        bestStreak: 1,
        totalAttemptsAllTime: 2,
        attemptsThisWeek: 1,
        currentWeekKey: '2026-W45', // <= medalsThroughWeek -> must NOT be double counted provisionally
        bestScoreThisWeek: 9.0,
        pastGold: 1,
        pastSilver: 0,
        pastBronze: 0,
        medalsThroughWeek: '2026-W45'
      }
    ]
  ]);

  const medals = calculatePlayerMedals([], '2026-W47', validIds, statsMap);
  // p1: 2 pastGold + 1 pastSilver + live W47 Silver => { gold: 2, silver: 2, bronze: 0 }
  assert.deepEqual(medals.get('p1'), { gold: 2, silver: 2, bronze: 0 });
  // p2: 1 pastSilver + 1 pastBronze + provisional W46 Gold => { gold: 1, silver: 1, bronze: 1 }
  assert.deepEqual(medals.get('p2'), { gold: 1, silver: 1, bronze: 1 });
  // p3: live W47 Gold => { gold: 1, silver: 0, bronze: 0 }
  assert.deepEqual(medals.get('p3'), { gold: 1, silver: 0, bronze: 0 });
  // p4: 1 pastGold only (W45 already finalized) => { gold: 1, silver: 0, bronze: 0 }
  assert.deepEqual(medals.get('p4'), { gold: 1, silver: 0, bronze: 0 });
});

