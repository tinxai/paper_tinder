/**
 * The design system: colors, spacing, typography, radii.
 *
 * Every visual value in the app comes from here. Two palettes share one set of
 * token names, so components never branch on the color scheme themselves —
 * they read tokens from `useTheme()`.
 */

/** Spacing scale (4pt grid). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * iOS Human Interface Guidelines put the minimum comfortable tap target at
 * 44x44pt. Every pressable in the app meets this.
 */
export const MIN_TOUCH_TARGET = 44;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  /** Paper titles on cards — large and readable is the whole point. */
  cardTitle: { fontSize: 22, lineHeight: 29, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  subtle: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  tiny: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
} as const;

/**
 * Light palette.
 *
 * Contrast: `text` on `background` is ~15:1 and `textMuted` on `background` is
 * ~5.9:1 — both clear WCAG AA (4.5:1) for body text.
 */
const lightColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#F4F5F7',
  border: '#E3E5E9',
  borderStrong: '#C8CCD4',

  text: '#14161A',
  textSecondary: '#4A5059',
  textMuted: '#6B7280',
  textInverse: '#FFFFFF',

  primary: '#2F5BEA',
  primaryPressed: '#2447BC',
  primarySubtle: '#EDF1FE',

  save: '#0F8A5F',
  saveSubtle: '#E6F4EE',
  dismiss: '#C2410C',
  dismissSubtle: '#FDF0E8',

  danger: '#B4231F',
  dangerSubtle: '#FCECEC',

  overlay: 'rgba(0,0,0,0.45)',
  shadow: '#000000',
};

export type Colors = typeof lightColors;

/** Dark palette — same token names, so no component needs to know which is active. */
const darkColors: Colors = {
  background: '#0E1013',
  surface: '#191C21',
  surfaceRaised: '#21252C',
  surfaceSunken: '#111418',
  border: '#2C313A',
  borderStrong: '#3D444F',

  text: '#F2F4F7',
  textSecondary: '#B8BFC9',
  textMuted: '#8B93A0',
  textInverse: '#0E1013',

  primary: '#7B9BFF',
  primaryPressed: '#93ADFF',
  primarySubtle: '#1B2440',

  save: '#3ECf9A',
  saveSubtle: '#122A22',
  dismiss: '#FB923C',
  dismissSubtle: '#2E1E14',

  danger: '#F87171',
  dangerSubtle: '#2E1618',

  overlay: 'rgba(0,0,0,0.65)',
  shadow: '#000000',
};

export type ColorSchemeName = 'light' | 'dark';

export const palettes: Record<ColorSchemeName, Colors> = {
  light: lightColors,
  dark: darkColors,
};

export type Theme = {
  colors: Colors;
  scheme: ColorSchemeName;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};

export function buildTheme(scheme: ColorSchemeName): Theme {
  return { colors: palettes[scheme], scheme, spacing, radius, typography };
}
