import { UserDetails, UserStats } from '../types/basketball';
import {
  QuestionsCacheCursor,
  StorageLike,
  isValidCursor
} from './questionCache';

export interface AggregatesCacheData<T> {
  version: 1;
  lastSyncedCursor: QuestionsCacheCursor | null;
  entries: T[];
}

export function getUserStatsCacheKey(projectId: string, databaseId?: string): string {
  const safeProject = projectId || 'default';
  const safeDb = databaseId || 'default';
  return `hoopiq_user_stats_cache_v1_${safeProject}_${safeDb}`;
}

export function getUserDetailsCacheKey(projectId: string, databaseId?: string): string {
  const safeProject = projectId || 'default';
  const safeDb = databaseId || 'default';
  return `hoopiq_user_details_cache_v1_${safeProject}_${safeDb}`;
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

export function readAggregatesCache<T>(
  cacheKey: string,
  storage?: StorageLike | null
): AggregatesCacheData<T> | null {
  const store = getSafeStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AggregatesCacheData<T>>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return null;
    }
    const cursor = isValidCursor(parsed.lastSyncedCursor) ? parsed.lastSyncedCursor : null;
    return {
      version: 1,
      lastSyncedCursor: cursor,
      entries: parsed.entries
    };
  } catch {
    return null;
  }
}

export function writeAggregatesCache<T>(
  cacheKey: string,
  data: AggregatesCacheData<T>,
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

export function mergeAggregateEntriesWithDelta<T extends { userId: string }>(
  cachedEntries: T[],
  deltaEntries: T[],
  validUserIds?: Set<string> | null
): T[] {
  const byId = new Map<string, T>();

  for (const entry of cachedEntries) {
    if (!validUserIds || validUserIds.has(entry.userId)) {
      byId.set(entry.userId, entry);
    }
  }

  for (const entry of deltaEntries) {
    if (!validUserIds || validUserIds.has(entry.userId)) {
      byId.set(entry.userId, entry);
    }
  }

  return Array.from(byId.values());
}

/**
 * Upserts entries into localStorage cache while keeping the server-authoritative
 * lastSyncedCursor untouched (so other devices' changes or server timestamps stay accurate).
 */
export function upsertAggregateEntriesInCache<T extends { userId: string }>(
  cacheKey: string,
  updatedEntries: T[],
  storage?: StorageLike | null
): void {
  const existing = readAggregatesCache<T>(cacheKey, storage);
  const merged = mergeAggregateEntriesWithDelta(existing?.entries || [], updatedEntries);
  writeAggregatesCache(
    cacheKey,
    {
      version: 1,
      lastSyncedCursor: existing?.lastSyncedCursor ?? null,
      entries: merged
    },
    storage
  );
}

/**
 * Removes a deleted user's entry from localStorage cache immediately.
 */
export function removeAggregateEntryFromCache<T extends { userId: string }>(
  cacheKey: string,
  userId: string,
  storage?: StorageLike | null
): void {
  const existing = readAggregatesCache<T>(cacheKey, storage);
  if (!existing) return;
  const filtered = existing.entries.filter(entry => entry.userId !== userId);
  writeAggregatesCache(
    cacheKey,
    {
      version: 1,
      lastSyncedCursor: existing.lastSyncedCursor,
      entries: filtered
    },
    storage
  );
}

/**
 * Determines whether a cached UserDetails record is missing or stale relative
 * to the player's already-synced UserStats record.
 */
export function isUserDetailsStale(
  details: UserDetails | null | undefined,
  stats: UserStats | null | undefined
): boolean {
  if (!details) return true;
  if (!stats) return false;
  if (details.totalAttempts !== stats.totalAttemptsAllTime) return true;

  if (stats.updatedAt && details.updatedAt) {
    const statsMs = new Date(stats.updatedAt).getTime();
    const detailsMs = new Date(details.updatedAt).getTime();
    if (Number.isFinite(statsMs) && Number.isFinite(detailsMs) && statsMs > detailsMs) {
      return true;
    }
  } else if (stats.updatedAt && !details.updatedAt) {
    return true;
  }

  return false;
}
