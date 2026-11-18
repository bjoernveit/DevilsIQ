export function getCurrentAppVersion(): string {
  return typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0
    ? __APP_VERSION__
    : 'dev';
}

export function buildVersionJsonUrl(baseUrl: string = '/', cacheBustMs: number = Date.now()): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}version.json?t=${cacheBustMs}`;
}

export function buildCacheBustedReloadUrl(currentHref: string, nextVersion: string): string {
  const url = new URL(currentHref);
  url.searchParams.set('v', nextVersion);
  return url.toString();
}

export function stripVersionQueryParamFromUrl(currentHref: string): string | null {
  try {
    const url = new URL(currentHref);
    if (!url.searchParams.has('v')) return null;
    url.searchParams.delete('v');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export async function checkForNewAppVersion(
  baseUrl: string = '/',
  currentVersion: string = getCurrentAppVersion()
): Promise<string | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const response = await fetch(buildVersionJsonUrl(baseUrl), {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: unknown };
    if (typeof data?.version !== 'string') return null;
    const remoteVersion = data.version.trim();
    if (!remoteVersion || remoteVersion === currentVersion) return null;
    return remoteVersion;
  } catch {
    return null;
  }
}

export function reloadToAppVersion(nextVersion: string): void {
  if (typeof window === 'undefined') return;
  try {
    const targetUrl = buildCacheBustedReloadUrl(window.location.href, nextVersion);
    window.location.replace(targetUrl);
  } catch {
    window.location.reload();
  }
}
