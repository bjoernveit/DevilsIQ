import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Player,
  Question,
  QuizAttempt,
  QuizConfig,
  UserRole
} from '../types/basketball';
import { INITIAL_QUESTIONS, ALL_TAGS } from '../data/initialData';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Cryptic registration URL helpers
export const REGISTRATION_TOKEN = 'k8m3x9p2';

export function isRegistrationRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('register') === REGISTRATION_TOKEN) return true;
  if (window.location.hash.includes(`register/${REGISTRATION_TOKEN}`)) return true;
  if (window.location.pathname.includes(`register-${REGISTRATION_TOKEN}`)) return true;
  return false;
}

export function getRegistrationUrl(): string {
  if (typeof window === 'undefined') return `/?register=${REGISTRATION_TOKEN}`;
  return `${window.location.origin}/?register=${REGISTRATION_TOKEN}`;
}

// Username <-> Internal Email mapping (no email UI required)
export const USERNAME_REGEX = /^[a-z0-9_.-]{3,32}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const normalized = normalizeUsername(raw);
  if (!USERNAME_REGEX.test(normalized)) {
    return 'Benutzername muss 3–32 Zeichen lang sein (Kleinbuchstaben, Zahlen, _, ., -)';
  }
  return null;
}

export function usernameToInternalEmail(username: string): string {
  return `${normalizeUsername(username)}@hoopiq.local`;
}

// Recursive strip of undefined properties (Firestore rejects undefined values)
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        result[key] = stripUndefined(val);
      }
    }
    return result as T;
  }
  return value;
}

export function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
}

export const DEFAULT_QUIZ_CONFIG: QuizConfig = {
  questionCount: 5,
  timePerQuestionSeconds: 24,
  prioritizeFocusQuestions: true,
  ensureDiverseTopics: true
};

// Auth actions
export async function loginWithUsername(username: string, password: string): Promise<User> {
  const email = usernameToInternalEmail(username);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Registers a new user with username & password only.
 * If this is the very first account (team_meta/bootstrap does not exist),
 * atomically bootstraps the user as the team Coach and seeds the starter playbook.
 */
export async function registerWithUsername(username: string, password: string): Promise<User> {
  const normalized = normalizeUsername(username);
  const email = usernameToInternalEmail(normalized);
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  await ensureUserProfileExists(user, normalized);
  return user;
}

/**
 * Creates a Firestore profile for an authenticated user if missing.
 * First account ever created becomes Coach atomically via team_meta/bootstrap.
 */
export async function ensureUserProfileExists(user: User, preferredUsername?: string): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
  }

  if (existingSnap.exists()) return;

  const fallbackName = (user.email ? user.email.split('@')[0] : 'spieler')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 32);
  const username = normalizeUsername(preferredUsername || fallbackName || `spieler_${user.uid.slice(0, 6)}`);
  const safeUsername = USERNAME_REGEX.test(username)
    ? username
    : `u_${user.uid.slice(0, 10).toLowerCase()}`;

  const bootstrapRef = doc(db, 'team_meta', 'bootstrap');
  let bootstrapSnap;
  try {
    bootstrapSnap = await getDoc(bootstrapRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'team_meta/bootstrap');
  }

  const isFirstAccount = !bootstrapSnap.exists();
  const batch = writeBatch(db);

  if (isFirstAccount) {
    batch.set(bootstrapRef, {
      coachUid: user.uid,
      createdAt: serverTimestamp()
    });
    batch.set(doc(db, 'coaches', user.uid), {
      uid: user.uid,
      username: safeUsername,
      createdAt: serverTimestamp()
    });
    batch.set(userRef, {
      uid: user.uid,
      username: safeUsername,
      displayName: safeUsername.slice(0, 64),
      role: 'coach',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } else {
    batch.set(userRef, {
      uid: user.uid,
      username: safeUsername,
      displayName: safeUsername.slice(0, 64),
      role: 'player',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }

  // If this user is the initial Coach, seed starter playbook questions & quiz config
  if (isFirstAccount) {
    await seedStarterPlaybook(user.uid);
  }
}

export async function seedStarterPlaybook(coachUid: string): Promise<void> {
  const batch = writeBatch(db);

  for (const q of INITIAL_QUESTIONS) {
    const qId = sanitizeId(q.id);
    const payload: Record<string, unknown> = {
      id: qId,
      title: q.title.slice(0, 160),
      scenario: q.scenario.slice(0, 1000),
      keyConcept: (q.keyConcept || q.title).slice(0, 160),
      isPriorityFocus: Boolean(q.isPriorityFocus),
      tags: (q.tags.length > 0 ? q.tags : ['Offense']).slice(0, 10),
      explanation: q.explanation.slice(0, 1000),
      options: stripUndefined(q.options.slice(0, 6)),
      createdBy: coachUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    if (q.diagram) payload.diagram = stripUndefined(q.diagram);
    if (q.imageUrl) payload.imageUrl = q.imageUrl.slice(0, 500000);
    batch.set(doc(db, 'questions', qId), payload);
  }

  batch.set(doc(db, 'team_meta', 'quiz_config'), {
    questionCount: DEFAULT_QUIZ_CONFIG.questionCount,
    timePerQuestionSeconds: DEFAULT_QUIZ_CONFIG.timePerQuestionSeconds,
    prioritizeFocusQuestions: DEFAULT_QUIZ_CONFIG.prioritizeFocusQuestions,
    ensureDiverseTopics: DEFAULT_QUIZ_CONFIG.ensureDiverseTopics,
    topicLabels: ALL_TAGS,
    updatedAt: serverTimestamp()
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'questions');
  }
}

export async function updateUserProfileInFirestore(
  uid: string,
  updates: { displayName: string }
): Promise<void> {
  const path = `users/${uid}`;
  const cleanName = updates.displayName.trim().slice(0, 64) || 'Spieler';

  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: cleanName,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setUserRoleInFirestore(
  targetPlayer: Player,
  nextRole: UserRole
): Promise<void> {
  const batch = writeBatch(db);
  const userRef = doc(db, 'users', targetPlayer.id);
  const coachRef = doc(db, 'coaches', targetPlayer.id);

  batch.update(userRef, {
    role: nextRole,
    updatedAt: serverTimestamp()
  });

  if (nextRole === 'coach') {
    const safeUsername = normalizeUsername(targetPlayer.username || targetPlayer.name || `user_${targetPlayer.id.slice(0, 6)}`).slice(0, 32);
    batch.set(coachRef, {
      uid: targetPlayer.id,
      username: safeUsername.length >= 3 ? safeUsername : `u_${targetPlayer.id.slice(0, 6)}`,
      createdAt: serverTimestamp()
    });
  } else {
    batch.delete(coachRef);
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${targetPlayer.id}`);
  }
}

export async function saveQuestionToFirestore(
  question: Question,
  isUpdate: boolean,
  coachUid: string
): Promise<void> {
  const qId = sanitizeId(question.id);
  const path = `questions/${qId}`;

  const cleanTags = question.tags
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 10);

  const cleanOptions = stripUndefined(question.options.slice(0, 6));

  if (isUpdate) {
    const updatePayload: Record<string, unknown> = {
      title: question.title.trim().slice(0, 160),
      scenario: question.scenario.trim().slice(0, 1000),
      keyConcept: (question.keyConcept || question.title).trim().slice(0, 160),
      isPriorityFocus: Boolean(question.isPriorityFocus),
      tags: cleanTags,
      explanation: question.explanation.trim().slice(0, 1000),
      options: cleanOptions,
      diagram: question.diagram ? stripUndefined(question.diagram) : deleteField(),
      imageUrl: question.imageUrl ? question.imageUrl.slice(0, 500000) : deleteField(),
      updatedAt: serverTimestamp()
    };

    try {
      await updateDoc(doc(db, 'questions', qId), updatePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    const createPayload: Record<string, unknown> = {
      id: qId,
      title: question.title.trim().slice(0, 160),
      scenario: question.scenario.trim().slice(0, 1000),
      keyConcept: (question.keyConcept || question.title).trim().slice(0, 160),
      isPriorityFocus: Boolean(question.isPriorityFocus),
      tags: cleanTags,
      explanation: question.explanation.trim().slice(0, 1000),
      options: cleanOptions,
      createdBy: coachUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    if (question.diagram) createPayload.diagram = stripUndefined(question.diagram);
    if (question.imageUrl) createPayload.imageUrl = question.imageUrl.slice(0, 500000);

    try {
      await setDoc(doc(db, 'questions', qId), createPayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function toggleQuestionPriorityInFirestore(
  questionId: string,
  nextValue: boolean
): Promise<void> {
  const qId = sanitizeId(questionId);
  const path = `questions/${qId}`;
  try {
    await updateDoc(doc(db, 'questions', qId), {
      isPriorityFocus: Boolean(nextValue),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteQuestionFromFirestore(questionId: string): Promise<void> {
  const qId = sanitizeId(questionId);
  const path = `questions/${qId}`;
  try {
    await deleteDoc(doc(db, 'questions', qId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveAttemptToFirestore(attempt: QuizAttempt): Promise<void> {
  const attemptId = sanitizeId(attempt.id);
  const path = `attempts/${attemptId}`;

  const payload = {
    id: attemptId,
    playerId: attempt.playerId,
    timestamp: attempt.timestamp.slice(0, 64),
    weekKey: attempt.weekKey.slice(0, 16),
    totalScore: Math.max(0, Math.min(10000, Math.round(attempt.totalScore))),
    correctCount: Math.max(0, Math.min(30, Math.round(attempt.correctCount))),
    totalQuestions: Math.max(1, Math.min(30, Math.round(attempt.totalQuestions))),
    totalTimeSeconds: Math.max(0, Math.min(3600, Math.round(attempt.totalTimeSeconds))),
    maxStreak: Math.max(0, Math.min(30, Math.round(attempt.maxStreak))),
    answers: stripUndefined(attempt.answers.slice(0, 30)),
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'attempts', attemptId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveQuizConfigToFirestore(config: QuizConfig): Promise<void> {
  const path = 'team_meta/quiz_config';
  const payload: Record<string, unknown> = {
    questionCount: Math.max(1, Math.min(25, Math.round(config.questionCount))),
    timePerQuestionSeconds: Math.max(5, Math.min(120, Math.round(config.timePerQuestionSeconds))),
    prioritizeFocusQuestions: Boolean(config.prioritizeFocusQuestions),
    ensureDiverseTopics: Boolean(config.ensureDiverseTopics),
    updatedAt: serverTimestamp()
  };

  if (config.selectedTags && config.selectedTags.length > 0) {
    payload.selectedTags = config.selectedTags.slice(0, 20);
  } else {
    payload.selectedTags = deleteField();
  }

  if (config.topicLabels !== undefined) {
    payload.topicLabels = config.topicLabels.slice(0, 30);
  }

  try {
    await setDoc(doc(db, 'team_meta', 'quiz_config'), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeTopicLabelFromFirestore(
  tagToRemove: string,
  currentLabels: string[],
  questions: Question[],
  currentConfig: QuizConfig
): Promise<void> {
  const nextLabels = currentLabels.filter(t => t !== tagToRemove).slice(0, 30);
  const nextSelected = currentConfig.selectedTags?.filter(t => t !== tagToRemove);

  const batch = writeBatch(db);
  const configRef = doc(db, 'team_meta', 'quiz_config');

  const configPayload: Record<string, unknown> = {
    questionCount: Math.max(1, Math.min(25, Math.round(currentConfig.questionCount))),
    timePerQuestionSeconds: Math.max(5, Math.min(120, Math.round(currentConfig.timePerQuestionSeconds))),
    prioritizeFocusQuestions: Boolean(currentConfig.prioritizeFocusQuestions),
    ensureDiverseTopics: Boolean(currentConfig.ensureDiverseTopics),
    topicLabels: nextLabels,
    updatedAt: serverTimestamp()
  };

  if (nextSelected && nextSelected.length > 0) {
    configPayload.selectedTags = nextSelected.slice(0, 20);
  } else {
    configPayload.selectedTags = deleteField();
  }

  batch.set(configRef, configPayload, { merge: true });

  for (const q of questions) {
    if (q.tags.includes(tagToRemove)) {
      const qId = sanitizeId(q.id);
      batch.update(doc(db, 'questions', qId), {
        tags: q.tags.filter(t => t !== tagToRemove).slice(0, 10),
        updatedAt: serverTimestamp()
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'team_meta/quiz_config');
  }
}
