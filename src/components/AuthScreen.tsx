import React, { useState } from 'react';
import {
  loginWithUsername,
  registerWithUsername,
  validateUsername,
  isRegistrationRoute
} from '../lib/firebase';

interface AuthScreenProps {
  onAuthSuccess?: () => void;
}

function getFriendlyAuthError(err: unknown, mode: 'login' | 'register'): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const msg = err instanceof Error ? err.message : String(err);

  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return 'E-Mail/Passwort-Anmeldung ist in der Firebase Console noch nicht aktiviert. Bitte den Trainer, dies unter Authentication > Sign-in method zu aktivieren.';
  }
  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
    return 'Dieser Benutzername ist bereits vergeben.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    msg.includes('invalid-credential')
  ) {
    return 'Benutzername oder Passwort ist falsch.';
  }
  if (code === 'auth/weak-password' || msg.includes('weak-password')) {
    return 'Das Passwort muss mindestens 6 Zeichen lang sein.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Zu viele Versuche. Bitte kurz warten und erneut versuchen.';
  }
  return mode === 'login'
    ? 'Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.'
    : 'Registrierung fehlgeschlagen. Bitte erneut versuchen.';
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(() => isRegistrationRoute());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    if (password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegisterMode) {
        await registerWithUsername(username, password);
      } else {
        await loginWithUsername(username, password);
      }
      onAuthSuccess?.();
    } catch (err) {
      setError(getFriendlyAuthError(err, isRegisterMode ? 'register' : 'login'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    setError(null);
    setPassword('');
    setIsRegisterMode(false);
    if (typeof window !== 'undefined' && window.location.search.includes('register=')) {
      window.history.replaceState({}, '', '/');
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-7 space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-20 h-20 rounded-2xl bg-black border border-zinc-800 p-1.5 flex items-center justify-center">
            <img
              src="/assets/aistudio/logodevils_7cf5d62a.jpg"
              alt="DTV Devils Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-red-500">
              DevilsIQ
            </p>
            <h1 className="text-xl font-bold tracking-tight text-white mt-1">
              {isRegisterMode ? 'Team-Registrierung' : 'Anmelden'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              {isRegisterMode
                ? 'Wähle einen Benutzernamen und ein Passwort für das Team.'
                : 'Gib deinen Benutzernamen und dein Passwort ein.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="auth-username"
              className="block text-xs font-medium text-zinc-300 mb-1.5"
            >
              Benutzername
            </label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="z. B. marcus3"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 min-h-[44px]"
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-zinc-300 mb-1.5"
            >
              Passwort
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-600 min-h-[44px]"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="text-xs text-red-200 bg-red-950/70 border border-red-800 rounded-xl px-3.5 py-2.5"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
          >
            {isSubmitting
              ? isRegisterMode
                ? 'Konto wird erstellt...'
                : 'Anmeldung...'
              : isRegisterMode
              ? 'Konto erstellen'
              : 'Anmelden'}
          </button>
        </form>

        {isRegisterMode && (
          <div className="pt-2 border-t border-zinc-800 text-center">
            <button
              type="button"
              onClick={handleBackToLogin}
              className="text-xs font-medium text-zinc-400 hover:text-white py-1"
            >
              Du hast schon ein Konto? Anmelden
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
