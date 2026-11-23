import { firebaseConfig } from './firebaseConfig';
import { getCurrentAppVersion } from '../utils/appVersion';
import {
  AnalyticsParamValue,
  getViewportType,
  sanitizeAnalyticsParams
} from '../utils/analyticsUtils';

export { getViewportType, sanitizeAnalyticsParams };
export type { AnalyticsParamValue };

type GtagFunction = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFunction;
  }
}

const GTAG_SCRIPT_BASE = 'https://www.googletagmanager.com/gtag/js';
const GA_DEBUG_STORAGE_KEY = 'hoopiq_ga_debug';

let initializedMeasurementId: string | null = null;
let currentRoleContext: 'player' | 'coach' | 'guest' = 'guest';

export function getMeasurementId(): string {
  const fromEnv =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_GA_MEASUREMENT_ID
      ? String(import.meta.env.VITE_GA_MEASUREMENT_ID).trim()
      : '';
  const fromConfig = typeof firebaseConfig.measurementId === 'string'
    ? firebaseConfig.measurementId.trim()
    : '';
  return (fromEnv || fromConfig).replace(/[^A-Za-z0-9-]/g, '');
}

export function isAnalyticsDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const paramVal = params.get('ga_debug');
    if (paramVal === '1' || paramVal === 'true') {
      window.localStorage.setItem(GA_DEBUG_STORAGE_KEY, '1');
      return true;
    }
    if (paramVal === '0' || paramVal === 'false') {
      window.localStorage.removeItem(GA_DEBUG_STORAGE_KEY);
      return false;
    }
    return window.localStorage.getItem(GA_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function ensureGtagInitialized(): { measurementId: string; gtag: GtagFunction; debugMode: boolean } | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const measurementId = getMeasurementId();
  if (!measurementId) return null;

  const debugMode = isAnalyticsDebugEnabled();

  if (!Array.isArray(window.dataLayer)) {
    window.dataLayer = [];
  }

  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      // gtag.js requires pushing the native IArguments object into dataLayer
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }

  if (initializedMeasurementId !== measurementId) {
    initializedMeasurementId = measurementId;

    const scriptSelector = `script[src^="${GTAG_SCRIPT_BASE}"][src*="id=${encodeURIComponent(measurementId)}"]`;
    if (!document.querySelector(scriptSelector)) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `${GTAG_SCRIPT_BASE}?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
    }

    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      send_page_view: true,
      ...(debugMode ? { debug_mode: true } : {})
    });

    if (debugMode) {
      console.info(`[Analytics] Initialized GA4 (${measurementId}) with debug_mode=true`);
    }
  }

  return { measurementId, gtag: window.gtag, debugMode };
}

export function setAnalyticsUserContext(role: 'player' | 'coach' | 'guest'): void {
  currentRoleContext = role;
  const ctx = ensureGtagInitialized();
  if (!ctx) return;

  const userProperties = {
    app_version: getCurrentAppVersion().slice(0, 36),
    user_role: role,
    viewport_type: getViewportType()
  };

  ctx.gtag('set', 'user_properties', userProperties);

  if (ctx.debugMode) {
    console.info('[Analytics] user_properties', userProperties);
  }
}

export function trackEvent(
  eventName: string,
  params?: Record<string, AnalyticsParamValue | undefined | null>
): void {
  const ctx = ensureGtagInitialized();
  if (!ctx) return;

  const enriched = sanitizeAnalyticsParams({
    app_version: getCurrentAppVersion(),
    user_role: currentRoleContext,
    viewport_type: getViewportType(),
    ...params
  });

  const payload: Record<string, AnalyticsParamValue | boolean> = {
    ...enriched,
    send_to: ctx.measurementId,
    ...(ctx.debugMode ? { debug_mode: true } : {})
  };

  ctx.gtag('event', eventName, payload);

  if (ctx.debugMode) {
    console.info(`[Analytics] event "${eventName}"`, payload);
  }
}
