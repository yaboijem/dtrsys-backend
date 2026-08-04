import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { STORAGE_KEYS } from '../config';
import { darkColors, lightColors, type ThemeColors } from '../theme';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  preference: ThemePreference;
  isDark: boolean;
  colors: ThemeColors;
  setPreference: (next: ThemePreference) => void;
  toggleLightDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.theme);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'system';
}

function resolveIsDark(preference: ThemePreference): boolean {
  return preference === 'dark' || (preference === 'system' && systemPrefersDark());
}

function applyDomTheme(isDark: boolean): void {
  const root = document.documentElement;
  root.dataset.theme = isDark ? 'dark' : 'light';
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [isDark, setIsDark] = useState(() => resolveIsDark(readStoredPreference()));

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch {
      // ignore
    }
    const dark = resolveIsDark(next);
    setIsDark(dark);
    applyDomTheme(dark);
  }, []);

  const toggleLightDark = useCallback(() => {
    setPreference(isDark ? 'light' : 'dark');
  }, [isDark, setPreference]);

  useEffect(() => {
    applyDomTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    if (preference !== 'system') {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const dark = mq.matches;
      setIsDark(dark);
      applyDomTheme(dark);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      isDark,
      colors: isDark ? darkColors : lightColors,
      setPreference,
      toggleLightDark,
    }),
    [preference, isDark, setPreference, toggleLightDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
