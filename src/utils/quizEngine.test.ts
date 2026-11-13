import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWeekKey,
  generateQuizSession,
  calculateQuestionScore,
  calculateTacticalGaps,
  calculateWeeklyLeaderboard,
  calculateWeeklyTrends
} from './quizEngine';
import { Question, QuizConfig, QuizAttempt, Player } from '../types/basketball';

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
      correctCount: 4,
      totalQuestions: 5,
      totalTimeSeconds: 60,
      maxStreak: 3,
      answers: []
    }
  ];

  const leaderboard = calculateWeeklyLeaderboard(players, attempts, '2026-W45');
  assert.equal(leaderboard.length, 2);

  // Player 1 completed this week
  assert.equal(leaderboard[0].player.id, 'p1');
  assert.equal(leaderboard[0].hasCompletedThisWeek, true);
  assert.equal(leaderboard[0].bestScoreThisWeek, 450);

  // Player 2 has NOT completed this week
  assert.equal(leaderboard[1].player.id, 'p2');
  assert.equal(leaderboard[1].hasCompletedThisWeek, false);
  assert.equal(leaderboard[1].bestScoreThisWeek, 0);
});

test('calculateWeeklyTrends aggregates scores and accuracy chronologically', () => {
  const attempts: QuizAttempt[] = [
    {
      id: 'a1',
      playerId: 'p1',
      timestamp: '2026-11-01T10:00:00Z',
      weekKey: '2026-W44',
      totalScore: 300,
      correctCount: 2,
      totalQuestions: 5,
      totalTimeSeconds: 50,
      maxStreak: 1,
      answers: []
    },
    {
      id: 'a2',
      playerId: 'p1',
      timestamp: '2026-11-08T10:00:00Z',
      weekKey: '2026-W45',
      totalScore: 500,
      correctCount: 4,
      totalQuestions: 5,
      totalTimeSeconds: 40,
      maxStreak: 3,
      answers: []
    }
  ];

  const trends = calculateWeeklyTrends(attempts);
  assert.equal(trends.length, 2);
  assert.equal(trends[0].weekKey, '2026-W44');
  assert.equal(trends[0].averageScore, 300);
  assert.equal(trends[0].averageAccuracy, 40);
  assert.equal(trends[1].weekKey, '2026-W45');
  assert.equal(trends[1].averageScore, 500);
  assert.equal(trends[1].averageAccuracy, 80);
});

