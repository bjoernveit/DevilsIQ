import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import {defineConfig, loadEnv, Plugin} from 'vite';

interface ResolvedFirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId: string;
}

function resolveFirebaseClientConfig(
  isBuild: boolean,
  env: Record<string, string | undefined>
): ResolvedFirebaseConfig {
  let fileOrJsonConfig: Record<string, unknown> = {};

  let rawJsonSecret = env.FIREBASE_APPLET_CONFIG_JSON?.trim() || '';
  if (rawJsonSecret.startsWith("'") && rawJsonSecret.endsWith("'") && rawJsonSecret.length > 2) {
    rawJsonSecret = rawJsonSecret.slice(1, -1).trim();
  }

  if (rawJsonSecret) {
    try {
      let parsed: unknown = JSON.parse(rawJsonSecret);
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Parsed value is not a JSON object.');
      }
      fileOrJsonConfig = parsed as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `Invalid FIREBASE_APPLET_CONFIG_JSON environment variable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  } else {
    const localConfigPath = path.resolve('firebase-applet-config.json');
    if (fs.existsSync(localConfigPath)) {
      fileOrJsonConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8')) as Record<string, unknown>;
    }
  }

  const pick = (envKey: string, jsonKey: string): string => {
    const fromEnv = env[envKey]?.trim();
    if (fromEnv) return fromEnv;
    const fromJson = fileOrJsonConfig[jsonKey];
    return typeof fromJson === 'string' ? fromJson.trim() : '';
  };

  const resolved: ResolvedFirebaseConfig = {
    projectId: pick('VITE_FIREBASE_PROJECT_ID', 'projectId'),
    appId: pick('VITE_FIREBASE_APP_ID', 'appId'),
    apiKey: pick('VITE_FIREBASE_API_KEY', 'apiKey'),
    authDomain: pick('VITE_FIREBASE_AUTH_DOMAIN', 'authDomain'),
    firestoreDatabaseId: pick('VITE_FIREBASE_FIRESTORE_DATABASE_ID', 'firestoreDatabaseId'),
    storageBucket: pick('VITE_FIREBASE_STORAGE_BUCKET', 'storageBucket'),
    messagingSenderId: pick('VITE_FIREBASE_MESSAGING_SENDER_ID', 'messagingSenderId'),
    measurementId: pick('VITE_GA_MEASUREMENT_ID', 'measurementId'),
  };

  const missingRequired: string[] = [];
  if (!resolved.apiKey) missingRequired.push('apiKey');
  if (!resolved.projectId) missingRequired.push('projectId');
  if (!resolved.appId) missingRequired.push('appId');

  if (isBuild && missingRequired.length > 0) {
    const jsonState = rawJsonSecret
      ? `FIREBASE_APPLET_CONFIG_JSON was provided (${rawJsonSecret.length} chars) but lacked [${missingRequired.join(', ')}]`
      : 'FIREBASE_APPLET_CONFIG_JSON is empty/unset';
    throw new Error(
      `Missing Firebase configuration for build (${jsonState}). Provide Repository Secret FIREBASE_APPLET_CONFIG_JSON (or VITE_FIREBASE_* env vars) in GitHub Settings → Secrets and variables → Actions.`
    );
  }

  return resolved;
}

function appVersionPlugin(appVersion: string, basePath: string): Plugin {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const payload = JSON.stringify({version: appVersion});

  return {
    name: 'app-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (pathname === '/version.json' || pathname === `${normalizedBase}version.json`) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(payload);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({command, mode}) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const mergedEnv = {...fileEnv, ...process.env};
  const basePath = mergedEnv.VITE_BASE_PATH || '/';
  const shaPrefix = mergedEnv.GITHUB_SHA ? mergedEnv.GITHUB_SHA.slice(0, 8) : 'build';
  const appVersion = `${shaPrefix}-${Date.now()}`;
  const firebaseClientConfig = resolveFirebaseClientConfig(command === 'build', mergedEnv);

  return {
    base: basePath,
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __FIREBASE_CONFIG__: JSON.stringify(firebaseClientConfig),
    },
    plugins: [react(), tailwindcss(), appVersionPlugin(appVersion, basePath)],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
