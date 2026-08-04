import type { CSSProperties } from 'react';

import { useTheme } from './theme/ThemeContext';

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
  primary: string;
  primaryDark: string;
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
  ground: '#f8fafc',
  card: '#ffffff',
  band: '#0f172a',
  bandText: '#f8fafc',
  bandSoft: '#1e293b',
  ink: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  barcode: '#0f172a',
  focus: '#0d9488',
  primary: '#0d9488',
  primaryDark: '#0f766e',
  success: '#059669',
  successFill: '#059669',
  successText: '#047857',
  danger: '#ef4444',
  dangerText: '#dc2626',
  warningFill: '#d97706',
  warningText: '#b45309',
  disabled: '#94a3b8',
  overlay: 'rgba(15,23,42,0.55)',
  cameraChrome: '#05070c',
  plates: {
    error: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
    success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
    info: { bg: '#f0fdfa', border: '#99f6e4', text: '#0f766e' },
  },
};

export const darkColors: ThemeColors = {
  ground: '#0f172a',
  card: '#1e293b',
  band: '#0f172a',
  bandText: '#f8fafc',
  bandSoft: '#334155',
  ink: '#f1f5f9',
  muted: '#94a3b8',
  border: '#334155',
  barcode: '#f1f5f9',
  focus: '#2dd4bf',
  primary: '#14b8a6',
  primaryDark: '#0d9488',
  success: '#10b981',
  successFill: '#059669',
  successText: '#34d399',
  danger: '#f87171',
  dangerText: '#fca5a5',
  warningFill: '#d97706',
  warningText: '#fbbf24',
  disabled: '#64748b',
  overlay: 'rgba(2,6,23,0.72)',
  cameraChrome: '#05070c',
  plates: {
    error: { bg: '#3f1d1d', border: '#7f1d1d', text: '#fca5a5' },
    warning: { bg: '#422006', border: '#78350f', text: '#fbbf24' },
    success: { bg: '#064e3b', border: '#065f46', text: '#34d399' },
    info: { bg: '#134e4a', border: '#115e59', text: '#5eead4' },
  },
};

/** Resolved palette for the active light/dark mode. */
export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}

export function useIsDark(): boolean {
  return useTheme().isDark;
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
  sm: 8,
  md: 12,
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

export const microLabel: CSSProperties = {
  fontSize: fontSize.micro,
  fontWeight: '700',
  letterSpacing: 0.8,
  textTransform: 'uppercase',
};

export function cardShadow(isDark: boolean): CSSProperties {
  return {
    boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.35)' : '0 4px 16px rgba(15,23,42,0.08)',
  };
}
