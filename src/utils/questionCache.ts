import { Question } from '../types/basketball';

export interface QuestionsCacheCursor {
  seconds: number;
  nanoseconds: number;
}

export interface QuestionsCacheData {
  version: 1;
  lastSyncedCursor: QuestionsCacheCursor | null;
  questions: Question[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function getQuestionsCacheKey(projectId: string, databaseId?: string): string {
  const safeProject = projectId || 'default';
  const safeDb = databaseId || 'default';
  return `hoopiq_questions_cache_v1_${safeProject}_${safeDb}`;
}

function getSafeStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function compareCursors(a: QuestionsCacheCursor, b: QuestionsCacheCursor): number {
  if (a.seconds !== b.seconds) {
    return a.seconds - b.seconds;
  }
  return a.nanoseconds - b.nanoseconds;
}

export function isValidCursor(val: unknown): val is QuestionsCacheCursor {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.seconds === 'number' &&
    Number.isFinite(obj.seconds) &&
    obj.seconds >= 946684800 && // >= 2000-01-01T00:00:00Z (matches firestore.rules)
    typeof obj.nanoseconds === 'number' &&
    Number.isFinite(obj.nanoseconds) &&
    obj.nanoseconds >= 0
  );
}

export function readQuestionsCache(
  cacheKey: string,
  storage?: StorageLike | null
): QuestionsCacheData | null {
  const store = getSafeStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuestionsCacheData>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.questions)) {
      return null;
    }
    const cursor = isValidCursor(parsed.lastSyncedCursor) ? parsed.lastSyncedCursor : null;
    return {
      version: 1,
      lastSyncedCursor: cursor,
      questions: parsed.questions
    };
  } catch {
    return null;
  }
}

export function writeQuestionsCache(
  cacheKey: string,
  data: QuestionsCacheData,
  storage?: StorageLike | null
): boolean {
  const store = getSafeStorage(storage);
  if (!store) return false;
  try {
    store.setItem(cacheKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function sortQuestionsNewestFirst(questions: Question[]): Question[] {
  return [...questions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Merges cached questions with newly updated/added delta questions and removes deleted IDs.
 * Delta questions override deleted IDs in case an ID was later recreated.
 */
export function mergeQuestionsWithDelta(
  cachedQuestions: Question[],
  deltaQuestions: Question[],
  deletedQuestionIds: string[] = []
): Question[] {
  const deletedSet = new Set(deletedQuestionIds);
  const byId = new Map<string, Question>();

  for (const q of cachedQuestions) {
    if (!deletedSet.has(q.id)) {
      byId.set(q.id, q);
    }
  }

  for (const q of deltaQuestions) {
    byId.set(q.id, q);
  }

  return sortQuestionsNewestFirst(Array.from(byId.values()));
}

/**
 * Updates cached questions locally after an in-app mutation (add, edit, focus toggle)
 * without advancing lastSyncedCursor ahead of Firestore server time.
 */
export function upsertQuestionsInCache(
  cacheKey: string,
  updatedQuestions: Question[],
  storage?: StorageLike | null
): void {
  const existing = readQuestionsCache(cacheKey, storage);
  if (!existing) return;
  const merged = mergeQuestionsWithDelta(existing.questions, updatedQuestions);
  writeQuestionsCache(
    cacheKey,
    {
      version: 1,
      lastSyncedCursor: existing.lastSyncedCursor,
      questions: merged
    },
    storage
  );
}

/**
 * Removes a deleted question from localStorage cache immediately.
 */
export function removeQuestionFromCache(
  cacheKey: string,
  questionId: string,
  storage?: StorageLike | null
): void {
  const existing = readQuestionsCache(cacheKey, storage);
  if (!existing) return;
  const filtered = existing.questions.filter(q => q.id !== questionId);
  writeQuestionsCache(
    cacheKey,
    {
      version: 1,
      lastSyncedCursor: existing.lastSyncedCursor,
      questions: filtered
    },
    storage
  );
}
