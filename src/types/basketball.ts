export type UserRole = 'player' | 'coach';

export interface Player {
  id: string;
  name: string;
  username?: string;
  avatarColor: string;
  isCaptain?: boolean;
  role?: UserRole;
}

export type CourtEntityRole = '1' | '2' | '3' | '4' | '5' | 'x1' | 'x2' | 'x3' | 'x4' | 'x5' | 'ball';

export interface CourtEntity {
  id: string;
  role: CourtEntityRole;
  label: string;
  x: number; // 0 to 100% of half-court width
  y: number; // 0 to 100% of half-court height
  isOffense?: boolean;
  isBall?: boolean;
}

export interface CourtAnnotation {
  id: string;
  type: 'pass' | 'cut' | 'dribble' | 'screen';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label?: string;
}

export interface TacticalDiagram {
  courtType: 'half-court' | 'full-court';
  entities: CourtEntity[];
  annotations?: CourtAnnotation[];
  title?: string;
  notes?: string;
}

export interface QuizOption {
  id: string;
  text: string;
  diagram?: TacticalDiagram;
  imageUrl?: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface Question {
  id: string;
  title: string;
  scenario: string;
  diagram?: TacticalDiagram;
  imageUrl?: string;
  options: QuizOption[];
  tags: string[]; // e.g. ["Pick & Roll", "Offense"]
  teamIds?: string[]; // Empty or omitted = applies to all teams
  isPriorityFocus: boolean; // Coach flag for frequent rotation
  explanation: string; // Master tactical breakdown
  keyConcept: string; // E.g. "Weakside Tag", "Drop Coverage", "Backdoor Cut"
  createdAt: string;
}

export interface QuizAttemptAnswer {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  timeSpentSeconds: number;
  pointsEarned: number;
}

export interface QuizAttempt {
  id: string;
  playerId: string;
  teamId?: string;
  timestamp: string; // ISO string
  weekKey: string; // e.g. "2026-W45"
  totalScore: number;
  correctCount: number;
  totalQuestions: number;
  totalTimeSeconds: number;
  maxStreak: number;
  answers: QuizAttemptAnswer[];
  passed?: boolean;
}

export interface QuizConfig {
  questionCount: number;
  timePerQuestionSeconds: number;
  prioritizeFocusQuestions: boolean;
  ensureDiverseTopics: boolean;
  selectedTags?: string[];
  topicLabels?: string[];
}

export interface Team {
  id: string;
  name: string;
  playerIds: string[];
  questionCount: number;
  timePerQuestionSeconds: number;
  prioritizeFocusQuestions: boolean;
  ensureDiverseTopics: boolean;
  selectedTags?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TacticalGapReport {
  tag: string;
  totalAnswered: number;
  correctAnswered: number;
  accuracyPercentage: number;
  status: 'critical_gap' | 'needs_work' | 'solid' | 'mastered';
  sampleQuestionIds: string[];
}
