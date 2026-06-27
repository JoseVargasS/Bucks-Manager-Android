import { useCallback, useState } from "react";
import {
  getItemAsync,
  setItemAsync,
} from "expo-secure-store";
import { ColorSchemePreference } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { LanguageMode, FontPreference, MaterialIconName } from "../types";
import {
  detectDeviceCurrencySymbol,
  detectDeviceLanguage,
} from "../utils/helpers";
import { setAppFontPreference } from "../components/ui/AppText";
import { UiCopy, UI_COPY, UI_MONTH_NAMES } from "../i18n";

const LANGUAGE_KEY = "bucks_language";
const CURRENCY_SYMBOL_KEY = "bucks_currency_symbol";
const FONT_KEY = "bucks_font";
const COLOR_SCHEME_KEY = "bucks_color_scheme";
const FONT_PREFERENCES: FontPreference[] = [
  "dmsans", "serif", "mono", "condensed", "light", "casual", "cursive", "smallcaps",
];
const COLOR_SCHEME_PREFERENCES: ColorSchemePreference[] = [
  "lime", "ocean", "violet", "amber", "graphite",
];

export const CURRENCY_OPTIONS: Array<{
  value: string;
  labelEs: string;
  labelEn: string;
  icon: MaterialIconName;
}> = [
  { labelEs: "Soles peruanos (S/)", labelEn: "Peruvian soles (S/)", value: "S/", icon: "cash" },
  { labelEs: "Dólares ($)", labelEn: "US dollars ($)", value: "$", icon: "currency-usd" },
  { labelEs: "Euros (€)", labelEn: "Euros (€)", value: "€", icon: "currency-eur" },
  { labelEs: "Libras (£)", labelEn: "Pounds (£)", value: "£", icon: "currency-gbp" },
  { labelEs: "Yenes (¥)", labelEn: "Yen (¥)", value: "¥", icon: "currency-jpy" },
  { labelEs: "Reales (R$)", labelEn: "Brazilian reais (R$)", value: "R$", icon: "currency-brl" },
  { labelEs: "Pesos mexicanos (MX$)", labelEn: "Mexican pesos (MX$)", value: "MX$", icon: "cash" },
  { labelEs: "Pesos colombianos (COP$)", labelEn: "Colombian pesos (COP$)", value: "COP$", icon: "cash" },
  { labelEs: "Pesos chilenos (CLP$)", labelEn: "Chilean pesos (CLP$)", value: "CLP$", icon: "cash" },
];

export type PreferencesState = {
  language: LanguageMode;
  currencySymbol: string;
  fontPreference: FontPreference;
  copy: UiCopy;
  uiMonthNames: readonly string[];
  saveLanguage: (next: string) => void;
  saveCurrencySymbol: (next: string) => void;
  saveFontPreference: (next: string) => void;
  saveColorScheme: (next: string) => void;
  restorePreferences: () => Promise<void>;
};

export function usePreferences(): PreferencesState {
  const { setColorScheme } = useTheme();
  const [language, setLanguage] = useState<LanguageMode>(detectDeviceLanguage);
  const [currencySymbol, setCurrencySymbol] = useState(detectDeviceCurrencySymbol);
  const [fontPreference, setFontPreference] = useState<FontPreference>("dmsans");

  const copy: UiCopy = UI_COPY[language];
  const uiMonthNames: readonly string[] = copy.languageCode === "en" ? UI_MONTH_NAMES.en : UI_MONTH_NAMES.es;

  const restorePreferences = useCallback(async () => {
    const [storedLanguage, storedCurrency, storedFont, storedColorScheme] =
      await Promise.all([
        getItemAsync(LANGUAGE_KEY),
        getItemAsync(CURRENCY_SYMBOL_KEY),
        getItemAsync(FONT_KEY),
        getItemAsync(COLOR_SCHEME_KEY),
      ]);
    if (storedLanguage === "es" || storedLanguage === "en") {
      setLanguage(storedLanguage);
    } else {
      const detectedLanguage = detectDeviceLanguage();
      setLanguage(detectedLanguage);
      await setItemAsync(LANGUAGE_KEY, detectedLanguage);
    }
    if (
      storedCurrency &&
      CURRENCY_OPTIONS.some((option) => option.value === storedCurrency)
    ) {
      setCurrencySymbol(storedCurrency);
    } else {
      const detectedCurrency = detectDeviceCurrencySymbol();
      setCurrencySymbol(detectedCurrency);
      await setItemAsync(CURRENCY_SYMBOL_KEY, detectedCurrency);
    }
    if (
      storedFont === "system" ||
      FONT_PREFERENCES.includes(storedFont as FontPreference)
    ) {
      const preference: FontPreference =
        storedFont === "system" ? "dmsans" : (storedFont as FontPreference);
      setFontPreference(preference);
      setAppFontPreference(preference);
      if (storedFont === "system") await setItemAsync(FONT_KEY, preference);
    }
    if (COLOR_SCHEME_PREFERENCES.includes(storedColorScheme as ColorSchemePreference)) {
      setColorScheme(storedColorScheme as ColorSchemePreference);
    }
  }, [setColorScheme]);

  const saveLanguage = useCallback((next: string) => {
    const value = next === "en" ? "en" : "es";
    setLanguage(value);
    setItemAsync(LANGUAGE_KEY, value).catch(() => undefined);
  }, []);

  const saveCurrencySymbol = useCallback((next: string) => {
    setCurrencySymbol(next);
    setItemAsync(CURRENCY_SYMBOL_KEY, next).catch(() => undefined);
  }, []);

  const saveFontPreference = useCallback((next: string) => {
    const value = FONT_PREFERENCES.includes(next as FontPreference)
      ? (next as FontPreference)
      : "dmsans";
    setAppFontPreference(value);
    setFontPreference(value);
    setItemAsync(FONT_KEY, value).catch(() => undefined);
  }, []);

  const saveColorScheme = useCallback((next: string) => {
    const value = COLOR_SCHEME_PREFERENCES.includes(next as ColorSchemePreference)
      ? (next as ColorSchemePreference)
      : "lime";
    setColorScheme(value);
    setItemAsync(COLOR_SCHEME_KEY, value).catch(() => undefined);
  }, [setColorScheme]);

  return {
    language,
    currencySymbol,
    fontPreference,
    copy,
    uiMonthNames,
    saveLanguage,
    saveCurrencySymbol,
    saveFontPreference,
    saveColorScheme,
    restorePreferences,
  };
}
