import { MD3LightTheme, MD3Theme } from 'react-native-paper';

export const palette = {
  primary: '#059669', // Vibrant Emerald
  primaryDark: '#064E3B',
  primaryLight: '#E6F7F0',
  accent: '#F59E0B', // Amber Gold
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  info: '#3B82F6',
  ink: '#0F172A', // Slate Charcoal
  muted: '#64748B', // Cool Slate
  border: '#E2E8F0',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  darkSurface: '#090D10',
  glowGreen: '#34D399',
};

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
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const theme: MD3Theme = {
  ...MD3LightTheme,
  roundness: radius.md,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: palette.primaryLight,
    onPrimaryContainer: palette.primaryDark,
    secondary: palette.accent,
    onSecondary: '#1C1500',
    secondaryContainer: '#FEF3C7',
    onSecondaryContainer: '#78350F',
    tertiary: palette.info,
    background: palette.background,
    onBackground: palette.ink,
    surface: palette.surface,
    onSurface: palette.ink,
    surfaceVariant: '#F1F5F9',
    onSurfaceVariant: palette.muted,
    outline: palette.border,
    outlineVariant: '#CBD5E1',
    error: palette.danger,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: '#FFFFFF',
      level2: '#F8FAFC',
    },
  },
};

export const statusColors: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: '#FEF3C7', fg: '#B45309', label: 'Pending' },
  CONFIRMED: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'Confirmed' },
  IN_PROGRESS: { bg: '#D1FAE5', fg: '#047857', label: 'Charging' },
  COMPLETED: { bg: '#D1FAE5', fg: '#065F46', label: 'Completed' },
  CANCELLED: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Cancelled' },
  NO_SHOW: { bg: '#F3E8FF', fg: '#6B21A8', label: 'No show' },
  APPROVED: { bg: '#D1FAE5', fg: '#065F46', label: 'Approved' },
  REJECTED: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Rejected' },
  SUSPENDED: { bg: '#F3E8FF', fg: '#6B21A8', label: 'Suspended' },
  UNPAID: { bg: '#F1F5F9', fg: '#64748B', label: 'Unpaid' },
  PAID: { bg: '#D1FAE5', fg: '#047857', label: 'Paid' },
  FAILED: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Failed' },
};
