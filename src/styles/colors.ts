export type ThemeMode = "light" | "dark";

export interface ThemeColors {
  background: string;
  backgroundMuted: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryContrast: string;
  primarySoft: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  success: string;
  warning: string;
  error: string;
  errorSoft: string;
  errorMuted: string;
}

export const themeColors: Record<ThemeMode, ThemeColors> = {
  light: {
    background: "#F5F4F8",
    backgroundMuted: "#ECEAF1",
    border: "#E4E1EA",
    borderStrong: "#D8D3E2",
    primary: "#8B5CF6",
    primaryLight: "#C4B5FD",
    primaryDark: "#6D28D9",
    primaryContrast: "#6D28D9",
    primarySoft: "#F0EBFF",
    surface: "#FFFFFF",
    surfaceMuted: "#FAF9FC",
    text: "#17151D",
    textSecondary: "#6F6A78",
    textTertiary: "#9B96A5",
    success: "#16A36A",
    warning: "#D97706",
    error: "#DC3D5A",
    errorSoft: "#FDECEF",
    errorMuted: "#FBE0E6",
  },
  dark: {
    background: "#0D0B14",
    backgroundMuted: "#171321",
    border: "#302746",
    borderStrong: "#493A67",
    primary: "#8B5CF6",
    primaryLight: "#C4B5FD",
    primaryDark: "#6D28D9",
    primaryContrast: "#C4B5FD",
    primarySoft: "#2A1E4A",
    surface: "#171322",
    surfaceMuted: "#211A31",
    text: "#F8F7FC",
    textSecondary: "#B8ADC9",
    textTertiary: "#8D82A4",
    success: "#34D399",
    warning: "#FBBF24",
    error: "#FB7185",
    errorSoft: "#451C2B",
    errorMuted: "#5A2236",
  },
};

export const appColors = themeColors.light;

function toRgbTriplet(hex: string) {
  const value = hex.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `${red} ${green} ${blue}`;
}

export function getThemeVariables(mode: ThemeMode): Record<`--${string}`, string> {
  const colors = themeColors[mode];

  return Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [
      `--color-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      toRgbTriplet(value),
    ]),
  ) as Record<`--${string}`, string>;
}
