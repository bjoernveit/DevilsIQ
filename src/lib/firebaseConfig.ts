export interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId: string;
}

function readEnv(key: keyof ImportMetaEnv): string {
  if (typeof import.meta === 'undefined' || !import.meta.env) return '';
  const val = import.meta.env[key];
  return typeof val === 'string' ? val.trim() : '';
}

const injectedConfig: Partial<FirebaseClientConfig> =
  typeof __FIREBASE_CONFIG__ !== 'undefined' && __FIREBASE_CONFIG__
    ? __FIREBASE_CONFIG__
    : {};

export const firebaseConfig: FirebaseClientConfig = {
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || injectedConfig.projectId || '',
  appId: readEnv('VITE_FIREBASE_APP_ID') || injectedConfig.appId || '',
  apiKey: readEnv('VITE_FIREBASE_API_KEY') || injectedConfig.apiKey || '',
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || injectedConfig.authDomain || '',
  firestoreDatabaseId:
    readEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID') || injectedConfig.firestoreDatabaseId || '',
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || injectedConfig.storageBucket || '',
  messagingSenderId:
    readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || injectedConfig.messagingSenderId || '',
  measurementId: (readEnv('VITE_GA_MEASUREMENT_ID') || injectedConfig.measurementId || '')
    .trim()
    .replace(/[^A-Za-z0-9-]/g, '')
};
