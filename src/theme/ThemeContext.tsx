import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
  memo,
  type ReactNode,
} from "react";
import { getPalette, Palette, ColorSchemePreference } from "./colors";
import { ThemeMode } from "../types";

const ThemeModeContext = createContext<{
  theme: ThemeMode;
  toggleTheme: () => void;
} | null>(null);

const ColorSchemeContext = createContext<{
  colorScheme: ColorSchemePreference;
  setColorScheme: (scheme: ColorSchemePreference) => void;
} | null>(null);

const PaletteContext = createContext<Palette | null>(null);

interface LegacyThemeValue {
  theme: ThemeMode;
  colorScheme: ColorSchemePreference;
  colors: Palette;
  toggleTheme: () => void;
  setColorScheme: (scheme: ColorSchemePreference) => void;
}

const LegacyThemeContext = createContext<LegacyThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [colorScheme, setColorSchemeState] =
    useState<ColorSchemePreference>("lime");

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const setColorScheme = useCallback((scheme: ColorSchemePreference) => {
    setColorSchemeState(scheme);
  }, []);

  const themeModeValue = useMemo(
    () => ({ theme, toggleTheme }),
    [theme, toggleTheme],
  );

  const colorSchemeValue = useMemo(
    () => ({ colorScheme, setColorScheme }),
    [colorScheme, setColorScheme],
  );

  const palette = useMemo(
    () => getPalette(theme, colorScheme),
    [theme, colorScheme],
  );

  const legacyValue = useMemo<LegacyThemeValue>(
    () => ({ theme, colorScheme, colors: palette, toggleTheme, setColorScheme }),
    [theme, colorScheme, palette, toggleTheme, setColorScheme],
  );

  return (
    <LegacyThemeContext.Provider value={legacyValue}>
      <ThemeModeContext.Provider value={themeModeValue}>
        <ColorSchemeContext.Provider value={colorSchemeValue}>
          <PaletteContext.Provider value={palette}>{children}</PaletteContext.Provider>
        </ColorSchemeContext.Provider>
      </ThemeModeContext.Provider>
    </LegacyThemeContext.Provider>
  );
}

export function useTheme(): LegacyThemeValue {
  const context = useContext(LegacyThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export function useColors(): Palette {
  const context = useContext(PaletteContext);
  if (!context) {
    throw new Error("useColors must be used within ThemeProvider");
  }
  return context;
}

export function useThemeToggle(): () => void {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeToggle must be used within ThemeProvider");
  }
  return context.toggleTheme;
}

export function useThemeMode(): ThemeMode {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within ThemeProvider");
  }
  return context.theme;
}

export function useColorScheme(): ColorSchemePreference {
  const context = useContext(ColorSchemeContext);
  if (!context) {
    throw new Error("useColorScheme must be used within ThemeProvider");
  }
  return context.colorScheme;
}

export function useSetColorScheme(): (scheme: ColorSchemePreference) => void {
  const context = useContext(ColorSchemeContext);
  if (!context) {
    throw new Error("useSetColorScheme must be used within ThemeProvider");
  }
  return context.setColorScheme;
}

export function useColor<K extends keyof Palette>(key: K): Palette[K] {
  return useColors()[key];
}

export const ThemeConsumer = memo(function ThemeConsumer({
  children,
}: {
  children: (value: LegacyThemeValue) => ReactNode;
}) {
  return <>{children(useTheme())}</>;
});

