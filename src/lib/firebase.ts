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
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteField,
  writeBatch,
  runTransaction,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Player,
  Question,
  QuizAttempt,
  QuizConfig,
  Team,
  UserRole,
  UserStats,
  UserDetails
} from '../types/basketball';
import { INITIAL_QUESTIONS, ALL_TAGS } from '../data/initialData';
import {
  buildUserStatsFromAttempts,
  buildUserDetailsFromAttempts,
  calculateCompletedWeekMedals,
  getPreviousWeekKey,
  getWeekKey
} from '../utils/quizEngine';
import {
  QuestionsCacheCursor,
  compareCursors,
  getQuestionsCacheKey,
  readQuestionsCache
} from '../utils/questionCache';
import {
  getUserStatsCacheKey,
  getUserDetailsCacheKey,
  readAggregatesCache
} from '../utils/aggregatesCache';

const envMeasurementId =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_GA_MEASUREMENT_ID
    ? String(import.meta.env.VITE_GA_MEASUREMENT_ID).trim()
    : '';
const resolvedFirebaseConfig = envMeasurementId
  ? { ...firebaseConfig, measurementId: envMeasurementId }
  : firebaseConfig;

export const app = initializeApp(resolvedFirebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const QUESTIONS_CACHE_KEY = getQuestionsCacheKey(
  firebaseConfig.projectId,
  firebaseConfig.firestoreDatabaseId
);
export const USER_STATS_CACHE_KEY = getUserStatsCacheKey(
  firebaseConfig.projectId,
  firebaseConfig.firestoreDatabaseId
);
export const USER_DETAILS_CACHE_KEY = getUserDetailsCacheKey(
  firebaseConfig.projectId,
  firebaseConfig.firestoreDatabaseId
);

// Document read telemetry tracking for admins
let documentReadCount = 0;
const readListeners = new Set<(count: number) => void>();

export function getDocumentReadCount(): number {
  return documentReadCount;
}

export function subscribeToReadCount(cb: (count: number) => void): () => void {
  readListeners.add(cb);
  return () => readListeners.delete(cb);
}

export function recordReads(count: number) {
  documentReadCount += count;
  readListeners.forEach(cb => cb(documentReadCount));
}

export async function trackedGetDoc<T>(docRef: any): Promise<any> {
  const snap = await getDoc(docRef);
  recordReads(snap.exists() ? 1 : 0);
  return snap;
}

export async function trackedGetDocs<T>(queryRef: any): Promise<any> {
  const snap = await getDocs(queryRef);
  recordReads(snap.size);
  return snap;
}

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
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  if (typeof window === 'undefined') return `${normalizedBase}?register=${REGISTRATION_TOKEN}`;
  return `${window.location.origin}${normalizedBase}?register=${REGISTRATION_TOKEN}`;
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

export class AccountDeletedError extends Error {
  constructor() {
    super('Dieses Konto wurde vom Trainer gelöscht.');
    this.name = 'AccountDeletedError';
  }
}

const inFlightProfileEnsures = new Map<string, Promise<void>>();

async function addPlayerToDefaultTeam(
  uid: string,
  options: { onlyIfUnassigned?: boolean } = {}
): Promise<void> {
  try {
    const teamsQuery = query(
      collection(db, 'teams'),
      where('questionCount', '>=', 1)
    );
    const snapshot = await trackedGetDocs(teamsQuery);
    if (snapshot.empty) return;

    if (options.onlyIfUnassigned) {
      const alreadyAssigned = snapshot.docs.some((d: any) => {
        const ids = d.data().playerIds;
        return Array.isArray(ids) && ids.map(String).includes(uid);
      });
      if (alreadyAssigned) return;
    }

    const defaultTeamDocs = snapshot.docs.filter((d: any) => d.data().isDefault === true);
    if (defaultTeamDocs.length === 0) return;

    for (const teamDoc of defaultTeamDocs) {
      await runTransaction(db, async transaction => {
        const freshSnap = await transaction.get(teamDoc.ref);
        if (!freshSnap.exists()) return;
        const data = freshSnap.data() as any;
        if (data.isDefault !== true) return;
        const existingIds: string[] = Array.isArray(data.playerIds)
          ? data.playerIds.map(String)
          : [];
        if (existingIds.includes(uid) || existingIds.length >= 250) return;

        transaction.update(teamDoc.ref, {
          playerIds: [...existingIds, uid],
          updatedAt: serverTimestamp()
        });
      });
    }
  } catch (error) {
    // Log without blocking user signup/login if no default team permissions apply
    console.warn('Could not auto-assign default team:', error);
  }
}

/**
 * Creates a Firestore profile for an authenticated user if missing.
 * First account ever created becomes Coach atomically via team_meta/bootstrap.
 * Subsequent newly registered players (and existing unassigned players) are automatically added to the default team (if configured).
 */
export async function ensureUserProfileExists(user: User, preferredUsername?: string): Promise<void> {
  const existingPromise = inFlightProfileEnsures.get(user.uid);
  if (existingPromise) {
    return existingPromise;
  }

  const run = (async () => {
    const deletedRef = doc(db, 'deleted_users', user.uid);
    let deletedSnap;
    try {
      deletedSnap = await trackedGetDoc(deletedRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `deleted_users/${user.uid}`);
    }

    if (deletedSnap.exists()) {
      await firebaseSignOut(auth);
      throw new AccountDeletedError();
    }

    const userRef = doc(db, 'users', user.uid);
    let existingSnap;
    try {
      existingSnap = await trackedGetDoc(userRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    }

    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      if (existingData.role !== 'coach') {
        await addPlayerToDefaultTeam(user.uid, { onlyIfUnassigned: true });
      }
      return;
    }

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
      bootstrapSnap = await trackedGetDoc(bootstrapRef);
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
        isAdmin: true,
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

    if (isFirstAccount) {
      await seedStarterPlaybook(user.uid);
    } else {
      await addPlayerToDefaultTeam(user.uid);
    }
  })();

  inFlightProfileEnsures.set(user.uid, run);
  try {
    await run;
  } finally {
    inFlightProfileEnsures.delete(user.uid);
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

export async function markRoundStartedInFirestore(uid: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      lastRoundStartedAt: serverTimestamp(),
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

export async function fetchAttemptsForPlayer(playerId: string): Promise<QuizAttempt[]> {
  const cleanId = sanitizeId(playerId);
  if (!cleanId) return [];
  try {
    const attemptsQuery = query(collection(db, 'attempts'), where('playerId', '==', cleanId));
    const snapshot = await trackedGetDocs(attemptsQuery);
    return snapshot.docs.map((docSnap: any) => {
      const data = docSnap.data() as any;
      return {
        id: docSnap.id,
        playerId: String(data.playerId || cleanId),
        teamId: data.teamId ? String(data.teamId) : undefined,
        totalScore: Number(data.totalScore) || 0,
        totalQuestions: Number(data.totalQuestions) || 1,
        correctCount: Number(data.correctCount) || 0,
        totalTimeSeconds: Number(data.totalTimeSeconds) || 0,
        maxStreak: Number(data.maxStreak) || 0,
        passed: typeof data.passed === 'boolean' ? data.passed : undefined,
        weekKey: String(data.weekKey || ''),
        timestamp: String(data.timestamp || toIsoString(data.createdAt)),
        answers: Array.isArray(data.answers) ? data.answers : []
      } as QuizAttempt;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'attempts');
    return [];
  }
}

function extractMaxUpdatedAtCursor(
  docs: any[],
  baseCursor: QuestionsCacheCursor | null
): QuestionsCacheCursor | null {
  let maxCursor = baseCursor;
  const MIN_VALID_SECONDS = 946684800; // 2000-01-01T00:00:00Z

  for (const docSnap of docs) {
    const rawUpdated = docSnap.data()?.updatedAt;
    if (rawUpdated instanceof Timestamp && rawUpdated.seconds >= MIN_VALID_SECONDS) {
      const candidate: QuestionsCacheCursor = {
        seconds: rawUpdated.seconds,
        nanoseconds: rawUpdated.nanoseconds
      };
      if (!maxCursor || compareCursors(candidate, maxCursor) > 0) {
        maxCursor = candidate;
      }
    }
  }

  return maxCursor;
}

export interface AggregatesSyncResult<T> {
  isDelta: boolean;
  cachedEntries: T[];
  fetchedEntries: T[];
  nextCursor: QuestionsCacheCursor | null;
}

function mapUserStatsDoc(id: string, d: any): UserStats {
  return {
    userId: id,
    currentStreak: Number(d.currentStreak || 0),
    bestStreak: Number(d.bestStreak || 0),
    totalAttemptsAllTime: Number(d.totalAttemptsAllTime || 0),
    attemptsThisWeek: typeof d.attemptsThisWeek === 'number' ? Number(d.attemptsThisWeek) : undefined,
    currentWeekKey: typeof d.currentWeekKey === 'string' ? d.currentWeekKey : undefined,
    bestScoreThisWeek: Number(d.bestScoreThisWeek || 0),
    bestScoreAllTime: typeof d.bestScoreAllTime === 'number' ? Number(d.bestScoreAllTime) : undefined,
    pastGold: typeof d.pastGold === 'number' ? Number(d.pastGold) : undefined,
    pastSilver: typeof d.pastSilver === 'number' ? Number(d.pastSilver) : undefined,
    pastBronze: typeof d.pastBronze === 'number' ? Number(d.pastBronze) : undefined,
    medalsThroughWeek: typeof d.medalsThroughWeek === 'string' ? d.medalsThroughWeek : undefined,
    updatedAt: d.updatedAt ? toIsoString(d.updatedAt) : undefined
  };
}

export async function fetchUserStatsDeltaOrCold(): Promise<AggregatesSyncResult<UserStats>> {
  const cached = readAggregatesCache<UserStats>(USER_STATS_CACHE_KEY);
  try {
    if (cached && cached.lastSyncedCursor && cached.entries.length > 0) {
      const cursorTs = new Timestamp(
        cached.lastSyncedCursor.seconds,
        cached.lastSyncedCursor.nanoseconds
      );
      const deltaQuery = query(collection(db, 'user_stats'), where('updatedAt', '>', cursorTs));
      const snap = await trackedGetDocs(deltaQuery);
      const fetchedEntries = snap.docs.map((docSnap: any) =>
        mapUserStatsDoc(docSnap.id, docSnap.data())
      );
      return {
        isDelta: true,
        cachedEntries: cached.entries,
        fetchedEntries,
        nextCursor: extractMaxUpdatedAtCursor(snap.docs, cached.lastSyncedCursor)
      };
    }

    const coldQuery = query(
      collection(db, 'user_stats'),
      where('totalAttemptsAllTime', '>=', 0)
    );
    const snap = await trackedGetDocs(coldQuery);
    const fetchedEntries = snap.docs.map((docSnap: any) =>
      mapUserStatsDoc(docSnap.id, docSnap.data())
    );
    return {
      isDelta: false,
      cachedEntries: [],
      fetchedEntries,
      nextCursor: extractMaxUpdatedAtCursor(snap.docs, null)
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'user_stats');
    return {
      isDelta: Boolean(cached?.lastSyncedCursor),
      cachedEntries: cached?.entries || [],
      fetchedEntries: [],
      nextCursor: cached?.lastSyncedCursor || null
    };
  }
}

function mapUserDetailsDoc(id: string, data: any): UserDetails {
  return {
    userId: String(data.userId || id),
    totalAttempts: Number(data.totalAttempts || 0),
    passedAttempts: Number(data.passedAttempts || 0),
    bestTimeAllTime: Number(data.bestTimeAllTime || 0),
    averagePassedTime: Number(data.averagePassedTime || 0),
    overallAvgQuestionTime: Number(data.overallAvgQuestionTime || 0),
    currentStreak: Number(data.currentStreak || 0),
    bestStreak: Number(data.bestStreak || 0),
    currentWeekKey: String(data.currentWeekKey || ''),
    thisWeekPassed: Boolean(data.thisWeekPassed),
    weeklyTrends: Array.isArray(data.weeklyTrends) ? data.weeklyTrends : [],
    questionStats: Array.isArray(data.questionStats) ? data.questionStats : [],
    recentAttempts: Array.isArray(data.recentAttempts) ? data.recentAttempts : [],
    updatedAt: data.updatedAt ? toIsoString(data.updatedAt) : undefined
  };
}

export async function fetchUserDetails(playerId: string): Promise<UserDetails | null> {
  const cleanId = sanitizeId(playerId);
  if (!cleanId) return null;
  try {
    const snap = await trackedGetDoc(doc(db, 'user_details', cleanId));
    if (!snap.exists()) return null;
    return mapUserDetailsDoc(cleanId, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `user_details/${cleanId}`);
    return null;
  }
}

export async function fetchAllUserDetailsDeltaOrCold(): Promise<AggregatesSyncResult<UserDetails>> {
  const cached = readAggregatesCache<UserDetails>(USER_DETAILS_CACHE_KEY);
  try {
    if (cached && cached.lastSyncedCursor && cached.entries.length > 0) {
      const cursorTs = new Timestamp(
        cached.lastSyncedCursor.seconds,
        cached.lastSyncedCursor.nanoseconds
      );
      const deltaQuery = query(collection(db, 'user_details'), where('updatedAt', '>', cursorTs));
      const snap = await trackedGetDocs(deltaQuery);
      const fetchedEntries = snap.docs.map((docSnap: any) =>
        mapUserDetailsDoc(docSnap.id, docSnap.data())
      );
      return {
        isDelta: true,
        cachedEntries: cached.entries,
        fetchedEntries,
        nextCursor: extractMaxUpdatedAtCursor(snap.docs, cached.lastSyncedCursor)
      };
    }

    const coldQuery = query(collection(db, 'user_details'), where('totalAttempts', '>=', 0));
    const snap = await trackedGetDocs(coldQuery);
    const fetchedEntries = snap.docs.map((docSnap: any) =>
      mapUserDetailsDoc(docSnap.id, docSnap.data())
    );
    return {
      isDelta: false,
      cachedEntries: [],
      fetchedEntries,
      nextCursor: extractMaxUpdatedAtCursor(snap.docs, null)
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'user_details');
    return {
      isDelta: Boolean(cached?.lastSyncedCursor),
      cachedEntries: cached?.entries || [],
      fetchedEntries: [],
      nextCursor: cached?.lastSyncedCursor || null
    };
  }
}

export async function deletePlayerFromFirestore(
  targetPlayer: Player,
  knownAttempts: QuizAttempt[],
  coachUid: string,
  teams: Team[] = []
): Promise<void> {
  const targetUid = sanitizeId(targetPlayer.id);
  if (!targetUid || targetUid === coachUid) {
    throw new Error('Das eigene Trainer-Konto kann nicht gelöscht werden.');
  }

  let queriedAttemptIds: string[] = [];
  try {
    const attemptsQuery = query(collection(db, 'attempts'), where('playerId', '==', targetPlayer.id));
    const snapshot = await trackedGetDocs(attemptsQuery);
    queriedAttemptIds = snapshot.docs.map((d: any) => sanitizeId(d.id)).filter(Boolean);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'attempts');
  }

  const localAttemptIds = knownAttempts
    .filter(a => a.playerId === targetPlayer.id)
    .map(a => sanitizeId(a.id))
    .filter(Boolean);

  const attemptIdsToDelete = Array.from(new Set([...queriedAttemptIds, ...localAttemptIds]));

  const primaryBatch = writeBatch(db);
  primaryBatch.set(doc(db, 'deleted_users', targetUid), {
    uid: targetUid,
    deletedBy: coachUid,
    deletedAt: serverTimestamp()
  });
  primaryBatch.delete(doc(db, 'users', targetUid));
  primaryBatch.delete(doc(db, 'coaches', targetUid));
  primaryBatch.delete(doc(db, 'user_stats', targetUid));
  primaryBatch.delete(doc(db, 'user_details', targetUid));

  for (const team of teams) {
    if (team.playerIds.includes(targetPlayer.id)) {
      primaryBatch.update(doc(db, 'teams', sanitizeId(team.id)), {
        playerIds: team.playerIds.filter(id => id !== targetPlayer.id).slice(0, 100),
        updatedAt: serverTimestamp()
      });
    }
  }

  const firstChunk = attemptIdsToDelete.slice(0, 360);
  for (const attemptId of firstChunk) {
    primaryBatch.delete(doc(db, 'attempts', attemptId));
  }

  try {
    await primaryBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${targetUid}`);
  }

  for (let i = 360; i < attemptIdsToDelete.length; i += 400) {
    const chunk = attemptIdsToDelete.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const attemptId of chunk) {
      batch.delete(doc(db, 'attempts', attemptId));
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'attempts');
    }
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

  const cleanTeamIds = Array.from(
    new Set((question.teamIds || []).map(id => sanitizeId(id)).filter(Boolean))
  ).slice(0, 30);

  const cleanOptions = stripUndefined(question.options.slice(0, 6));

  if (isUpdate) {
    const updatePayload: Record<string, unknown> = {
      title: question.title.trim().slice(0, 160),
      scenario: question.scenario.trim().slice(0, 1000),
      keyConcept: (question.keyConcept || question.title).trim().slice(0, 160),
      isPriorityFocus: Boolean(question.isPriorityFocus),
      tags: cleanTags,
      teamIds: cleanTeamIds.length > 0 ? cleanTeamIds : deleteField(),
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
    if (cleanTeamIds.length > 0) createPayload.teamIds = cleanTeamIds;
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

function mapQuestionDoc(docSnap: any): Question {
  const data = docSnap.data();
  const createdAtIso = toIsoString(data.createdAt);
  return {
    id: docSnap.id,
    title: String(data.title || ''),
    scenario: String(data.scenario || ''),
    keyConcept: String(data.keyConcept || ''),
    isPriorityFocus: Boolean(data.isPriorityFocus),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    teamIds: Array.isArray(data.teamIds) ? data.teamIds.map(String) : undefined,
    explanation: String(data.explanation || ''),
    options: Array.isArray(data.options) ? data.options : [],
    diagram: data.diagram || undefined,
    imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
    createdAt: createdAtIso,
    updatedAt: data.updatedAt ? toIsoString(data.updatedAt) : createdAtIso
  } as Question;
}

function extractMaxQuestionCursor(
  docs: any[],
  baseCursor: QuestionsCacheCursor | null
): QuestionsCacheCursor | null {
  let maxUpdatedCursor = baseCursor;
  let maxCreatedCursor: QuestionsCacheCursor | null = null;
  const MIN_VALID_SECONDS = 946684800; // 2000-01-01T00:00:00Z

  for (const docSnap of docs) {
    const data = docSnap.data();
    const rawUpdated = data.updatedAt;
    if (rawUpdated instanceof Timestamp && rawUpdated.seconds >= MIN_VALID_SECONDS) {
      const candidate: QuestionsCacheCursor = {
        seconds: rawUpdated.seconds,
        nanoseconds: rawUpdated.nanoseconds
      };
      if (!maxUpdatedCursor || compareCursors(candidate, maxUpdatedCursor) > 0) {
        maxUpdatedCursor = candidate;
      }
    } else if (data.createdAt instanceof Timestamp && data.createdAt.seconds >= MIN_VALID_SECONDS) {
      const fallbackCandidate: QuestionsCacheCursor = {
        seconds: data.createdAt.seconds,
        nanoseconds: data.createdAt.nanoseconds
      };
      if (!maxCreatedCursor || compareCursors(fallbackCandidate, maxCreatedCursor) > 0) {
        maxCreatedCursor = fallbackCandidate;
      }
    }
  }

  return maxUpdatedCursor || maxCreatedCursor;
}

export interface QuestionsSyncResult {
  isDelta: boolean;
  cachedQuestions: Question[];
  fetchedQuestions: Question[];
  nextCursor: QuestionsCacheCursor | null;
  missingUpdatedAtIds: string[];
}

export async function fetchQuestionsDeltaOrCold(): Promise<QuestionsSyncResult> {
  const cached = readQuestionsCache(QUESTIONS_CACHE_KEY);
  if (cached && cached.lastSyncedCursor && cached.questions.length > 0) {
    const cursorTs = new Timestamp(
      cached.lastSyncedCursor.seconds,
      cached.lastSyncedCursor.nanoseconds
    );
    const deltaQuery = query(collection(db, 'questions'), where('updatedAt', '>', cursorTs));
    const snap = await trackedGetDocs(deltaQuery);
    const fetchedQuestions = snap.docs.map(mapQuestionDoc);
    return {
      isDelta: true,
      cachedQuestions: cached.questions,
      fetchedQuestions,
      nextCursor: extractMaxQuestionCursor(snap.docs, cached.lastSyncedCursor),
      missingUpdatedAtIds: []
    };
  }

  const coldQuery = query(
    collection(db, 'questions'),
    where('isPriorityFocus', 'in', [true, false])
  );
  const snap = await trackedGetDocs(coldQuery);
  const missingUpdatedAtIds: string[] = [];
  const fetchedQuestions = snap.docs.map((docSnap: any) => {
    const data = docSnap.data();
    if (!(data.updatedAt instanceof Timestamp)) {
      missingUpdatedAtIds.push(docSnap.id);
    }
    return mapQuestionDoc(docSnap);
  });

  return {
    isDelta: false,
    cachedQuestions: [],
    fetchedQuestions,
    nextCursor: extractMaxQuestionCursor(snap.docs, null),
    missingUpdatedAtIds
  };
}

export async function backfillMissingQuestionUpdatedAt(questionIds: string[]): Promise<void> {
  const cleanIds = questionIds.map(id => sanitizeId(id)).filter(Boolean);
  if (cleanIds.length === 0) return;

  for (let i = 0; i < cleanIds.length; i += 400) {
    const chunk = cleanIds.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const qId of chunk) {
      batch.update(doc(db, 'questions', qId), {
        updatedAt: serverTimestamp()
      });
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'questions');
    }
  }
}

export async function deleteQuestionFromFirestore(
  questionId: string,
  currentConfig?: QuizConfig
): Promise<string[]> {
  const qId = sanitizeId(questionId);
  const path = `questions/${qId}`;
  const nextDeletedIds = Array.from(
    new Set([...(currentConfig?.deletedQuestionIds || []), qId])
  ).slice(-100);

  const batch = writeBatch(db);
  batch.delete(doc(db, 'questions', qId));
  batch.set(
    doc(db, 'team_meta', 'quiz_config'),
    {
      deletedQuestionIds: nextDeletedIds,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
  return nextDeletedIds;
}

export async function saveAttemptToFirestore(
  attempt: QuizAttempt,
  existingStats?: UserStats
): Promise<{ stats: UserStats; details: UserDetails } | null> {
  const attemptId = sanitizeId(attempt.id);
  const path = `attempts/${attemptId}`;

  const cleanAnswers = attempt.answers.slice(0, 30).map(a => ({
    ...a,
    timeSpentSeconds: Math.max(0.1, Math.round((a.timeSpentSeconds || 0) * 10) / 10)
  }));

  const payload: Record<string, unknown> = {
    id: attemptId,
    playerId: attempt.playerId,
    timestamp: attempt.timestamp.slice(0, 64),
    weekKey: attempt.weekKey.slice(0, 16),
    totalScore: Math.max(0, Math.min(10000, Math.round(attempt.totalScore * 10) / 10)),
    correctCount: Math.max(0, Math.min(30, Math.round(attempt.correctCount))),
    totalQuestions: Math.max(1, Math.min(30, Math.round(attempt.totalQuestions))),
    totalTimeSeconds: Math.max(0, Math.min(3600, Math.round(attempt.totalTimeSeconds * 10) / 10)),
    maxStreak: Math.max(0, Math.min(30, Math.round(attempt.maxStreak))),
    answers: stripUndefined(cleanAnswers),
    createdAt: serverTimestamp()
  };

  if (attempt.passed !== undefined) {
    payload.passed = Boolean(attempt.passed);
  }

  if (attempt.teamId) {
    payload.teamId = sanitizeId(attempt.teamId);
  }

  try {
    await setDoc(doc(db, 'attempts', attemptId), payload);
    return await updateUserStatsInFirestore(attempt.playerId, undefined, existingStats);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return null;
  }
}

function mapAttemptDoc(docSnap: any): QuizAttempt {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    playerId: String(data.playerId || ''),
    teamId: data.teamId ? String(data.teamId) : undefined,
    timestamp: String(data.timestamp || toIsoString(data.createdAt)),
    weekKey: String(data.weekKey || ''),
    totalScore: Number(data.totalScore || 0),
    correctCount: Number(data.correctCount || 0),
    totalQuestions: Number(data.totalQuestions || 1),
    totalTimeSeconds: Number(data.totalTimeSeconds || 0),
    maxStreak: Number(data.maxStreak || 0),
    answers: Array.isArray(data.answers) ? data.answers : [],
    passed: typeof data.passed === 'boolean' ? data.passed : undefined
  };
}

export async function updateUserStatsInFirestore(
  playerId: string,
  knownAttempts?: QuizAttempt[],
  existingStats?: UserStats
): Promise<{ stats: UserStats; details: UserDetails } | null> {
  const cleanId = sanitizeId(playerId);
  if (!cleanId) return null;
  try {
    let attempts: QuizAttempt[];
    if (knownAttempts) {
      attempts = knownAttempts;
    } else {
      const attemptsQuery = query(collection(db, 'attempts'), where('playerId', '==', cleanId));
      const snapshot = await trackedGetDocs(attemptsQuery);
      attempts = snapshot.docs.map(mapAttemptDoc);
    }

    const statsPayload = buildUserStatsFromAttempts(cleanId, attempts);
    const detailsPayload = buildUserDetailsFromAttempts(cleanId, attempts);

    const batch = writeBatch(db);
    // Merge preserves finalized pastGold/pastSilver/pastBronze/medalsThroughWeek stored on Firestore
    batch.set(
      doc(db, 'user_stats', cleanId),
      {
        ...stripUndefined(statsPayload),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    batch.set(doc(db, 'user_details', cleanId), {
      ...stripUndefined(detailsPayload),
      updatedAt: serverTimestamp()
    });
    await batch.commit();

    const nowIso = new Date().toISOString();
    const preservedPastMedals: Partial<UserStats> = {};
    if (typeof existingStats?.pastGold === 'number') preservedPastMedals.pastGold = existingStats.pastGold;
    if (typeof existingStats?.pastSilver === 'number') preservedPastMedals.pastSilver = existingStats.pastSilver;
    if (typeof existingStats?.pastBronze === 'number') preservedPastMedals.pastBronze = existingStats.pastBronze;
    if (existingStats?.medalsThroughWeek) preservedPastMedals.medalsThroughWeek = existingStats.medalsThroughWeek;

    return {
      stats: { ...statsPayload, ...preservedPastMedals, updatedAt: nowIso },
      details: { ...detailsPayload, updatedAt: nowIso }
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `user_stats/${cleanId}`);
    return null;
  }
}

export async function finalizeCompletedWeekMedalsIfNeeded(params: {
  players: Player[];
  existingStatsMap: Map<string, UserStats>;
  medalsFinalizedThroughWeek?: string;
  configExists: boolean;
  currentWeekKey?: string;
  previousWeekKey?: string;
}): Promise<{ updatedStats: UserStats[]; medalsFinalizedThroughWeek: string } | null> {
  const currentWeekKey = params.currentWeekKey || getWeekKey();
  const previousWeekKey = params.previousWeekKey || getPreviousWeekKey();

  if (params.medalsFinalizedThroughWeek && params.medalsFinalizedThroughWeek >= previousWeekKey) {
    return null;
  }

  try {
    const pastAttemptsQuery = params.medalsFinalizedThroughWeek
      ? query(
          collection(db, 'attempts'),
          where('weekKey', '>', params.medalsFinalizedThroughWeek),
          where('weekKey', '<', currentWeekKey)
        )
      : query(collection(db, 'attempts'), where('weekKey', '<', currentWeekKey));

    const snap = await trackedGetDocs(pastAttemptsQuery);
    const pastAttempts = snap.docs.map(mapAttemptDoc);
    const validPlayerIds = new Set(params.players.map(p => sanitizeId(p.id)).filter(Boolean));
    const newlyEarned = calculateCompletedWeekMedals(
      pastAttempts,
      params.medalsFinalizedThroughWeek,
      previousWeekKey,
      validPlayerIds.size > 0 ? validPlayerIds : undefined
    );

    const nowIso = new Date().toISOString();
    const updatedStats: UserStats[] = [];
    const writeOps: Array<{ userId: string; payload: Record<string, unknown> }> = [];

    for (const [playerId, earned] of newlyEarned.entries()) {
      const cleanId = sanitizeId(playerId);
      if (!cleanId) continue;
      const existing = params.existingStatsMap.get(cleanId);
      if (existing?.medalsThroughWeek && existing.medalsThroughWeek >= previousWeekKey) {
        continue;
      }

      const nextGold = Math.min(1000, (existing?.pastGold || 0) + earned.gold);
      const nextSilver = Math.min(1000, (existing?.pastSilver || 0) + earned.silver);
      const nextBronze = Math.min(1000, (existing?.pastBronze || 0) + earned.bronze);

      if (existing) {
        updatedStats.push({
          ...existing,
          pastGold: nextGold,
          pastSilver: nextSilver,
          pastBronze: nextBronze,
          medalsThroughWeek: previousWeekKey,
          updatedAt: nowIso
        });
        writeOps.push({
          userId: cleanId,
          payload: {
            pastGold: nextGold,
            pastSilver: nextSilver,
            pastBronze: nextBronze,
            medalsThroughWeek: previousWeekKey,
            updatedAt: serverTimestamp()
          }
        });
      } else {
        const freshStats: UserStats = {
          userId: cleanId,
          currentStreak: 0,
          bestStreak: 0,
          totalAttemptsAllTime: 0,
          bestScoreThisWeek: 0,
          pastGold: nextGold,
          pastSilver: nextSilver,
          pastBronze: nextBronze,
          medalsThroughWeek: previousWeekKey,
          updatedAt: nowIso
        };
        updatedStats.push(freshStats);
        writeOps.push({
          userId: cleanId,
          payload: {
            userId: cleanId,
            currentStreak: 0,
            bestStreak: 0,
            totalAttemptsAllTime: 0,
            bestScoreThisWeek: 0,
            pastGold: nextGold,
            pastSilver: nextSilver,
            pastBronze: nextBronze,
            medalsThroughWeek: previousWeekKey,
            updatedAt: serverTimestamp()
          }
        });
      }
    }

    for (let i = 0; i < writeOps.length; i += 400) {
      const chunk = writeOps.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const op of chunk) {
        batch.set(doc(db, 'user_stats', op.userId), op.payload, { merge: true });
      }
      await batch.commit();
    }

    if (params.configExists) {
      await setDoc(
        doc(db, 'team_meta', 'quiz_config'),
        {
          medalsFinalizedThroughWeek: previousWeekKey,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } else {
      await setDoc(doc(db, 'team_meta', 'quiz_config'), {
        questionCount: DEFAULT_QUIZ_CONFIG.questionCount,
        timePerQuestionSeconds: DEFAULT_QUIZ_CONFIG.timePerQuestionSeconds,
        prioritizeFocusQuestions: DEFAULT_QUIZ_CONFIG.prioritizeFocusQuestions,
        ensureDiverseTopics: DEFAULT_QUIZ_CONFIG.ensureDiverseTopics,
        medalsFinalizedThroughWeek: previousWeekKey,
        updatedAt: serverTimestamp()
      });
    }

    return {
      updatedStats,
      medalsFinalizedThroughWeek: previousWeekKey
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'user_stats');
    return null;
  }
}

export async function migrateAllUserAggregatesInFirestore(
  players: Player[],
  configExists = true
): Promise<{
  updatedPlayersCount: number;
  processedAttemptsCount: number;
  statsMap: Map<string, UserStats>;
  detailsMap: Map<string, UserDetails>;
  medalsFinalizedThroughWeek: string;
}> {
  let allAttempts: QuizAttempt[] = [];
  try {
    const snapshot = await trackedGetDocs(collection(db, 'attempts'));
    allAttempts = snapshot.docs.map(mapAttemptDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'attempts');
  }

  const attemptsByPlayer = new Map<string, QuizAttempt[]>();
  for (const att of allAttempts) {
    if (!att.playerId) continue;
    const list = attemptsByPlayer.get(att.playerId) || [];
    list.push(att);
    attemptsByPlayer.set(att.playerId, list);
  }

  const targetUserIds = Array.from(
    new Set(players.map(p => sanitizeId(p.id)).filter(Boolean))
  );

  const currentWeekKey = getWeekKey();
  const previousWeekKey = getPreviousWeekKey();
  const pastMedalsMap = calculateCompletedWeekMedals(
    allAttempts,
    undefined,
    previousWeekKey,
    targetUserIds.length > 0 ? new Set(targetUserIds) : undefined
  );

  const statsMap = new Map<string, UserStats>();
  const detailsMap = new Map<string, UserDetails>();
  const entries: Array<{ userId: string; stats: UserStats; details: UserDetails }> = [];
  const nowIso = new Date().toISOString();

  for (const userId of targetUserIds) {
    const playerAttempts = attemptsByPlayer.get(userId) || [];
    const baseStats = buildUserStatsFromAttempts(userId, playerAttempts, currentWeekKey);
    const pastMedals = pastMedalsMap.get(userId);
    const stats: UserStats = {
      ...baseStats,
      pastGold: pastMedals?.gold || 0,
      pastSilver: pastMedals?.silver || 0,
      pastBronze: pastMedals?.bronze || 0,
      medalsThroughWeek: previousWeekKey
    };
    const details = buildUserDetailsFromAttempts(userId, playerAttempts, currentWeekKey);
    statsMap.set(userId, { ...stats, updatedAt: nowIso });
    detailsMap.set(userId, { ...details, updatedAt: nowIso });
    entries.push({ userId, stats, details });
  }

  // 2 writes per user -> 200 users = 400 batch operations (below Firestore's 500-op limit)
  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.set(doc(db, 'user_stats', item.userId), {
        ...stripUndefined(item.stats),
        updatedAt: serverTimestamp()
      });
      batch.set(doc(db, 'user_details', item.userId), {
        ...stripUndefined(item.details),
        updatedAt: serverTimestamp()
      });
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'user_stats');
    }
  }

  try {
    if (configExists) {
      await setDoc(
        doc(db, 'team_meta', 'quiz_config'),
        {
          medalsFinalizedThroughWeek: previousWeekKey,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } else {
      await setDoc(doc(db, 'team_meta', 'quiz_config'), {
        questionCount: DEFAULT_QUIZ_CONFIG.questionCount,
        timePerQuestionSeconds: DEFAULT_QUIZ_CONFIG.timePerQuestionSeconds,
        prioritizeFocusQuestions: DEFAULT_QUIZ_CONFIG.prioritizeFocusQuestions,
        ensureDiverseTopics: DEFAULT_QUIZ_CONFIG.ensureDiverseTopics,
        medalsFinalizedThroughWeek: previousWeekKey,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'team_meta/quiz_config');
  }

  return {
    updatedPlayersCount: entries.length,
    processedAttemptsCount: allAttempts.length,
    statsMap,
    detailsMap,
    medalsFinalizedThroughWeek: previousWeekKey
  };
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
  currentConfig: QuizConfig,
  teams: Team[] = []
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

  for (const team of teams) {
    if (team.selectedTags && team.selectedTags.includes(tagToRemove)) {
      const nextTeamTags = team.selectedTags.filter(t => t !== tagToRemove).slice(0, 20);
      batch.update(doc(db, 'teams', sanitizeId(team.id)), {
        selectedTags: nextTeamTags.length > 0 ? nextTeamTags : deleteField(),
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

export async function createTeamInFirestore(
  name: string,
  coachUid: string,
  defaults: QuizConfig,
  initialPlayerIds: string[] = []
): Promise<string> {
  const cleanName = name.trim().slice(0, 64);
  if (!cleanName) {
    throw new Error('Teamname darf nicht leer sein.');
  }
  const teamId = sanitizeId(`team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const path = `teams/${teamId}`;

  const cleanPlayerIds = Array.from(
    new Set(initialPlayerIds.map(id => sanitizeId(id)).filter(Boolean))
  ).slice(0, 250);

  const payload: Record<string, unknown> = {
    id: teamId,
    name: cleanName,
    playerIds: cleanPlayerIds,
    questionCount: Math.max(1, Math.min(25, Math.round(defaults.questionCount))),
    timePerQuestionSeconds: Math.max(5, Math.min(120, Math.round(defaults.timePerQuestionSeconds))),
    prioritizeFocusQuestions: Boolean(defaults.prioritizeFocusQuestions),
    ensureDiverseTopics: Boolean(defaults.ensureDiverseTopics),
    createdBy: coachUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (defaults.selectedTags && defaults.selectedTags.length > 0) {
    payload.selectedTags = defaults.selectedTags.slice(0, 20);
  }

  try {
    await setDoc(doc(db, 'teams', teamId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return teamId;
}

export async function updateTeamInFirestore(
  teamId: string,
  updates: {
    name?: string;
    playerIds?: string[];
    questionCount?: number;
    timePerQuestionSeconds?: number;
    prioritizeFocusQuestions?: boolean;
    ensureDiverseTopics?: boolean;
    selectedTags?: string[] | null;
  }
): Promise<void> {
  const tId = sanitizeId(teamId);
  const path = `teams/${tId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp()
  };

  if (updates.name !== undefined) {
    const cleanName = updates.name.trim().slice(0, 64);
    if (!cleanName) throw new Error('Teamname darf nicht leer sein.');
    payload.name = cleanName;
  }
  if (updates.playerIds !== undefined) {
    payload.playerIds = Array.from(
      new Set(updates.playerIds.map(id => sanitizeId(id)).filter(Boolean))
    ).slice(0, 250);
  }
  if (updates.questionCount !== undefined) {
    payload.questionCount = Math.max(1, Math.min(25, Math.round(updates.questionCount)));
  }
  if (updates.timePerQuestionSeconds !== undefined) {
    payload.timePerQuestionSeconds = Math.max(5, Math.min(120, Math.round(updates.timePerQuestionSeconds)));
  }
  if (updates.prioritizeFocusQuestions !== undefined) {
    payload.prioritizeFocusQuestions = Boolean(updates.prioritizeFocusQuestions);
  }
  if (updates.ensureDiverseTopics !== undefined) {
    payload.ensureDiverseTopics = Boolean(updates.ensureDiverseTopics);
  }
  if (updates.selectedTags !== undefined) {
    payload.selectedTags =
      updates.selectedTags && updates.selectedTags.length > 0
        ? updates.selectedTags.slice(0, 20)
        : deleteField();
  }

  try {
    await updateDoc(doc(db, 'teams', tId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setDefaultTeamInFirestore(
  teamId: string | null,
  teams: Team[]
): Promise<void> {
  const targetId = teamId ? sanitizeId(teamId) : null;
  const batch = writeBatch(db);

  for (const team of teams) {
    const tId = sanitizeId(team.id);
    if (targetId && tId === targetId) {
      if (!team.isDefault) {
        batch.update(doc(db, 'teams', tId), {
          isDefault: true,
          updatedAt: serverTimestamp()
        });
      }
    } else if (team.isDefault) {
      batch.update(doc(db, 'teams', tId), {
        isDefault: false,
        updatedAt: serverTimestamp()
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, targetId ? `teams/${targetId}` : 'teams');
  }
}

export async function deleteTeamFromFirestore(
  teamId: string,
  questions: Question[]
): Promise<void> {
  const tId = sanitizeId(teamId);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'teams', tId));

  for (const q of questions) {
    if (q.teamIds && q.teamIds.includes(tId)) {
      const nextTeamIds = q.teamIds.filter(id => id !== tId);
      batch.update(doc(db, 'questions', sanitizeId(q.id)), {
        teamIds: nextTeamIds.length > 0 ? nextTeamIds.slice(0, 30) : deleteField(),
        updatedAt: serverTimestamp()
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `teams/${tId}`);
  }
}
