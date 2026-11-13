import { Player, Question, QuizAttempt } from '../types/basketball';
import { getWeekKey } from '../utils/quizEngine';

export const INITIAL_ROSTER: Player[] = [
  { id: 'p1', name: 'Marcus Cole', avatarColor: '#171717', isCaptain: true },
  { id: 'p2', name: 'Jaylen Brooks', avatarColor: '#171717' },
  { id: 'p3', name: 'Devon Hayes', avatarColor: '#171717' },
  { id: 'p4', name: 'Zion Washington', avatarColor: '#171717' },
  { id: 'p5', name: 'Tariq Miller', avatarColor: '#171717', isCaptain: true },
  { id: 'p6', name: 'Austin Reed', avatarColor: '#171717' },
  { id: 'p7', name: 'Malik Turner', avatarColor: '#171717' },
  { id: 'p8', name: 'Kobe Daniels', avatarColor: '#171717' }
];

export const INITIAL_QUESTIONS: Question[] = [
  {
    id: 'q-pnr-drop',
    title: 'Pick & Roll gegen Drop Coverage: Aufbauspieler (1) kommt über den hohen Block von 5...',
    scenario: 'Pick & Roll gegen Drop Coverage: Aufbauspieler (1) kommt über den hohen Block von 5, während der gegnerische Center tief in der Zone absinkt (Drop). Was ist die beste Option?',
    keyConcept: 'Drop Coverage',
    isPriorityFocus: true,
    tags: ['Pick & Roll', 'Offense'],
    explanation: '',
    options: [
      {
        id: 'opt-pnr-1',
        text: 'In die Lücke vor der Zone dribbeln für einen freien Pull-up oder Floater',
        isCorrect: true
      },
      {
        id: 'opt-pnr-2',
        text: 'Einen riskanten Lob-Pass über die Verteidigung erzwingen',
        isCorrect: false
      },
      {
        id: 'opt-pnr-3',
        text: 'Bis zur Mittellinie zurückweichen und neu aufbauen',
        isCorrect: false
      },
      {
        id: 'opt-pnr-4',
        text: 'Direkt in die besetzte starke Ecke dribbeln',
        isCorrect: false
      }
    ],
    createdAt: '2026-10-15T08:00:00Z'
  },
  {
    id: 'q-spacing-baseline',
    title: 'Baseline-Drive: Spieler 1 zieht aggressiv über die rechte Grundlinie zum Korb...',
    scenario: 'Baseline-Drive: Spieler 1 zieht aggressiv über die rechte Grundlinie zum Korb. Wie verhalten sich der Weakside-Flügel (3) und der Big Man (4)?',
    keyConcept: 'Baseline-Spacing',
    isPriorityFocus: true,
    tags: ['Spacing', 'Offense'],
    explanation: '',
    options: [
      {
        id: 'opt-diag-1',
        text: '3 driftet in die Weakside-Ecke für den Dreier, 4 bleibt im Dunker-Spot',
        isCorrect: true
      },
      {
        id: 'opt-diag-2',
        text: '3 und 4 schneiden gleichzeitig mitten in die Zone',
        isCorrect: false
      },
      {
        id: 'opt-diag-3',
        text: '3 läuft bis zur Mittellinie zurück, 4 steht hinter dem Ballführer',
        isCorrect: false
      }
    ],
    createdAt: '2026-10-18T10:30:00Z'
  },
  {
    id: 'q-zone-23',
    title: '2-3-Zone: Der Ball wird auf den rechten Flügel gepasst. Wohin bewegt sich Spieler 4?',
    scenario: '2-3-Zone: Der Ball wird auf den rechten Flügel gepasst. Wohin bewegt sich Spieler 4, um die Zone zu öffnen?',
    keyConcept: 'High Post Flash',
    isPriorityFocus: false,
    tags: ['Zonenoffense', 'Offense'],
    explanation: '',
    options: [
      {
        id: 'opt-zone-1',
        text: 'Aktiv zum High Post (Freiwurflinie / Nail) schneiden',
        isCorrect: true
      },
      {
        id: 'opt-zone-2',
        text: 'Direkt hinter dem Center im Halbkreis unter dem Korb warten',
        isCorrect: false
      },
      {
        id: 'opt-zone-3',
        text: 'Weit hinter der Dreierlinie stehen bleiben',
        isCorrect: false
      },
      {
        id: 'opt-zone-4',
        text: 'Einen Ballscreen auf den Flügelspieler stellen',
        isCorrect: false
      }
    ],
    createdAt: '2026-10-20T14:15:00Z'
  },
  {
    id: 'q-blob-box',
    title: 'Einwurf unter dem Korb (Box): Noch 2,8 Sekunden auf der Wurfuhr...',
    scenario: 'Einwurf unter dem Korb (Box-Aufstellung): Noch 2,8 Sekunden auf der Wurfuhr. Welchen Laufweg nimmt unser Schütze (2)?',
    keyConcept: 'Elevator Screen',
    isPriorityFocus: true,
    tags: ['Einwurf (BLOB)', 'Systeme'],
    explanation: '',
    options: [
      {
        id: 'opt-blob-1',
        text: 'Sprint zwischen 4 und 5 hindurch, während beide die Tür schließen (Elevator)',
        isCorrect: true
      },
      {
        id: 'opt-blob-2',
        text: 'Unter dem Korb auf den gegenüberliegenden Block schneiden',
        isCorrect: false
      },
      {
        id: 'opt-blob-3',
        text: 'Ruhig in der nahen Ecke stehen bleiben',
        isCorrect: false
      },
      {
        id: 'opt-blob-4',
        text: 'Direkt zur Mittellinie sprinten',
        isCorrect: false
      }
    ],
    createdAt: '2026-10-22T11:00:00Z'
  },
  {
    id: 'q-def-nail',
    title: 'Help-Defense: Der gegnerische Guard zieht Richtung Freiwurflinie...',
    scenario: 'Help-Defense: Der gegnerische Guard zieht zum rechten Elbow. Du verteidigst einen Pass entfernt (Help-Position). Wie hilfst du?',
    keyConcept: 'Stunt & Recover',
    isPriorityFocus: true,
    tags: ['Defense', 'Rotationen'],
    explanation: '',
    options: [
      {
        id: 'opt-def-1',
        text: 'Kurzer aggressiver Stunt in den Drive-Weg und sofortiger Recover zum eigenen Schützen',
        isCorrect: true
      },
      {
        id: 'opt-def-2',
        text: 'Deinen Gegenspieler komplett verlassen und am Korb doppeln',
        isCorrect: false
      },
      {
        id: 'opt-def-3',
        text: 'Eng am eigenen Mann bleiben mit dem Rücken zum Ball',
        isCorrect: false
      },
      {
        id: 'opt-def-4',
        text: 'Ohne Kommunikation auf den Ballführer switchen',
        isCorrect: false
      }
    ],
    createdAt: '2026-10-24T16:20:00Z'
  },
  {
    id: 'q-def-xout',
    title: 'Baseline-Rotation (X-Out): Der Angreifer schlägt seinen Verteidiger über die Grundlinie...',
    scenario: 'Baseline-Rotation (X-Out): Der Angreifer schlägt seinen Verteidiger über die Grundlinie und unser Center hilft aus. Welche Aufgabe hat der oberste Weakside-Verteidiger?',
    keyConcept: 'X-Out Closeout',
    isPriorityFocus: false,
    tags: ['Defense', 'Rotationen'],
    explanation: '',
    options: [
      {
        id: 'opt-xout-1',
        text: 'Diagonal sprinten und den freien Schützen in der Weakside-Ecke schließen (Closeout)',
        isCorrect: true
      },
      {
        id: 'opt-xout-2',
        text: 'Oben an der Dreierlinie stehen bleiben',
        isCorrect: false
      },
      {
        id: 'opt-xout-3',
        text: 'In die Zone unter den Korb absinken',
        isCorrect: false
      },
      {
        id: 'opt-xout-4',
        text: 'Von hinten dem Ballführer nachlaufen',
        isCorrect: false
      }
    ],
    createdAt: '2026-10-28T15:45:00Z'
  }
];

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const wk0 = getWeekKey(daysAgoIso(0));
const wk1 = getWeekKey(daysAgoIso(7));
const wk2 = getWeekKey(daysAgoIso(14));

export const INITIAL_ATTEMPTS: QuizAttempt[] = [
  // Current Week
  {
    id: 'att-101',
    playerId: 'p1',
    timestamp: daysAgoIso(1),
    weekKey: wk0,
    totalScore: 580,
    correctCount: 4,
    totalQuestions: 5,
    totalTimeSeconds: 48,
    maxStreak: 4,
    answers: [
      { questionId: 'q-pnr-drop', selectedOptionId: 'opt-pnr-1', isCorrect: true, timeSpentSeconds: 8, pointsEarned: 135 },
      { questionId: 'q-diagram-options-spacing', selectedOptionId: 'opt-diag-1', isCorrect: true, timeSpentSeconds: 10, pointsEarned: 140 },
      { questionId: 'q-zone-23', selectedOptionId: 'opt-zone-1', isCorrect: true, timeSpentSeconds: 9, pointsEarned: 155 },
      { questionId: 'q-blob-box', selectedOptionId: 'opt-blob-1', isCorrect: true, timeSpentSeconds: 11, pointsEarned: 150 },
      { questionId: 'q-def-nail', selectedOptionId: 'opt-def-2', isCorrect: false, timeSpentSeconds: 10, pointsEarned: 0 }
    ]
  },
  {
    id: 'att-102',
    playerId: 'p2',
    timestamp: daysAgoIso(0),
    weekKey: wk0,
    totalScore: 640,
    correctCount: 5,
    totalQuestions: 5,
    totalTimeSeconds: 40,
    maxStreak: 5,
    answers: [
      { questionId: 'q-pnr-drop', selectedOptionId: 'opt-pnr-1', isCorrect: true, timeSpentSeconds: 7, pointsEarned: 140 },
      { questionId: 'q-diagram-options-spacing', selectedOptionId: 'opt-diag-1', isCorrect: true, timeSpentSeconds: 8, pointsEarned: 145 },
      { questionId: 'q-blob-box', selectedOptionId: 'opt-blob-1', isCorrect: true, timeSpentSeconds: 9, pointsEarned: 160 },
      { questionId: 'q-def-nail', selectedOptionId: 'opt-def-1', isCorrect: true, timeSpentSeconds: 8, pointsEarned: 165 },
      { questionId: 'q-def-xout', selectedOptionId: 'opt-xout-1', isCorrect: true, timeSpentSeconds: 8, pointsEarned: 130 }
    ]
  },
  {
    id: 'att-103',
    playerId: 'p3',
    timestamp: daysAgoIso(1),
    weekKey: wk0,
    totalScore: 410,
    correctCount: 3,
    totalQuestions: 5,
    totalTimeSeconds: 58,
    maxStreak: 2,
    answers: [
      { questionId: 'q-pnr-drop', selectedOptionId: 'opt-pnr-1', isCorrect: true, timeSpentSeconds: 12, pointsEarned: 125 },
      { questionId: 'q-def-xout', selectedOptionId: 'opt-xout-2', isCorrect: false, timeSpentSeconds: 11, pointsEarned: 0 },
      { questionId: 'q-def-nail', selectedOptionId: 'opt-def-3', isCorrect: false, timeSpentSeconds: 15, pointsEarned: 0 },
      { questionId: 'q-diagram-options-spacing', selectedOptionId: 'opt-diag-1', isCorrect: true, timeSpentSeconds: 10, pointsEarned: 130 },
      { questionId: 'q-zone-23', selectedOptionId: 'opt-zone-1', isCorrect: true, timeSpentSeconds: 10, pointsEarned: 155 }
    ]
  },
  {
    id: 'att-104',
    playerId: 'p5',
    timestamp: daysAgoIso(0),
    weekKey: wk0,
    totalScore: 510,
    correctCount: 4,
    totalQuestions: 5,
    totalTimeSeconds: 50,
    maxStreak: 3,
    answers: [
      { questionId: 'q-diagram-options-spacing', selectedOptionId: 'opt-diag-1', isCorrect: true, timeSpentSeconds: 10, pointsEarned: 130 },
      { questionId: 'q-blob-box', selectedOptionId: 'opt-blob-1', isCorrect: true, timeSpentSeconds: 11, pointsEarned: 135 },
      { questionId: 'q-def-nail', selectedOptionId: 'opt-def-2', isCorrect: false, timeSpentSeconds: 14, pointsEarned: 0 },
      { questionId: 'q-pnr-drop', selectedOptionId: 'opt-pnr-1', isCorrect: true, timeSpentSeconds: 9, pointsEarned: 120 },
      { questionId: 'q-zone-23', selectedOptionId: 'opt-zone-1', isCorrect: true, timeSpentSeconds: 6, pointsEarned: 125 }
    ]
  },

  // 1 Week Ago
  {
    id: 'att-201',
    playerId: 'p1',
    timestamp: daysAgoIso(7),
    weekKey: wk1,
    totalScore: 440,
    correctCount: 3,
    totalQuestions: 5,
    totalTimeSeconds: 62,
    maxStreak: 2,
    answers: [
      { questionId: 'q-pnr-drop', selectedOptionId: 'opt-pnr-1', isCorrect: true, timeSpentSeconds: 12, pointsEarned: 125 },
      { questionId: 'q-def-nail', selectedOptionId: 'opt-def-2', isCorrect: false, timeSpentSeconds: 14, pointsEarned: 0 },
      { questionId: 'q-def-xout', selectedOptionId: 'opt-xout-2', isCorrect: false, timeSpentSeconds: 12, pointsEarned: 0 },
      { questionId: 'q-zone-23', selectedOptionId: 'opt-zone-1', isCorrect: true, timeSpentSeconds: 12, pointsEarned: 155 },
      { questionId: 'q-blob-box', selectedOptionId: 'opt-blob-1', isCorrect: true, timeSpentSeconds: 12, pointsEarned: 160 }
    ]
  },
  {
    id: 'att-202',
    playerId: 'p2',
    timestamp: daysAgoIso(8),
    weekKey: wk1,
    totalScore: 530,
    correctCount: 4,
    totalQuestions: 5,
    totalTimeSeconds: 49,
    maxStreak: 3,
    answers: [
      { questionId: 'q-pnr-drop', selectedOptionId: 'opt-pnr-1', isCorrect: true, timeSpentSeconds: 10, pointsEarned: 130 },
      { questionId: 'q-def-nail', selectedOptionId: 'opt-def-1', isCorrect: true, timeSpentSeconds: 10, pointsEarned: 135 },
      { questionId: 'q-def-xout', selectedOptionId: 'opt-xout-2', isCorrect: false, timeSpentSeconds: 11, pointsEarned: 0 },
      { questionId: 'q-zone-23', selectedOptionId: 'opt-zone-1', isCorrect: true, timeSpentSeconds: 9, pointsEarned: 135 },
      { questionId: 'q-blob-box', selectedOptionId: 'opt-blob-1', isCorrect: true, timeSpentSeconds: 9, pointsEarned: 130 }
    ]
  },
  {
    id: 'att-203',
    playerId: 'p3',
    timestamp: daysAgoIso(7),
    weekKey: wk1,
    totalScore: 340,
    correctCount: 2,
    totalQuestions: 5,
    totalTimeSeconds: 68,
    maxStreak: 1,
    answers: []
  },

  // 2 Weeks Ago
  {
    id: 'att-301',
    playerId: 'p1',
    timestamp: daysAgoIso(14),
    weekKey: wk2,
    totalScore: 360,
    correctCount: 2,
    totalQuestions: 5,
    totalTimeSeconds: 70,
    maxStreak: 2,
    answers: []
  },
  {
    id: 'att-302',
    playerId: 'p2',
    timestamp: daysAgoIso(14),
    weekKey: wk2,
    totalScore: 410,
    correctCount: 3,
    totalQuestions: 5,
    totalTimeSeconds: 60,
    maxStreak: 2,
    answers: []
  }
];

export const ALL_TAGS = [
  'Pick & Roll',
  'Zonenoffense',
  'Einwurf (BLOB)',
  'Defense',
  'Rotationen',
  'Spacing',
  'Offense',
  'Systeme'
];
