import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
  memo,
} from "react";
import { getPalette, Palette, ColorSchemePreference } from "./colors";
import { ThemeMode } from "../types";

interface ThemeContextValue {
  theme: ThemeMode;
  colorScheme: ColorSchemePreference;
  colors: Palette;
  toggleTheme: () => void;
  setColorScheme: (scheme: ColorSchemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [colorScheme, setColorSchemeState] =
    useState<ColorSchemePreference>("lime");

  const colors = useMemo(
    () => getPalette(theme, colorScheme),
    [theme, colorScheme],
  );

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const setColorScheme = useCallback((scheme: ColorSchemePreference) => {
    setColorSchemeState(scheme);
  }, []);

  const value = useMemo(
    () => ({ theme, colorScheme, colors, toggleTheme, setColorScheme }),
    [theme, colorScheme, colors, toggleTheme, setColorScheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export function useColors() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useColors must be used within ThemeProvider");
  }
  return context.colors;
}

export function useThemeToggle() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeToggle must be used within ThemeProvider");
  }
  return context.toggleTheme;
}

export function useColor<K extends keyof Palette>(key: K): Palette[K] {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useColor must be used within ThemeProvider");
  }
  return context.colors[key];
}

export const ThemeConsumer = memo(function ThemeConsumer({
  children,
}: {
  children: (value: ThemeContextValue) => React.ReactNode;
}) {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("ThemeConsumer must be used within ThemeProvider");
  }
  return <>{children(context)}</>;
});
