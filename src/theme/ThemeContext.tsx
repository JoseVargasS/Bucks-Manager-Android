import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
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

  return (
    <ThemeModeContext.Provider value={themeModeValue}>
      <ColorSchemeContext.Provider value={colorSchemeValue}>
        <PaletteContext.Provider value={palette}>{children}</PaletteContext.Provider>
      </ColorSchemeContext.Provider>
    </ThemeModeContext.Provider>
  );
}

export function useColors(): Palette {
  const context = useContext(PaletteContext);
  if (!context) {
    throw new Error("useColors must be used within ThemeProvider");
  }
  return context;
}

export function useTheme() {
  const theme = useContext(ThemeModeContext);
  const colorScheme = useContext(ColorSchemeContext);
  const colors = useColors();
  if (!theme || !colorScheme) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return { theme: theme.theme, colorScheme: colorScheme.colorScheme, colors, toggleTheme: theme.toggleTheme, setColorScheme: colorScheme.setColorScheme };
}

