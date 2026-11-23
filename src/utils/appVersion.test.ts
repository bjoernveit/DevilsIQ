import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVersionJsonUrl,
  buildCacheBustedReloadUrl,
  stripVersionQueryParamFromUrl,
  checkForNewAppVersion
} from './appVersion';

test('buildVersionJsonUrl appends version.json and cache buster cleanly', () => {
  assert.equal(buildVersionJsonUrl('/', 12345), '/version.json?t=12345');
  assert.equal(buildVersionJsonUrl('/devils-iq/', 999), '/devils-iq/version.json?t=999');
  assert.equal(buildVersionJsonUrl('/devils-iq', 999), '/devils-iq/version.json?t=999');
});

test('buildCacheBustedReloadUrl preserves existing query params and sets v', () => {
  assert.equal(
    buildCacheBustedReloadUrl('https://example.github.io/devils/?register=abc#top', 'build-42'),
    'https://example.github.io/devils/?register=abc&v=build-42#top'
  );
  assert.equal(
    buildCacheBustedReloadUrl('https://example.github.io/devils/?v=old', 'new'),
    'https://example.github.io/devils/?v=new'
  );
});

test('stripVersionQueryParamFromUrl removes only the v query param', () => {
  assert.equal(stripVersionQueryParamFromUrl('https://example.com/app/'), null);
  assert.equal(
    stripVersionQueryParamFromUrl('https://example.com/app/?register=invite-token-123&v=build-42#hash'),
    '/app/?register=invite-token-123#hash'
  );
  assert.equal(stripVersionQueryParamFromUrl('https://example.com/app/?v=build-42'), '/app/');
});

test('checkForNewAppVersion returns remote version only when different from current version', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({ version: '2026-build-2' })
      }) as Response) as typeof fetch;

    assert.equal(await checkForNewAppVersion('/', '2026-build-1'), '2026-build-2');
    assert.equal(await checkForNewAppVersion('/', '2026-build-2'), null);

    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 404
      }) as Response) as typeof fetch;
    assert.equal(await checkForNewAppVersion('/', '2026-build-1'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
