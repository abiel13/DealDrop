import AsyncStorage from "@react-native-async-storage/async-storage";
import { vars } from "nativewind";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";

import { getThemeVariables, themeColors, type ThemeColors, type ThemeMode } from "@/styles/colors";

const THEME_STORAGE_KEY = "dealdrop.theme-mode";

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isLoading: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggleMode: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    void AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((storedMode) => {
        if (isMounted && isThemeMode(storedMode)) {
          setMode(storedMode);
        }
      })
      .catch((error: unknown) => {
        console.warn("Theme preference could not be loaded", error);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateMode = useCallback(async (nextMode: ThemeMode) => {
    setMode(nextMode);

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode);
    } catch (error) {
      console.warn("Theme preference could not be saved", error);
    }
  }, []);

  const toggleMode = useCallback(
    () => updateMode(mode === "light" ? "dark" : "light"),
    [mode, updateMode],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: themeColors[mode],
      isLoading,
      setMode: updateMode,
      toggleMode,
    }),
    [isLoading, mode, toggleMode, updateMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View className="flex-1" style={vars(getThemeVariables(mode))}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
