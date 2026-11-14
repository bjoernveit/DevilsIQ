import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWeekKey,
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
  getOptionDisplayText
} from './quizEngine';
import { Question, QuizConfig, QuizAttempt, Player, Team } from '../types/basketball';

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


