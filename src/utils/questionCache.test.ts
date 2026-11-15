import test from 'node:test';
import assert from 'node:assert/strict';
import { Question } from '../types/basketball';
import {
  StorageLike,
  compareCursors,
  getQuestionsCacheKey,
  mergeQuestionsWithDelta,
  readQuestionsCache,
  removeQuestionFromCache,
  upsertQuestionsInCache,
  writeQuestionsCache
} from './questionCache';

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    }
  };
}

function makeQuestion(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    title: `Title ${id}`,
    scenario: `Scenario ${id}`,
    options: [
      { id: 'o1', text: 'A', isCorrect: true },
      { id: 'o2', text: 'B', isCorrect: false }
    ],
    tags: ['Offense'],
    isPriorityFocus: false,
    explanation: 'Explanation',
    keyConcept: `Concept ${id}`,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides
  };
}

test('readQuestionsCache and writeQuestionsCache roundtrip safely and ignore corrupt data', () => {
  const storage = createMemoryStorage();
  const key = getQuestionsCacheKey('hoopiq-playbook', 'db-1');

  assert.equal(readQuestionsCache(key, storage), null);

  storage.setItem(key, '{bad json');
  assert.equal(readQuestionsCache(key, storage), null);

  const q1 = makeQuestion('q1');
  const cursor = { seconds: 1763100000, nanoseconds: 123456000 };
  const ok = writeQuestionsCache(
    key,
    { version: 1, lastSyncedCursor: cursor, questions: [q1] },
    storage
  );
  assert.equal(ok, true);

  const loaded = readQuestionsCache(key, storage);
  assert.ok(loaded);
  assert.deepEqual(loaded.lastSyncedCursor, cursor);
  assert.equal(loaded.questions.length, 1);
  assert.equal(loaded.questions[0].id, 'q1');
});

test('mergeQuestionsWithDelta merges new and edited questions, preserves order, and prunes deleted IDs', () => {
  const q1 = makeQuestion('q1', { createdAt: '2026-11-01T10:00:00.000Z' });
  const q2 = makeQuestion('q2', { createdAt: '2026-11-02T10:00:00.000Z', isPriorityFocus: false });
  const q3 = makeQuestion('q3', { createdAt: '2026-11-03T10:00:00.000Z' });

  const q2FocusUpdated = makeQuestion('q2', {
    createdAt: '2026-11-02T10:00:00.000Z',
    isPriorityFocus: true,
    updatedAt: '2026-11-10T10:00:00.000Z'
  });
  const q4Added = makeQuestion('q4', {
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z'
  });

  const merged = mergeQuestionsWithDelta([q3, q2, q1], [q2FocusUpdated, q4Added], ['q1']);
  assert.deepEqual(
    merged.map(q => q.id),
    ['q4', 'q3', 'q2']
  );
  assert.equal(merged.find(q => q.id === 'q2')?.isPriorityFocus, true);
});

test('upsertQuestionsInCache and removeQuestionFromCache keep server cursor intact across local edits', () => {
  const storage = createMemoryStorage();
  const key = 'test_key';
  const serverCursor = { seconds: 1763100000, nanoseconds: 500000000 };

  const q1 = makeQuestion('q1', { isPriorityFocus: false });
  const q2 = makeQuestion('q2', { createdAt: '2026-11-05T10:00:00.000Z' });
  writeQuestionsCache(key, { version: 1, lastSyncedCursor: serverCursor, questions: [q1, q2] }, storage);

  // Toggle focus on q1 & add q3 locally
  upsertQuestionsInCache(
    key,
    [
      makeQuestion('q1', { isPriorityFocus: true, updatedAt: '2026-11-15T01:00:00.000Z' }),
      makeQuestion('q3', { createdAt: '2026-11-15T01:00:00.000Z' })
    ],
    storage
  );

  let cached = readQuestionsCache(key, storage)!;
  assert.deepEqual(cached.lastSyncedCursor, serverCursor);
  assert.deepEqual(
    cached.questions.map(q => q.id),
    ['q3', 'q2', 'q1']
  );
  assert.equal(cached.questions.find(q => q.id === 'q1')?.isPriorityFocus, true);

  // Delete q2 locally
  removeQuestionFromCache(key, 'q2', storage);
  cached = readQuestionsCache(key, storage)!;
  assert.deepEqual(cached.lastSyncedCursor, serverCursor);
  assert.deepEqual(
    cached.questions.map(q => q.id),
    ['q3', 'q1']
  );
});

test('compareCursors compares seconds and nanoseconds accurately', () => {
  assert.ok(
    compareCursors({ seconds: 100, nanoseconds: 2 }, { seconds: 100, nanoseconds: 1 }) > 0
  );
  assert.ok(
    compareCursors({ seconds: 101, nanoseconds: 0 }, { seconds: 100, nanoseconds: 999999999 }) > 0
  );
  assert.equal(
    compareCursors({ seconds: 100, nanoseconds: 5 }, { seconds: 100, nanoseconds: 5 }),
    0
  );
});
