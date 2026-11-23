export type AnalyticsParamValue = string | number | boolean;

export function getViewportType(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

export function sanitizeAnalyticsParams(
  params?: Record<string, AnalyticsParamValue | undefined | null>
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!params) return out;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
    if (!cleanKey) continue;

    if (typeof value === 'boolean') {
      out[cleanKey] = value ? 1 : 0;
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        out[cleanKey] = Math.round(value * 100) / 100;
      }
    } else {
      const str = String(value).trim().slice(0, 100);
      if (str.length > 0) {
        out[cleanKey] = str;
      }
    }
  }
  return out;
}
