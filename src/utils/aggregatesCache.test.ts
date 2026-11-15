import test from 'node:test';
import assert from 'node:assert/strict';
import { UserDetails, UserStats } from '../types/basketball';
import { StorageLike } from './questionCache';
import {
  getUserDetailsCacheKey,
  getUserStatsCacheKey,
  isUserDetailsStale,
  mergeAggregateEntriesWithDelta,
  readAggregatesCache,
  removeAggregateEntryFromCache,
  upsertAggregateEntriesInCache,
  writeAggregatesCache
} from './aggregatesCache';

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    }
  };
}

function makeStats(userId: string, overrides: Partial<UserStats> = {}): UserStats {
  return {
    userId,
    currentStreak: 2,
    bestStreak: 3,
    totalAttemptsAllTime: 5,
    attemptsThisWeek: 2,
    currentWeekKey: '2026-W46',
    bestScoreThisWeek: 18.4,
    bestScoreAllTime: 14.2,
    updatedAt: '2026-11-15T01:00:00.000Z',
    ...overrides
  };
}

function makeDetails(userId: string, overrides: Partial<UserDetails> = {}): UserDetails {
  return {
    userId,
    totalAttempts: 5,
    passedAttempts: 4,
    bestTimeAllTime: 14.2,
    averagePassedTime: 19.0,
    overallAvgQuestionTime: 4.1,
    currentStreak: 2,
    bestStreak: 3,
    currentWeekKey: '2026-W46',
    thisWeekPassed: true,
    weeklyTrends: [],
    questionStats: [],
    recentAttempts: [],
    updatedAt: '2026-11-15T01:00:00.000Z',
    ...overrides
  };
}

test('readAggregatesCache and writeAggregatesCache roundtrip and reject corrupt payloads', () => {
  const storage = createMemoryStorage();
  const key = getUserStatsCacheKey('hoopiq-playbook', 'db-1');

  assert.equal(readAggregatesCache<UserStats>(key, storage), null);
  storage.setItem(key, '{corrupt');
  assert.equal(readAggregatesCache<UserStats>(key, storage), null);

  const cursor = { seconds: 1763160000, nanoseconds: 345000000 };
  const s1 = makeStats('u1');
  assert.equal(
    writeAggregatesCache(key, { version: 1, lastSyncedCursor: cursor, entries: [s1] }, storage),
    true
  );

  const loaded = readAggregatesCache<UserStats>(key, storage);
  assert.ok(loaded);
  assert.deepEqual(loaded.lastSyncedCursor, cursor);
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].userId, 'u1');
});

test('mergeAggregateEntriesWithDelta updates changed users, adds new users, and prunes deleted users', () => {
  const cached = [makeStats('u1', { totalAttemptsAllTime: 5 }), makeStats('u2', { totalAttemptsAllTime: 3 })];
  const delta = [makeStats('u1', { totalAttemptsAllTime: 6 }), makeStats('u3', { totalAttemptsAllTime: 1 })];
  const validUserIds = new Set(['u1', 'u3']); // u2 was deleted

  const merged = mergeAggregateEntriesWithDelta(cached, delta, validUserIds);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(s => s.userId === 'u1')?.totalAttemptsAllTime, 6);
  assert.equal(merged.find(s => s.userId === 'u3')?.totalAttemptsAllTime, 1);
  assert.equal(merged.find(s => s.userId === 'u2'), undefined);
});

test('upsertAggregateEntriesInCache and removeAggregateEntryFromCache preserve server cursor', () => {
  const storage = createMemoryStorage();
  const key = getUserDetailsCacheKey('hoopiq-playbook', 'db-1');
  const serverCursor = { seconds: 1763160000, nanoseconds: 123000000 };

  writeAggregatesCache(
    key,
    { version: 1, lastSyncedCursor: serverCursor, entries: [makeDetails('u1'), makeDetails('u2')] },
    storage
  );

  upsertAggregateEntriesInCache(
    key,
    [makeDetails('u1', { totalAttempts: 6 }), makeDetails('u3', { totalAttempts: 1 })],
    storage
  );
  let loaded = readAggregatesCache<UserDetails>(key, storage)!;
  assert.deepEqual(loaded.lastSyncedCursor, serverCursor);
  assert.equal(loaded.entries.length, 3);
  assert.equal(loaded.entries.find(d => d.userId === 'u1')?.totalAttempts, 6);

  removeAggregateEntryFromCache<UserDetails>(key, 'u2', storage);
  loaded = readAggregatesCache<UserDetails>(key, storage)!;
  assert.deepEqual(loaded.lastSyncedCursor, serverCursor);
  assert.deepEqual(
    loaded.entries.map(e => e.userId).sort(),
    ['u1', 'u3']
  );
});

test('isUserDetailsStale detects missing details, attempt count mismatches, and newer stats timestamps', () => {
  const stats = makeStats('u1', { totalAttemptsAllTime: 5, updatedAt: '2026-11-15T01:10:00.000Z' });

  // Missing details -> stale
  assert.equal(isUserDetailsStale(null, stats), true);

  // Matching count and timestamp -> fresh
  assert.equal(
    isUserDetailsStale(
      makeDetails('u1', { totalAttempts: 5, updatedAt: '2026-11-15T01:10:00.000Z' }),
      stats
    ),
    false
  );

  // Newer details timestamp -> fresh
  assert.equal(
    isUserDetailsStale(
      makeDetails('u1', { totalAttempts: 5, updatedAt: '2026-11-15T01:12:00.000Z' }),
      stats
    ),
    false
  );

  // Older attempt count -> stale
  assert.equal(
    isUserDetailsStale(
      makeDetails('u1', { totalAttempts: 4, updatedAt: '2026-11-15T01:10:00.000Z' }),
      stats
    ),
    true
  );

  // Older updatedAt -> stale
  assert.equal(
    isUserDetailsStale(
      makeDetails('u1', { totalAttempts: 5, updatedAt: '2026-11-15T01:05:00.000Z' }),
      stats
    ),
    true
  );
});
