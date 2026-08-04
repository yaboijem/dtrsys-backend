import { useEffect, useState } from 'react';

export type BannerTone = 'error' | 'info' | 'success' | 'warning';

export interface PlateColors {
  bg: string;
  border: string;
  text: string;
}

export interface ThemeColors {
  ground: string;
  card: string;
  band: string;
  bandText: string;
  bandSoft: string;
  ink: string;
  muted: string;
  border: string;
  barcode: string;
  focus: string;
  success: string;
  successFill: string;
  successText: string;
  danger: string;
  dangerText: string;
  warningFill: string;
  warningText: string;
  disabled: string;
  overlay: string;
  cameraChrome: string;
  plates: Record<BannerTone, PlateColors>;
}

export const lightColors: ThemeColors = {
  ground: '#eef4f7',
  card: '#ffffff',
  band: '#0c1b2a',
  bandText: '#f1f5f9',
  bandSoft: '#102840',
  ink: '#0a1a26',
  muted: '#45616f',
  border: '#d7e3e9',
  barcode: '#0a1a26',
  focus: '#0e7490',
  success: '#059669',
  successFill: '#047857',
  successText: '#047857',
  danger: '#dc2626',
  dangerText: '#b91c1c',
  warningFill: '#b45309',
  warningText: '#92400e',
  disabled: '#aab3c0',
  overlay: 'rgba(12,27,42,0.6)',
  cameraChrome: '#05070c',
  plates: {
    error: { bg: '#fdf0ef', border: '#f5c6c4', text: '#b91c1c' },
    warning: { bg: '#fff7e6', border: '#f2dcae', text: '#92400e' },
    success: { bg: '#edf7ee', border: '#c4e5c9', text: '#047857' },
    info: { bg: '#eef4f7', border: '#d7e3e9', text: '#155e75' },
  },
};

export const darkColors: ThemeColors = {
  ground: '#0c1b2a',
  card: '#102840',
  band: '#0c1b2a',
  bandText: '#f1f5f9',
  bandSoft: '#1d3a55',
  ink: '#f1f5f9',
  muted: '#94a3b8',
  border: '#1d3a55',
  barcode: '#f1f5f9',
  focus: '#67e8f9',
  success: '#059669',
  successFill: '#047857',
  successText: '#34d399',
  danger: '#dc2626',
  dangerText: '#fca5a5',
  warningFill: '#b45309',
  warningText: '#fbbf24',
  disabled: '#46536a',
  overlay: 'rgba(3,5,10,0.7)',
  cameraChrome: '#05070c',
  plates: {
    error: { bg: '#2a1517', border: '#4a2428', text: '#fca5a5' },
    warning: { bg: '#2a2110', border: '#4a3c1d', text: '#fbbf24' },
    success: { bg: '#12241a', border: '#24442f', text: '#34d399' },
    info: { bg: '#102840', border: '#1d3a55', text: '#7dd3fc' },
  },
};

export function useThemeColors(): ThemeColors {
  const [isDark, setIsDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDark ? darkColors : lightColors;
}

export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDark;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
};

export const fontSize = {
  micro: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
};

export const microLabel: React.CSSProperties = {
  fontSize: fontSize.micro,
  fontWeight: '700',
  letterSpacing: 1.2,
  textTransform: 'uppercase',
};

export function cardShadow(isDark: boolean): React.CSSProperties {
  return {
    boxShadow: isDark
      ? '0 2px 10px rgba(0,0,0,0.5)'
      : '0 2px 10px rgba(14,21,38,0.08)',
  };
}
