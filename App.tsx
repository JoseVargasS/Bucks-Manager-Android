import Constants from "expo-constants";
import { BlurView } from "expo-blur";
import {
  cacheDirectory,
  writeAsStringAsync,
  deleteAsync,
  copyAsync,
} from "expo-file-system/legacy";
import { printToFileAsync } from "expo-print";
import {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
} from "expo-secure-store";
import { shareAsync } from "expo-sharing";
import {
  preventAutoHideAsync,
  setOptions as setSplashOptions,
  hideAsync,
} from "expo-splash-screen";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  Pressable,
  useWindowDimensions,
  View,
  StatusBar as NativeStatusBar,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from "react-native-svg";

import {
  applySearch,
  buildTransactionFromDraft,
  calculateSummaries,
  formatDateToISO,
  insertChronologically,
  MONTH_NAMES,
  recalculateSummariesForMonths,
  SHEET_NAMES,
  uniqueMonthKeys,
} from "./src/domain/bucksLogic";
import {
  createBucksSpreadsheet,
  findCompatibleSheets,
  moveTransaction as moveGoogleTransaction,
  readSummaries,
  readTransactions,
  saveTransaction,
  insertTransactionAtRow,
  updateTransaction as updateGoogleTransaction,
  deleteTransaction as deleteGoogleTransaction,
} from "./src/api/googleWorkspace";
import { ColorSchemePreference, getPalette, Palette } from "./src/theme/colors";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import {
  getBlankDraft,
  sortTransactionsDesc,
  filterTransactionsByRollingPeriod,
} from "./src/utils/transactions";
import { formatMoney } from "./src/domain/bucksLogic";
import { formatCreatedTime } from "./src/utils/formats";
import {
  loadHistory,
  addHistoryEntry,
  removeHistoryEntry,
} from "./src/utils/history";
import { isPinEnabled, savePin, verifyPin, clearPin } from "./src/utils/pin";
import { loadTags, migrateTransactionTags } from "./src/utils/tags";
import {
  deleteFinancialCache,
  loadFinancialCache,
  saveFinancialCache,
} from "./src/data/localCache";
import { styles } from "./src/styles/globalStyles";
import { BottomNav } from "./src/components/layout/BottomNav";
import { PeriodControls } from "./src/components/layout/PeriodControls";
import { LoginScreen } from "./src/components/screens/LoginScreen";
import { ExpensesView } from "./src/components/screens/ExpensesView";
import { SummaryView } from "./src/components/screens/SummaryView";
import { SettingsView } from "./src/components/screens/SettingsView";
import { PinScreen } from "./src/components/screens/PinScreen";
import {
  TransactionModal,
  TransactionModalHandle,
} from "./src/components/modals/TransactionModal";
import {
  DetailModal,
  DetailModalHandle,
} from "./src/components/modals/DetailModal";
import { ExportModal, ExportConfig } from "./src/components/modals/ExportModal";
import {
  ConfirmModal,
  ConfirmConfig,
} from "./src/components/modals/ConfirmModal";
import { HistoryModal } from "./src/components/modals/HistoryModal";
import { PinSetupModal } from "./src/components/modals/PinSetupModal";
import {
  SearchModal,
  SearchModalHandle,
  emptySearchFilters,
} from "./src/components/modals/SearchModal";
import { TagEditorModal } from "./src/components/modals/TagEditorModal";
import {
  OptionSheet,
  OptionSheetHandle,
} from "./src/components/modals/OptionSheet";
import {
  getAppFontFamily,
  setAppFontPreference,
  Text,
} from "./src/components/ui/AppText";
import {
  HistoryEntry,
  SearchFilters,
  SummaryRow,
  Tab,
  LanguageMode,
  FontPreference,
  MaterialIconName,
  Tag,
  Transaction,
  TransactionDraft,
} from "./src/types";
import {
  buildExportFileName,
  getPeriodRange,
  getAvailableMonthsForYear,
  detectDeviceCurrencySymbol,
  detectDeviceLanguage,
} from "./src/utils/helpers";
import { UI_COPY, UI_MONTH_NAMES, UiCopy } from "./src/i18n";
import {
  ANIM_SPLASH_DURATION,
  ANIM_TAB_PAGER,
  ANIM_HEADER_BTN_IN,
  ANIM_HEADER_BTN_OUT,
  PIN_DELAY_MS,
  SPLASH_BG,
  SPLASH_SPINNER,
  SPLASH_INDICATOR_OFFSET,
} from "./src/theme/constants";

preventAutoHideAsync().catch(() => undefined);
setSplashOptions({ duration: ANIM_SPLASH_DURATION, fade: true });

const GOOGLE_ANDROID_CLIENT_ID =
  Constants.expoConfig?.extra?.googleAndroidClientId || "";
const GOOGLE_WEB_CLIENT_ID =
  Constants.expoConfig?.extra?.googleWebClientId || "";
const TOKEN_KEY = "bucks_google_access_token";
const SHEET_KEY = "bucks_spreadsheet_id";
const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];
// ponytail: module-level promise chain serializes every Sheets mutation so a
// fast edit cannot race with the reconcile read of an earlier edit. The chain
// holds the in-flight task only; UI state lives in pendingSyncRef/setPendingSync.
let syncQueue: Promise<void> = Promise.resolve();
const LANGUAGE_KEY = "bucks_language";
const CURRENCY_SYMBOL_KEY = "bucks_currency_symbol";
const FONT_KEY = "bucks_font";
const COLOR_SCHEME_KEY = "bucks_color_scheme";
const FONT_PREFERENCES: FontPreference[] = [
  "dmsans",
  "serif",
  "mono",
  "condensed",
  "light",
  "casual",
  "cursive",
  "smallcaps",
];
const COLOR_SCHEME_PREFERENCES: ColorSchemePreference[] = [
  "lime",
  "ocean",
  "violet",
  "amber",
  "graphite",
];
const COLOR_SCHEME_OPTIONS: Array<{
  value: ColorSchemePreference;
  labelEs: string;
  labelEn: string;
  icon: MaterialIconName;
}> = [
  {
    value: "lime",
    labelEs: "Lima Bucks",
    labelEn: "Bucks Lime",
    icon: "sprout",
  },
  { value: "ocean", labelEs: "Océano", labelEn: "Ocean", icon: "waves" },
  {
    value: "violet",
    labelEs: "Violeta",
    labelEn: "Violet",
    icon: "circle-multiple-outline",
  },
  {
    value: "amber",
    labelEs: "Ámbar",
    labelEn: "Amber",
    icon: "white-balance-sunny",
  },
  {
    value: "graphite",
    labelEs: "Grafito",
    labelEn: "Graphite",
    icon: "circle-half-full",
  },
];
const CURRENCY_OPTIONS = [
  {
    labelEs: "Soles peruanos (S/)",
    labelEn: "Peruvian soles (S/)",
    value: "S/",
    icon: "cash" as const,
  },
  {
    labelEs: "Dólares ($)",
    labelEn: "US dollars ($)",
    value: "$",
    icon: "currency-usd" as const,
  },
  {
    labelEs: "Euros (€)",
    labelEn: "Euros (€)",
    value: "€",
    icon: "currency-eur" as const,
  },
  {
    labelEs: "Libras (£)",
    labelEn: "Pounds (£)",
    value: "£",
    icon: "currency-gbp" as const,
  },
  {
    labelEs: "Yenes (¥)",
    labelEn: "Yen (¥)",
    value: "¥",
    icon: "currency-jpy" as const,
  },
  {
    labelEs: "Reales (R$)",
    labelEn: "Brazilian reais (R$)",
    value: "R$",
    icon: "currency-brl" as const,
  },
  {
    labelEs: "Pesos mexicanos (MX$)",
    labelEn: "Mexican pesos (MX$)",
    value: "MX$",
    icon: "cash" as const,
  },
  {
    labelEs: "Pesos colombianos (COP$)",
    labelEn: "Colombian pesos (COP$)",
    value: "COP$",
    icon: "cash" as const,
  },
  {
    labelEs: "Pesos chilenos (CLP$)",
    labelEn: "Chilean pesos (CLP$)",
    value: "CLP$",
    icon: "cash" as const,
  },
];
const TAB_ORDER: Tab[] = ["expenses", "summary", "settings"];

function AppContent() {
  const { colors, theme, colorScheme, toggleTheme, setColorScheme } =
    useTheme();
  const themeProgress = useRef(
    new Animated.Value(theme === "dark" ? 1 : 0),
  ).current;
  const themeAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const themeBgDark = useMemo(() => getPalette("dark", colorScheme).bg, [colorScheme]);
  const themeBgLight = useMemo(() => getPalette("light", colorScheme).bg, [colorScheme]);
  const themeProgressBg = useMemo(
    () =>
      themeProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [themeBgLight, themeBgDark],
      }),
    [themeProgress, themeBgLight, themeBgDark],
  );
  const toggleThemeWithCrossfade = useCallback(() => {
    const goingDark = theme !== "dark";
    const target = goingDark ? 1 : 0;
    themeAnimRef.current?.stop();
    themeAnimRef.current = Animated.timing(themeProgress, {
      toValue: target,
      duration: 180,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    themeAnimRef.current.start();
    toggleTheme();
  }, [theme, themeProgress, toggleTheme]);
  const [language, setLanguage] = useState<LanguageMode>(detectDeviceLanguage);
  const copy = UI_COPY[language];
  const [currencySymbol, setCurrencySymbol] = useState(
    detectDeviceCurrencySymbol,
  );
  const [fontPreference, setFontPreference] =
    useState<FontPreference>("dmsans");
  const [tab, setTab] = useState<Tab>("expenses");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [accessToken, setAccessToken] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);
  const [accountTransition, setAccountTransition] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFirstRemoteLoad, setIsFirstRemoteLoad] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [authError, setAuthError] = useState("");
  const [pendingSync, setPendingSync] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [freqIncome, setFreqIncome] = useState<Record<string, number>>({});
  const [accountInfo, setAccountInfo] = useState<{
    name?: string;
    email?: string;
  } | null>(null);
  const [searchFilters, setSearchFilters] =
    useState<SearchFilters>(emptySearchFilters);
  const [searchActive, setSearchActive] = useState(false);
  const [loadedMonthCount, setLoadedMonthCount] = useState(1);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    format: "xlsx",
    rangeMode: "dates",
    startDate: "",
    endDate: "",
  });
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(
    null,
  );
  const [pinEnabled, setPinEnabledState] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinLoading, setPinLoading] = useState(true);
  const [pinSetupVisible, setPinSetupVisible] = useState(false);
  const [pinWrong, setPinWrong] = useState(false);
  const [tagsList, setTagsList] = useState<Tag[]>([]);
  const [tagEditorVisible, setTagEditorVisible] = useState(false);
  const pinLockedRef = useRef(false);
  const transactionModalRef = useRef<TransactionModalHandle>(null);
  const detailModalRef = useRef<DetailModalHandle>(null);
  const searchModalRef = useRef<SearchModalHandle>(null);
  const optionSheetRef = useRef<OptionSheetHandle>(null);
  const didSetInitialPeriodRef = useRef(false);
  const reloadPromiseRef = useRef<Promise<void> | null>(null);
  const freqIncomeRef = useRef<Record<string, number>>({});
  const hasLocalDataRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const tabRef = useRef<Tab>(tab);
  const pagerTranslateX = useRef(new Animated.Value(0)).current;
  const { width: tabWidth } = useWindowDimensions();
  const statusBarInset = NativeStatusBar.currentHeight || 0;
  const headerTopInset = statusBarInset + 6;
  const headerFadeHeight = Math.max(headerTopInset + 28, 56);
  const bottomFadeHeight = 128;

  const changeTab = useCallback(
    (next: Tab) => {
      if (next === tabRef.current) return;
      tabRef.current = next;
      pagerTranslateX.stopAnimation();
      Animated.timing(pagerTranslateX, {
        toValue: -TAB_ORDER.indexOf(next) * tabWidth,
        duration: ANIM_TAB_PAGER,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && tabRef.current === next) setTab(next);
      });
    },
    [pagerTranslateX, tabWidth],
  );
  const openHistory = useCallback(() => setHistoryVisible(true), []);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    });
    void Promise.all([
      restorePreferences(),
      restoreSession(),
      restorePinState(),
    ])
      .catch(() => undefined)
      .finally(() => setBootstrapping(false));
    loadHistory()
      .then(setHistoryEntries)
      .catch(() => undefined);

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background") {
        pinLockedRef.current = true;
        setPinVerified(false);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    loadTags(language)
      .then((loaded) => {
        setTagsList(loaded);
        setTransactions((current) => migrateTransactionTags(current, loaded));
        setSummaries((current) => current);
      })
      .catch(() => undefined);
  }, [language]);

  useEffect(() => {
    if (!bootstrapping) hideAsync().catch(() => undefined);
  }, [bootstrapping]);

  // ponytail: only realign the pager when the window width changes; never on tab
  // flips (which would cancel the in-flight Animated.timing mid-gesture).
  const lastTabWidthRef = useRef(tabWidth);
  useEffect(() => {
    if (lastTabWidthRef.current === tabWidth) return;
    lastTabWidthRef.current = tabWidth;
    pagerTranslateX.stopAnimation();
    pagerTranslateX.setValue(-TAB_ORDER.indexOf(tabRef.current) * tabWidth);
  }, [pagerTranslateX, tabWidth]);
  useEffect(() => {
    freqIncomeRef.current = freqIncome;
  }, [freqIncome]);

  useEffect(() => {
    hasLocalDataRef.current = hasLocalData;
  }, [hasLocalData]);

  // --- Derived data ---
  const tagLabelsById = useMemo(() => {
    const map: Record<string, string> = {};
    tagsList.forEach((tag) => {
      map[tag.id] = tag.label;
    });
    return map;
  }, [tagsList]);
  const visibleTransactions = useMemo(() => {
    const source = searchActive
      ? applySearch(transactions, searchFilters, tagLabelsById)
      : filterTransactionsByRollingPeriod(
          transactions,
          month,
          year,
          loadedMonthCount,
        );
    return sortTransactionsDesc(source);
  }, [
    transactions,
    month,
    year,
    loadedMonthCount,
    searchActive,
    searchFilters,
    tagLabelsById,
  ]);

  const currentSummary = useMemo(() => {
    const key = `${MONTH_NAMES[month]} ${year}`;
    return (
      summaries.find((row) => row.monthYear === key) || {
        monthYear: key,
        freqIncome: freqIncome[key] || 0,
        nonFreqIncome: 0,
        totalIncome: freqIncome[key] || 0,
        freqExpense: 0,
        nonFreqExpense: 0,
        totalExpense: 0,
        netMonthly: freqIncome[key] || 0,
        netNoFreq: 0,
      }
    );
  }, [summaries, month, year, freqIncome]);

  const periodRange = useMemo(
    () => getPeriodRange(transactions),
    [transactions],
  );
  const availableYears = useMemo(
    () =>
      Array.from(
        { length: periodRange.maxYear - periodRange.minYear + 1 },
        (_, index) => periodRange.maxYear - index,
      ),
    [periodRange],
  );

  const availableMonths = useMemo(
    () => getAvailableMonthsForYear(year, periodRange),
    [year, periodRange],
  );
  const exportMinDate = useMemo(
    () =>
      transactions.length
        ? transactions
            .reduce(
              (earliest, tx) => (tx.rawDate < earliest ? tx.rawDate : earliest),
              transactions[0].rawDate,
            )
            .slice(0, 10)
        : "",
    [transactions],
  );

  const uiMonthNames =
    copy.languageCode === "en" ? UI_MONTH_NAMES.en : UI_MONTH_NAMES.es;
  const selectedColorScheme =
    COLOR_SCHEME_OPTIONS.find((option) => option.value === colorScheme) ||
    COLOR_SCHEME_OPTIONS[0];
  const colorSchemeLabel =
    language === "en"
      ? selectedColorScheme.labelEn
      : selectedColorScheme.labelEs;
  const savedDataText =
    copy.languageCode === "en" ? "Saved data" : "Datos guardados";
  const isEn = copy.languageCode === "en";
  const syncStatusText = authError
    ? authError
    : syncError
      ? hasLocalData
        ? isEn ? "Showing saved data" : "Mostrando datos guardados"
        : syncError
      : pendingSync
        ? isEn ? "Pending sync" : "Pendiente de sincronizar"
        : isSyncing
          ? hasLocalData
            ? `${savedDataText} · ${copy.syncing.toLowerCase()}`
            : copy.syncing
          : "";
  // --- Session management ---
  async function restoreSession() {
    const [token, sheetId] = await Promise.all([
      getItemAsync(TOKEN_KEY),
      getItemAsync(SHEET_KEY),
    ]);
    if (token && sheetId) {
      setAccessToken(token);
      setSpreadsheetId(sheetId);
      syncAccountInfo();
      const cached = await loadFinancialCache(sheetId);
      if (cached) {
        applyFinancialState(
          cached.transactions,
          cached.summaries,
          cached.freqIncome,
          cached.lastSyncedAt,
          true,
        );
        void refreshStoredSession(token, sheetId, true);
      } else {
        setIsFirstRemoteLoad(true);
        await refreshStoredSession(token, sheetId, false);
      }
    }
  }

  async function restorePinState() {
    try {
      const enabled = await isPinEnabled();
      setPinEnabledState(enabled);
      setPinVerified(!enabled);
      pinLockedRef.current = false;
    } finally {
      setPinLoading(false);
    }
  }

  async function refreshStoredSession(
    token: string,
    sheetId: string,
    hadCache: boolean,
  ) {
    let activeToken = token;
    try {
      const fresh = await getWorkspaceAccessToken(false);
      activeToken = fresh.accessToken || token;
      setAuthError("");
      setAccessToken(activeToken);
      syncAccountInfo();
      await setItemAsync(TOKEN_KEY, activeToken);
      await reloadFromGoogle(activeToken, sheetId, false);
    } catch (error) {
      if (isAuthError(error)) {
        setAuthError(getErrorMessage(error));
        if (!hadCache) await disconnectGoogle();
      } else if (shouldRescanForSheetError(error)) {
        await connectGoogleWorkspace(activeToken, "", true);
      } else if (!hadCache) {
        setSyncError(getErrorMessage(error));
      }
    } finally {
      setIsFirstRemoteLoad(false);
    }
  }

  async function restorePreferences() {
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
      if (storedFont === "system")
        await setItemAsync(FONT_KEY, preference);
    }
    if (
      COLOR_SCHEME_PREFERENCES.includes(
        storedColorScheme as ColorSchemePreference,
      )
    ) {
      setColorScheme(storedColorScheme as ColorSchemePreference);
    }
  }

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
    const value = COLOR_SCHEME_PREFERENCES.includes(
      next as ColorSchemePreference,
    )
      ? (next as ColorSchemePreference)
      : "lime";
    setColorScheme(value);
    setItemAsync(COLOR_SCHEME_KEY, value).catch(() => undefined);
  }, []);

  const openLanguagePicker = useCallback(() => {
    optionSheetRef.current?.open({
      title: copy.language,
      selectedValue: language,
      options: [
        { label: copy.spanish, value: "es", icon: "translate" },
        { label: copy.english, value: "en", icon: "translate" },
      ],
      onSelect: saveLanguage,
    });
  }, [copy, language, saveLanguage]);

  const openCurrencyPicker = useCallback(() => {
    optionSheetRef.current?.open({
      title: copy.currencySymbol,
      selectedValue: currencySymbol,
      options: CURRENCY_OPTIONS.map((option) => ({
        label: language === "en" ? option.labelEn : option.labelEs,
        value: option.value,
        icon: option.icon,
      })),
      onSelect: saveCurrencySymbol,
    });
  }, [copy.currencySymbol, currencySymbol, language, saveCurrencySymbol]);

  const openFontPicker = useCallback(() => {
    optionSheetRef.current?.open({
      title: copy.fontStyle,
      selectedValue: fontPreference,
      options: [
        {
          label: copy.system,
          value: "dmsans",
          icon: "format-font",
          fontFamily: getAppFontFamily("dmsans"),
        },
        {
          label: copy.serif,
          value: "serif",
          icon: "format-letter-case",
          fontFamily: getAppFontFamily("serif"),
        },
        {
          label: copy.mono,
          value: "mono",
          icon: "code-tags",
          fontFamily: getAppFontFamily("mono"),
        },
        {
          label: copy.condensed,
          value: "condensed",
          icon: "format-letter-spacing",
          fontFamily: getAppFontFamily("condensed"),
        },
        {
          label: copy.lightFont,
          value: "light",
          icon: "feather",
          fontFamily: getAppFontFamily("light"),
        },
        {
          label: copy.casual,
          value: "casual",
          icon: "draw",
          fontFamily: getAppFontFamily("casual"),
        },
        {
          label: copy.cursive,
          value: "cursive",
          icon: "fountain-pen-tip",
          fontFamily: getAppFontFamily("cursive"),
        },
        {
          label: copy.smallCaps,
          value: "smallcaps",
          icon: "format-letter-case-upper",
          fontFamily: getAppFontFamily("smallcaps"),
        },
      ],
      onSelect: saveFontPreference,
    });
  }, [copy, fontPreference, saveFontPreference]);

  const openColorSchemePicker = useCallback(() => {
    optionSheetRef.current?.open({
      title: copy.colorPalette,
      selectedValue: colorScheme,
      options: COLOR_SCHEME_OPTIONS.map((option) => ({
        label: language === "en" ? option.labelEn : option.labelEs,
        value: option.value,
        icon: option.icon,
        tone: getPalette(theme, option.value).primary,
      })),
      onSelect: saveColorScheme,
    });
  }, [colorScheme, copy.colorPalette, language, saveColorScheme, theme]);

  const openAccountManager = useCallback(() => {
    optionSheetRef.current?.open({
      title: copy.googleAccounts,
      selectedValue: "",
      options: [
        { label: copy.switchAccount, value: "switch", icon: "account-switch" },
        {
          label: copy.removeCurrentAccount,
          value: "remove",
          icon: "account-remove",
          tone: colors.red,
        },
      ],
      onSelect: (value) => {
        if (value === "switch") void runGoogleSignIn(true);
        if (value === "remove") setConfirmConfig({ kind: "removeAccount" });
      },
    });
  }, [colors.red, copy]);

  async function getWorkspaceAccessToken(interactive: boolean) {
    let current = GoogleSignin.getCurrentUser();
    if (!current) {
      const silent = await GoogleSignin.signInSilently();
      current = silent.type === "success" ? silent.data : null;
    }
    const grantedScopes = new Set(current?.scopes || []);
    const hasWorkspaceScopes = GOOGLE_WORKSPACE_SCOPES.every((scope) =>
      grantedScopes.has(scope),
    );
    if (!hasWorkspaceScopes) {
      if (!interactive) throw new Error("Faltan permisos de Google Workspace.");
      const response = await GoogleSignin.addScopes({
        scopes: GOOGLE_WORKSPACE_SCOPES,
      });
      if (!response || response.type !== "success")
        throw new Error("No se autorizaron los permisos de Drive y Sheets.");
    }
    return GoogleSignin.getTokens();
  }

  async function connectGoogleWorkspace(
    token: string,
    preferredSheetId = "",
    forceScan = false,
  ) {
    setLoading(true);
    setIsSyncing(true);
    try {
      if (preferredSheetId && !forceScan) {
        try {
          await selectSpreadsheet(token, preferredSheetId, false);
          return;
        } catch (error) {
          if (!shouldRescanForSheetError(error)) throw error;
        }
      }
      const candidates = await findCompatibleSheets(token);
      const namedSheet = candidates.find(
        (c) => c.name.trim().toUpperCase() === SHEET_NAMES.transactions,
      );
      if (namedSheet) {
        await selectSpreadsheet(token, namedSheet.id);
        return;
      }
      const sheetId = await createBucksSpreadsheet(token);
      await selectSpreadsheet(token, sheetId);
    } catch (error) {
      setSyncError(getErrorMessage(error));
      if (!hasLocalDataRef.current)
        Alert.alert("Google Sheets", getErrorMessage(error));
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }

  async function selectSpreadsheet(
    token: string,
    sheetId: string,
    showLoader = true,
  ) {
    setLoading(true);
    try {
      await setItemAsync(TOKEN_KEY, token);
      await setItemAsync(SHEET_KEY, sheetId);
      setAccessToken(token);
      setSpreadsheetId(sheetId);
      await reloadFromGoogle(token, sheetId, showLoader);
    } finally {
      setLoading(false);
    }
  }

  async function runGoogleSignIn(switchingAccount: boolean) {
    if (!GOOGLE_ANDROID_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID) {
      Alert.alert(copy.googleOAuth, copy.missingEnvCredentials);
      return;
    }
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      if (switchingAccount) await GoogleSignin.signOut();
      const response = await GoogleSignin.signIn();
      if (response.type !== "success") return;
      const tokens = await getWorkspaceAccessToken(true);
      if (!tokens.accessToken)
        throw new Error("Google no devolvió access token.");
      if (switchingAccount) {
        setAccountTransition(true);
        await Promise.all([
          deleteItemAsync(SHEET_KEY),
          deleteFinancialCache(),
        ]);
        resetFinancialState();
      }
      await setItemAsync(TOKEN_KEY, tokens.accessToken);
      setAccessToken(tokens.accessToken);
      setIsFirstRemoteLoad(true);
      setSyncError("");
      syncAccountInfo();
      await connectGoogleWorkspace(tokens.accessToken, "", true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : copy.googleSignInError;
      const isDeveloperError =
        message.includes("DEVELOPER_ERROR") || message.includes("code: 10");
      Alert.alert(
        "Google",
        isDeveloperError
          ? copy.oauthConfigRejected
          : message,
      );
    } finally {
      setLoading(false);
      setIsFirstRemoteLoad(false);
      setAccountTransition(false);
    }
  }

  async function signInWithGoogle() {
    await runGoogleSignIn(false);
  }

  function syncAccountInfo() {
    const current = GoogleSignin.getCurrentUser();
    const data = ((
      current as { data?: { user: { name?: string; email?: string } } }
    )?.data || current) as {
      user?: { name?: string; email?: string };
      name?: string;
      email?: string;
    };
    if (data)
      setAccountInfo({
        name: data.user?.name || data.name,
        email: data.user?.email || data.email,
      });
  }

  function applyFinancialState(
    nextTransactions: Transaction[],
    nextSummaries: SummaryRow[],
    nextFreqIncome: Record<string, number>,
    syncedAt: string | null,
    fromCache = false,
  ) {
    const summariesToUse = nextSummaries.length
      ? nextSummaries
      : calculateSummaries(nextTransactions, nextFreqIncome);
    setTransactions(nextTransactions);
    setSummaries(summariesToUse);
    setFreqIncome(nextFreqIncome);
    freqIncomeRef.current = nextFreqIncome;
    setLastSyncedAt(syncedAt);
    const nextHasLocalData = nextTransactions.length > 0 || summariesToUse.length > 0;
    setHasLocalData(nextHasLocalData);
    hasLocalDataRef.current = nextHasLocalData;
    if (fromCache || nextTransactions.length)
      updateInitialPeriod(nextTransactions);
  }

  function persistFinancialState(
    nextTransactions: Transaction[],
    nextSummaries: SummaryRow[],
    nextFreqIncome: Record<string, number>,
    syncedAt = lastSyncedAt,
    sheetId = spreadsheetId,
  ) {
    const summariesToUse = nextSummaries.length
      ? nextSummaries
      : calculateSummaries(nextTransactions, nextFreqIncome);
    const nextHasLocalData = nextTransactions.length > 0 || summariesToUse.length > 0;
    setHasLocalData(nextHasLocalData);
    hasLocalDataRef.current = nextHasLocalData;
    if (!sheetId) return;
    saveFinancialCache({
      spreadsheetId: sheetId,
      transactions: nextTransactions,
      summaries: summariesToUse,
      freqIncome: nextFreqIncome,
      lastSyncedAt: syncedAt,
    }).catch(() => undefined);
  }

  function updateInitialPeriod(source: Transaction[]) {
    if (didSetInitialPeriodRef.current || !source.length) return;
    const today = new Date();
    let latest: Date | null = null;
    for (const tx of source) {
      const date = new Date(tx.rawDate);
      if (Number.isNaN(date.getTime()) || date > today) continue;
      if (!latest || date.getTime() > latest.getTime()) latest = date;
    }
    if (latest) {
      setMonth(latest.getMonth());
      setYear(latest.getFullYear());
      setLoadedMonthCount(1);
    }
    didSetInitialPeriodRef.current = true;
  }

  function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : copy.syncError;
  }

  function isAuthError(error: unknown) {
    const message = getErrorMessage(error);
    return (
      message.includes("401") ||
      message.includes("403") ||
      message.toLowerCase().includes("permiso")
    );
  }

  function shouldRescanForSheetError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return (
      message.includes("404") ||
      message.includes("not found") ||
      message.includes("unable to parse range") ||
      message.includes("no se encontro") ||
      message.includes("no se encontró")
    );
  }

  function resetFinancialState() {
    setSpreadsheetId("");
    setTransactions([]);
    setSummaries([]);
    setFreqIncome({});
    freqIncomeRef.current = {};
    setAccountInfo(null);
    setHasLocalData(false);
    hasLocalDataRef.current = false;
    setLastSyncedAt(null);
    setSyncError("");
    setAuthError("");
    setPendingSync(false);
    setIsSyncing(false);
    pendingSyncRef.current = false;
    didSetInitialPeriodRef.current = false;
  }

  async function clearGoogleSession() {
    try {
      await Promise.all([
        deleteItemAsync(TOKEN_KEY),
        deleteItemAsync(SHEET_KEY),
        deleteFinancialCache(),
      ]);
    } finally {
      setAccessToken("");
      resetFinancialState();
    }
  }

  async function disconnectGoogle() {
    try {
      await GoogleSignin.signOut();
    } catch {
      /* ok */
    }
    await clearGoogleSession();
  }

  const requestDisconnectGoogle = useCallback(() => {
    setConfirmConfig({ kind: "disconnect" });
  }, []);

  async function removeGoogleAccount() {
    setLoading(true);
    setAccountTransition(true);
    try {
      await GoogleSignin.revokeAccess();
      await clearGoogleSession();
    } catch (error) {
      Alert.alert("Google", getErrorMessage(error));
    } finally {
      setLoading(false);
      setAccountTransition(false);
    }
  }

  // --- Data operations ---
  async function reloadFromGoogle(
    token = accessToken,
    sheetId = spreadsheetId,
    showLoader = true,
    forceFresh = false,
  ) {
    if (!token || !sheetId) return;
    if (pendingSyncRef.current && !forceFresh) return;
    if (reloadPromiseRef.current) {
      if (!forceFresh) return reloadPromiseRef.current;
      await reloadPromiseRef.current.catch(() => undefined);
    }
    const task = (async () => {
      if (showLoader) setLoading(true);
      setIsSyncing(true);
      setSyncError("");
      if (!hasLocalDataRef.current && !transactions.length)
        setIsFirstRemoteLoad(true);
      const [tx, summary] = await Promise.all([
        readTransactions(token, sheetId),
        readSummaries(token, sheetId),
      ]);
      if (pendingSyncRef.current && !forceFresh) {
        if (showLoader) setLoading(false);
        setIsSyncing(false);
        setIsFirstRemoteLoad(false);
        reloadPromiseRef.current = null;
        return;
      }
      const nextFreqIncome = summary.length
        ? Object.fromEntries(summary.map((row) => [row.monthYear, row.freqIncome]))
        : freqIncomeRef.current;
      const nextSummaries = summary.length
        ? summary
        : calculateSummaries(tx, nextFreqIncome);
      const syncedAt = new Date().toISOString();
      applyFinancialState(tx, nextSummaries, nextFreqIncome, syncedAt);
      persistFinancialState(
        tx,
        nextSummaries,
        nextFreqIncome,
        syncedAt,
        sheetId,
      );
      if (!forceFresh) setPendingSync(false);
      if (showLoader) setLoading(false);
      setIsSyncing(false);
      setIsFirstRemoteLoad(false);
      reloadPromiseRef.current = null;
    })().catch((error) => {
      setSyncError(getErrorMessage(error));
      if (showLoader) setLoading(false);
      setIsSyncing(false);
      setIsFirstRemoteLoad(false);
      reloadPromiseRef.current = null;
      throw error;
    });
    reloadPromiseRef.current = task;
    return task;
  }

  const selectPeriod = useCallback(
    (nextMonth: number, nextYear: number) => {
      const validMonths = getAvailableMonthsForYear(nextYear, periodRange);
      const clampedMonth = validMonths.includes(nextMonth)
        ? nextMonth
        : validMonths.reduce(
            (closest, item) =>
              Math.abs(item - nextMonth) < Math.abs(closest - nextMonth)
                ? item
                : closest,
            validMonths[0] ?? nextMonth,
          );
      setMonth(clampedMonth);
      setYear(nextYear);
      setSearchActive(false);
      setLoadedMonthCount(1);
      setSelectedRows([]);
    },
    [periodRange],
  );
  const goToday = useCallback(() => {
    const today = new Date();
    selectPeriod(today.getMonth(), today.getFullYear());
  }, [selectPeriod]);

  const shiftMonth = useCallback((delta: number) => {
    const total = month + delta;
    const nextMonth = (total + 12) % 12;
    selectPeriod(nextMonth, year + Math.floor(total / 12));
  }, [month, year, selectPeriod]);
  const goPrevMonth = useCallback(() => shiftMonth(-1), [shiftMonth]);
  const goNextMonth = useCallback(() => shiftMonth(1), [shiftMonth]);

  const openAdd = useCallback(() => {
    transactionModalRef.current?.open(getBlankDraft());
  }, []);

  const openEdit = useCallback((tx: Transaction) => {
    detailModalRef.current?.close();
    transactionModalRef.current?.open(
      {
        date: formatDateToISO(tx.rawDate),
        amount: tx.formula ? `=${tx.formula}` : String(tx.amount),
        detail: tx.detail,
        type: tx.type,
        createdAt: tx.createdAt,
        tags: tx.tags || [],
      },
      tx,
    );
    requestAnimationFrame(() => setSelectedRows([]));
  }, []);

  function renumberTransactions(items: Transaction[]) {
    return items.map((item, idx) => ({ ...item, rowId: idx + 2 }));
  }

  function syncGoogleInBackground(task: () => Promise<void>, title: string) {
    pendingSyncRef.current = true;
    setIsSyncing(true);
    setPendingSync(true);
    setSyncError("");
    syncQueue = syncQueue
      .catch(() => undefined)
      .then(() => task())
      .then(() => {
        pendingSyncRef.current = false;
        setPendingSync(false);
      })
      .catch((error) => {
        pendingSyncRef.current = true;
        setPendingSync(true);
        setSyncError(getErrorMessage(error) || title);
      })
      .finally(() => setIsSyncing(false));
  }
  const requestDelete = useCallback((tx: Transaction) => {
    setConfirmConfig({ kind: "delete", tx });
  }, []);

  const requestDeleteSelected = useCallback(() => {
    if (!selectedRows.length) return;
    setConfirmConfig({ kind: "deleteSelected", count: selectedRows.length });
  }, [selectedRows.length]);

  function handleConfirm(cfg: ConfirmConfig) {
    if (cfg.kind === "delete" && cfg.tx) deleteTx(cfg.tx);
    else if (cfg.kind === "deleteSelected") deleteSelectedRows();
    else if (cfg.kind === "removeAccount") void removeGoogleAccount();
    else if (cfg.kind === "disconnect") void disconnectGoogle();
  }

  function submitDraft(
    currentDraft: TransactionDraft,
    currentEdit: Transaction | null,
  ): boolean {
    if (
      !currentDraft.date ||
      !currentDraft.amount ||
      !currentDraft.detail.trim()
    ) {
      Alert.alert(copy.incompleteData, copy.completeRequired);
      return false;
    }
    const currentTransactions = transactions;
    const currentFreqIncome = freqIncome;
    const token = accessToken;
    const sheetId = spreadsheetId;
    if (token && sheetId) {
      pendingSyncRef.current = true;
    }

    requestAnimationFrame(() => {
      const optimistic = buildTransactionFromDraft(
        currentDraft,
        currentEdit?.rowId || currentTransactions.length + 2,
      );
      const next = currentEdit
        ? renumberTransactions(
            insertChronologically(
              currentTransactions.filter(
                (tx) => tx.rowId !== currentEdit.rowId,
              ),
              optimistic,
            ),
          )
        : renumberTransactions(
            insertChronologically(currentTransactions, optimistic),
          );
      const affectedMonths = currentEdit
        ? uniqueMonthKeys([currentEdit, optimistic])
        : uniqueMonthKeys([optimistic]);
      const nextSummaries = recalculateSummariesForMonths(
        next,
        currentFreqIncome,
        affectedMonths,
        summaries,
      );
      setTransactions(next);
      setSummaries(nextSummaries);
      persistFinancialState(next, nextSummaries, currentFreqIncome);

      if (token && sheetId) {
        syncGoogleInBackground(
          async () => {
            if (currentEdit) {
              await updateGoogleTransaction(
                token,
                sheetId,
                currentEdit.rowId,
                currentDraft,
              );
            } else {
              await saveTransaction(token, sheetId, currentDraft);
            }
            await reloadFromGoogle(token, sheetId, false, true);
          },
          currentEdit ? copy.editRecord : copy.newRecord,
        );
      }
    });
    return true;
  }

  const applySearchFilters = useCallback(
    (nextFilters: SearchFilters) => {
      requestAnimationFrame(() => {
        setSearchFilters(nextFilters);
        setSearchActive(true);
        changeTab("expenses");
        setSelectedRows([]);
      });
    },
    [changeTab],
  );

  const clearSearchFilters = useCallback(() => {
    requestAnimationFrame(() => {
      setSearchFilters(emptySearchFilters);
      setSearchActive(false);
    });
  }, []);

  async function deleteTx(tx: Transaction) {
    setSelectedRows((current) => current.filter((rowId) => rowId !== tx.rowId));
    const next = renumberTransactions(
      transactions.filter((item) => item.rowId !== tx.rowId),
    );
    const affectedMonths = uniqueMonthKeys([tx]);
    const nextSummaries = recalculateSummariesForMonths(
      next,
      freqIncome,
      affectedMonths,
      summaries,
    );
    setTransactions(next);
    setSummaries(nextSummaries);
    persistFinancialState(next, nextSummaries, freqIncome);
    addHistoryEntry({ action: "delete", transaction: tx })
      .then((entry) => {
        setHistoryEntries((prev) => [entry, ...prev]);
      })
      .catch(() => undefined);
    if (accessToken && spreadsheetId) {
      syncGoogleInBackground(async () => {
        await deleteGoogleTransaction(accessToken, spreadsheetId, tx.rowId);
        await reloadFromGoogle(accessToken, spreadsheetId, false, true);
      }, copy.deleteRecord);
    }
  }

  async function deleteSelectedRows() {
    const selectedIds = new Set(selectedRows);
    const selected = transactions
      .filter((tx) => selectedIds.has(tx.rowId))
      .sort((a, b) => b.rowId - a.rowId);
    if (!selected.length) return;
    const next = renumberTransactions(
      transactions.filter((item) => !selectedIds.has(item.rowId)),
    );
    const affectedMonths = uniqueMonthKeys(selected);
    const nextSummaries = recalculateSummariesForMonths(
      next,
      freqIncome,
      affectedMonths,
      summaries,
    );
    setTransactions(next);
    setSummaries(nextSummaries);
    persistFinancialState(next, nextSummaries, freqIncome);
    setSelectedRows([]);
    for (const tx of selected) {
      addHistoryEntry({ action: "delete", transaction: tx })
        .then((entry) => {
          setHistoryEntries((prev) => [entry, ...prev]);
        })
        .catch(() => undefined);
    }
    if (accessToken && spreadsheetId) {
      syncGoogleInBackground(async () => {
        for (const tx of selected)
          await deleteGoogleTransaction(accessToken, spreadsheetId, tx.rowId);
        await reloadFromGoogle(accessToken, spreadsheetId, false, true);
      }, "Eliminar seleccion");
    }
  }

  const toggleSelection = useCallback((tx: Transaction) => {
    setSelectedRows((current) =>
      current.includes(tx.rowId)
        ? current.filter((r) => r !== tx.rowId)
        : [...current, tx.rowId],
    );
  }, []);

  const handleTransactionPress = useCallback(
    (tx: Transaction) => {
      if (selectedRows.length) {
        toggleSelection(tx);
        return;
      }
      detailModalRef.current?.open(tx);
    },
    [selectedRows.length, toggleSelection],
  );

  const moveTx = useCallback(
    async (tx: Transaction, direction: "up" | "down") => {
      try {
        if (accessToken && spreadsheetId) {
          syncGoogleInBackground(async () => {
            await moveGoogleTransaction(
              accessToken,
              spreadsheetId,
              tx.rowId,
              direction,
            );
            await reloadFromGoogle(accessToken, spreadsheetId, false, true);
          }, "Mover registro");
          return;
        }
        const index = transactions.findIndex((item) => item.rowId === tx.rowId);
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || targetIndex < 0 || targetIndex >= transactions.length)
          return;
        const next = [...transactions];
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        const moved = next.map((item, idx) => ({ ...item, rowId: idx + 2 }));
        const nextSummaries = recalculateSummariesForMonths(
          moved,
          freqIncome,
          [],
          summaries,
        );
        setTransactions(moved);
        setSummaries(nextSummaries);
        persistFinancialState(moved, nextSummaries, freqIncome);
      } catch (error) {
        Alert.alert(
          copy.moveRecord,
          error instanceof Error
            ? error.message
            : copy.moveRecordError,
        );
      }
    },
    [accessToken, copy, freqIncome, spreadsheetId, transactions],
  );

  const openMoveMenu = useCallback(
    (tx: Transaction) => {
      optionSheetRef.current?.open({
        title: copy.moveRecord,
        selectedValue: "",
        options: [
          {
            label: copy.moveUpOnePosition,
            value: "up",
            icon: "arrow-up",
            tone: colors.blue,
          },
          {
            label: copy.moveDownOnePosition,
            value: "down",
            icon: "arrow-down",
            tone: colors.yellow,
          },
        ],
        onSelect: (direction: string) => moveTx(tx, direction as "up" | "down"),
      });
    },
    [colors.blue, colors.yellow, moveTx],
  );

  async function undoDeleteEntry(entry: HistoryEntry) {
    const entryId = entry.id;
    setHistoryEntries((prev) => prev.filter((e) => e.id !== entryId));
    removeHistoryEntry(entryId).catch(() => undefined);

    const next = [...transactions, entry.transaction].sort(
      (a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime(),
    );
    const restored = next.map((item, idx) => ({ ...item, rowId: idx + 2 }));
    const affectedMonths = uniqueMonthKeys([entry.transaction]);
    const nextSummaries = recalculateSummariesForMonths(
      restored,
      freqIncome,
      affectedMonths,
      summaries,
    );
    setTransactions(restored);
    setSummaries(nextSummaries);
    persistFinancialState(restored, nextSummaries, freqIncome);
    if (accessToken && spreadsheetId) {
      const draft: TransactionDraft = {
        date: formatDateToISO(entry.transaction.rawDate),
        amount: entry.transaction.formula
          ? `=${entry.transaction.formula}`
          : String(Math.abs(entry.transaction.amount)),
        detail: entry.transaction.detail,
        type: entry.transaction.type,
        createdAt: entry.transaction.createdAt,
        tags: entry.transaction.tags || [],
      };
      syncGoogleInBackground(async () => {
        await insertTransactionAtRow(
          accessToken,
          spreadsheetId,
          draft,
          entry.transaction.rowId,
        );
        await reloadFromGoogle(accessToken, spreadsheetId, false, true);
      }, "Deshacer");
    }
  }

  const handlePinOpen = useCallback(() => {
    if (pinEnabled) {
      pinLockedRef.current = false;
      setPinEnabledState(false);
      setPinVerified(true);
      void clearPin().catch((error) => {
        setPinEnabledState(true);
        Alert.alert(copy.pinApp, getErrorMessage(error));
      });
    } else {
      setPinSetupVisible(true);
    }
  }, [copy.pinApp, pinEnabled]);

  function handlePinSave(value: string) {
    pinLockedRef.current = false;
    setPinEnabledState(true);
    setPinVerified(true);
    void savePin(value).catch((error) => {
      setPinEnabledState(false);
      Alert.alert(copy.pinApp, getErrorMessage(error));
    });
  }

  function handlePinVerify(pin: string) {
    verifyPin(pin).then((ok) => {
      if (ok) {
        pinLockedRef.current = false;
        setPinVerified(true);
        setPinWrong(false);
      } else {
        setPinWrong(true);
        setTimeout(() => setPinWrong(false), PIN_DELAY_MS);
      }
    });
  }

  async function exportRows(cfg: ExportConfig) {
    const parseDay = (value: string, endOfDay: boolean) => {
      const [y, m, d] = value.split("-").map(Number);
      if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return Number.NaN;
      const date = new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
      return Number.isNaN(date.getTime()) ? Number.NaN : date.getTime();
    };
    const parseMonth = (value: string) => {
      const [y, m] = value.split("-").map(Number);
      return Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12 ? y * 12 + (m - 1) : Number.NaN;
    };
    let rows: Transaction[];
    if (cfg.rangeMode === "dates") {
      const from = cfg.startDate ? parseDay(cfg.startDate, false) : 0;
      const to = cfg.endDate ? parseDay(cfg.endDate, true) : Infinity;
      rows = transactions.filter((tx) => {
        const t = parseDay(formatDateToISO(tx.rawDate), false);
        return t >= from && t <= to;
      });
    } else {
      const fromYM = cfg.startDate ? parseMonth(cfg.startDate) : 0;
      const toYM = cfg.endDate ? parseMonth(cfg.endDate) : Infinity;
      rows = transactions.filter((tx) => {
        const txYM = parseMonth(formatDateToISO(tx.rawDate).slice(0, 7));
        return txYM >= fromYM && txYM <= toYM;
      });
    }
    if (!rows.length) {
      Alert.alert(copy.exportMovements, copy.noDataToExport);
      return;
    }
    const baseFileName = buildExportFileName(cfg);
    if (cfg.format === "xlsx") {
      const csvLines: string[] = [copy.csvHeader as string];
      rows.forEach(
        (tx) =>
          csvLines.push(
            `${tx.date},${tx.amount},"${tx.detail.replace(/"/g, '""')}",${tx.type},${formatCreatedTime(tx.createdAt)}`,
          ),
      );
      const csv = csvLines.join("\n");
      const uri = `${cacheDirectory}${baseFileName}.csv`;
      await writeAsStringAsync(uri, csv);
      await shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: copy.exportMovements,
      });
    } else {
      const html = `<html><body><h1>Bucks Manager</h1><table border="1" cellspacing="0" cellpadding="6">${rows
        .map(
          (tx) =>
            `<tr><td>${tx.date}</td><td>${formatMoney(tx.amount, currencySymbol)}</td><td>${tx.detail}</td><td>${tx.type}</td><td>${formatCreatedTime(tx.createdAt)}</td></tr>`,
        )
        .join("")}</table></body></html>`;
      const pdf = await printToFileAsync({ html });
      const uri = `${cacheDirectory}${baseFileName}.pdf`;
      await deleteAsync(uri, { idempotent: true });
      await copyAsync({ from: pdf.uri, to: uri });
      await shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: copy.exportPdf,
      });
    }
  }

  function startExport(cfg: ExportConfig) {
    void exportRows(cfg).catch((error) =>
      Alert.alert(copy.exportMovements, getErrorMessage(error)),
    );
  }

  const exitSearch = useCallback(() => setSearchActive(false), []);
  const loadOlder = useCallback(
    () => setLoadedMonthCount((count) => count + 1),
    [],
  );
  const openTagEditor = useCallback(() => setTagEditorVisible(true), []);
  const openExport = useCallback(() => setExportVisible(true), []);
  const openSearch = useCallback(
    () => searchModalRef.current?.open(searchFilters),
    [searchFilters],
  );
  const closeConfirm = useCallback(() => setConfirmConfig(null), []);
  const closeHistory = useCallback(() => setHistoryVisible(false), []);
  const closePinSetup = useCallback(() => setPinSetupVisible(false), []);
  const closeExport = useCallback(() => setExportVisible(false), []);
  const closeTagEditor = useCallback(() => setTagEditorVisible(false), []);

  const tabPageProps = useMemo(
    () => ({
      tabWidth,
      expenses: {
        contentTopInset: headerTopInset + 112,
        colors,
        summary: currentSummary,
        transactions: visibleTransactions,
        searchActive,
        searchText: searchFilters.text,
        selectedRows,
        currencySymbol,
        copy,
        onExitSearch: exitSearch,
        onOpenDetail: handleTransactionPress,
        onEdit: openEdit,
        onDeleteSelected: requestDeleteSelected,
        onMove: openMoveMenu,
        onToggleSelection: toggleSelection,
        onLoadOlder: loadOlder,
        tagsList,
      },
      summary: {
        contentTopInset: headerTopInset + 62,
        colors,
        copy,
        summaries,
        transactions,
        freqIncome,
        availableYears,
        currencySymbol,
      },
      settings: {
        contentTopInset: headerTopInset + 62,
        colors,
        copy,
        language,
        accountInfo,
        currencySymbol,
        fontPreference,
        colorSchemeLabel,
        pinEnabled,
        tagsCount: tagsList.length,
        onOpenLanguage: openLanguagePicker,
        onOpenCurrency: openCurrencyPicker,
        onOpenFont: openFontPicker,
        onOpenColorScheme: openColorSchemePicker,
        onOpenPin: handlePinOpen,
        onOpenTags: openTagEditor,
        onSwitch: openAccountManager,
        onDisconnect: requestDisconnectGoogle,
        onOpenExport: openExport,
      },
      loadingBar: {
        visible: Boolean(
          loading || (syncStatusText && !pendingSync && !isSyncing),
        ),
        syncing: loading || isSyncing,
        cardColor: colors.card,
        primaryColor: colors.primary,
        mutedColor: colors.muted,
        text: syncStatusText || copy.syncing,
      },
    }),
    [
      tabWidth,
      headerTopInset,
      colors,
      currentSummary,
      visibleTransactions,
      searchActive,
      searchFilters.text,
      selectedRows,
      currencySymbol,
      copy,
      exitSearch,
      handleTransactionPress,
      openEdit,
      requestDeleteSelected,
      openMoveMenu,
      toggleSelection,
      loadOlder,
      tagsList,
      summaries,
      transactions,
      freqIncome,
      availableYears,
      accountInfo,
      language,
      fontPreference,
      colorSchemeLabel,
      pinEnabled,
      openLanguagePicker,
      openCurrencyPicker,
      openFontPicker,
      openColorSchemePicker,
      handlePinOpen,
      openTagEditor,
      openAccountManager,
      requestDisconnectGoogle,
      openExport,
      loading,
      syncStatusText,
      pendingSync,
      isSyncing,
    ],
  );

  const headerProps = useMemo(
    () => ({
      tab,
      bg: colors.bg,
      isDark: theme === "dark",
      headerTopInset,
      headerFadeHeight,
      expensesSubtitle: `${uiMonthNames[month]} ${year}`,
      expensesAvailableYears: availableYears,
      expensesAvailableMonths: availableMonths,
      expensesYear: year,
      expensesMonth: month,
      historyTint: historyEntries.length ? colors.primary : colors.muted,
      onToggleTheme: toggleThemeWithCrossfade,
      onOpenHistory: openHistory,
      onSelectPeriod: selectPeriod,
      goToday,
      goPrevMonth,
      goNextMonth,
      copy,
    }),
    [
      tab,
      colors,
      theme,
      headerTopInset,
      headerFadeHeight,
      uiMonthNames,
      month,
      year,
      availableYears,
      availableMonths,
      historyEntries.length,
      toggleThemeWithCrossfade,
      openHistory,
      selectPeriod,
      goToday,
      goPrevMonth,
      goNextMonth,
      copy,
    ],
  );

  // --- Render ---
  if (
    bootstrapping ||
    accountTransition ||
    (accessToken && isFirstRemoteLoad && !hasLocalData)
  ) {
    return <StartupSplash />;
  }

  if (!accessToken) {
    return (
      <View style={[styles.safe, { backgroundColor: colors.bg }]}>
        <NativeStatusBar
          barStyle={theme === "dark" ? "light-content" : "dark-content"}
          translucent
          backgroundColor="transparent"
        />
        <LoginScreen
          colors={colors}
          copy={copy}
          loading={loading}
          canConnect={Boolean(GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID)}
          onSignIn={signInWithGoogle}
        />
      </View>
    );
  }

  if (pinLoading) {
    return (
      <View style={[styles.safe, { backgroundColor: colors.bg }]}>
        <NativeStatusBar
          barStyle={theme === "dark" ? "light-content" : "dark-content"}
          translucent
          backgroundColor="transparent"
        />
        <BlurView
          intensity={90}
          tint={theme === "dark" ? "dark" : "light"}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  if (pinEnabled && (!pinVerified || pinLockedRef.current)) {
    return (
      <View style={[styles.safe, { backgroundColor: colors.bg }]}>
        <NativeStatusBar
          barStyle={theme === "dark" ? "light-content" : "dark-content"}
          translucent
          backgroundColor="transparent"
        />
        <PinScreen
          colors={colors}
          copy={copy}
          title={copy.pinRequired}
          subtitle={copy.pinForgot}
          wrong={pinWrong}
          bgColor={colors.bg}
          onFill={handlePinVerify}
        />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.safe, { backgroundColor: themeProgressBg }]}>
      <NativeStatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        translucent
        backgroundColor="transparent"
      />
      <View
        style={[
          styles.shell,
          styles.shellCompact,
          { paddingTop: 0 },
        ]}
      >
        <View
          style={[
            styles.content,
            { width: "100%", position: "relative", overflow: "hidden" },
          ]}
        >
          <Animated.View
            style={{
              width: tabWidth * TAB_ORDER.length,
              height: "100%",
              flexDirection: "row",
              transform: [{ translateX: pagerTranslateX }],
              zIndex: 0,
            }}
          >
            <TabPage
              tab="expenses"
              isCurrent={tab === "expenses"}
              props={tabPageProps.expenses}
              loadingBar={tabPageProps.loadingBar}
              tabWidth={tabPageProps.tabWidth}
            />
            <TabPage
              tab="summary"
              isCurrent={tab === "summary"}
              props={tabPageProps.summary}
              loadingBar={tabPageProps.loadingBar}
              tabWidth={tabPageProps.tabWidth}
            />
            <TabPage
              tab="settings"
              isCurrent={tab === "settings"}
              props={tabPageProps.settings}
              loadingBar={tabPageProps.loadingBar}
              tabWidth={tabPageProps.tabWidth}
            />
          </Animated.View>

          <HeaderShell {...headerProps} colors={colors} />
        </View>

        <BottomFade color={colors.bg} height={bottomFadeHeight} />
        <BottomNav
          copy={copy}
          tab={tabRef.current}
          setTab={changeTab}
          onAdd={openAdd}
          onSearch={openSearch}
        />
      </View>

      <TransactionModal
        ref={transactionModalRef}
        colors={colors}
        tags={tagsList}
        copy={copy}
        currencySymbol={currencySymbol}
        onSubmit={submitDraft}
      />
      <DetailModal
        ref={detailModalRef}
        colors={colors}
        currencySymbol={currencySymbol}
        copy={copy}
        tags={tagsList}
        onEdit={openEdit}
        onDelete={requestDelete}
      />
      <OptionSheet ref={optionSheetRef} colors={colors} />
      <ConfirmModal
        config={confirmConfig}
        colors={colors}
        currencySymbol={currencySymbol}
        copy={copy}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
      />
      <HistoryModal
        visible={historyVisible}
        entries={historyEntries}
        colors={colors}
        currencySymbol={currencySymbol}
        copy={copy}
        onClose={closeHistory}
        onUndo={undoDeleteEntry}
      />
      <PinSetupModal
        visible={pinSetupVisible}
        colors={colors}
        copy={copy}
        onClose={closePinSetup}
        onSave={handlePinSave}
      />
      <ExportModal
        visible={exportVisible}
        colors={colors}
        config={exportConfig}
        setConfig={setExportConfig}
        minDate={exportMinDate}
        copy={copy}
        onClose={closeExport}
        onExport={startExport}
      />
      <SearchModal
        ref={searchModalRef}
        colors={colors}
        copy={copy}
        currencySymbol={currencySymbol}
        tags={tagsList}
        onClear={clearSearchFilters}
        onSubmit={applySearchFilters}
      />
      <TagEditorModal
        visible={tagEditorVisible}
        colors={colors}
        copy={copy}
        tags={tagsList}
        setTags={setTagsList}
        onClose={closeTagEditor}
      />
    </Animated.View>
  );
}

function StartupSplash() {
  return (
    <View style={{ flex: 1, backgroundColor: SPLASH_BG }}>
      <NativeStatusBar barStyle="light-content" backgroundColor={SPLASH_BG} />
      <Image
        source={require("./assets/splash-bucks.png")}
        resizeMode="cover"
        style={{ width: "100%", height: "100%" }}
      />
      <ActivityIndicator
        color={SPLASH_SPINNER}
        style={{ position: "absolute", bottom: SPLASH_INDICATOR_OFFSET, alignSelf: "center" }}
      />
    </View>
  );
}

const HeaderActionButton = memo(function HeaderActionButton({
  colors,
  icon,
  iconColor,
  onPress,
}: {
  colors: Palette;
  icon: MaterialIconName;
  iconColor: string;
  onPress: () => void;
}) {
  const pressed = useRef(new Animated.Value(0)).current;
  const animate = (toValue: number, duration: number) => {
    pressed.stopAnimation();
    Animated.timing(pressed, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };
  return (
    <Animated.View
      style={{
        opacity: pressed.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.8],
        }),
        transform: [
          {
            scale: pressed.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.94],
            }),
          },
        ],
      }}
    >
      <Pressable
        onPressIn={() => {
          animate(1, ANIM_HEADER_BTN_IN);
          onPress();
        }}
        onPressOut={() => animate(0, ANIM_HEADER_BTN_OUT)}
        accessibilityRole="button"
        hitSlop={6}
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.input,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      </Pressable>
    </Animated.View>
  );
});

const HeaderFade = memo(function HeaderFade({
  color,
  height,
}: {
  color: string;
  height: number;
}) {
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height={height}
      style={{ position: "absolute", top: 0, left: 0, right: 0 }}
    >
      <Defs>
        <LinearGradient id="headerFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.55" />
          <Stop offset="0.38" stopColor={color} stopOpacity="0.35" />
          <Stop offset="0.72" stopColor={color} stopOpacity="0.10" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#headerFade)" />
    </Svg>
  );
});

const HeaderTitleFade = memo(function HeaderTitleFade({
  color,
}: {
  color: string;
}) {
  return (
    <Svg
      pointerEvents="none"
      width="92%"
      height={70}
      style={styles.headerTitleFade}
    >
      <Defs>
        <LinearGradient
          id="headerTitleFadeHorizontal"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >
          <Stop offset="0" stopColor={color} stopOpacity="0.45" />
          <Stop offset="0.58" stopColor={color} stopOpacity="0.30" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient
          id="headerTitleFadeVertical"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <Stop offset="0.18" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="0.82" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
        <Mask id="headerTitleFadeMask">
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#headerTitleFadeVertical)"
          />
        </Mask>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="url(#headerTitleFadeHorizontal)"
        mask="url(#headerTitleFadeMask)"
      />
    </Svg>
  );
});

const BottomFade = memo(function BottomFade({
  color,
  height,
}: {
  color: string;
  height: number;
}) {
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height={height}
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10 }}
    >
      <Defs>
        <LinearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0" />
          <Stop offset="0.36" stopColor={color} stopOpacity="0.16" />
          <Stop offset="0.70" stopColor={color} stopOpacity="0.58" />
          <Stop offset="1" stopColor={color} stopOpacity="0.86" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#bottomFade)" />
    </Svg>
  );
});

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

type ExpensesTabProps = {
  contentTopInset: number;
  colors: Palette;
  summary: SummaryRow;
  transactions: Transaction[];
  searchActive: boolean;
  searchText: string;
  selectedRows: number[];
  currencySymbol: string;
  copy: UiCopy;
  onExitSearch: () => void;
  onOpenDetail: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onDeleteSelected: () => void;
  onMove: (tx: Transaction) => void;
  onToggleSelection: (tx: Transaction) => void;
  onLoadOlder: () => void;
  tagsList: Tag[];
};

type SummaryTabProps = {
  contentTopInset: number;
  colors: Palette;
  copy: UiCopy;
  summaries: SummaryRow[];
  transactions: Transaction[];
  freqIncome: Record<string, number>;
  availableYears: number[];
  currencySymbol: string;
};

type SettingsTabProps = {
  contentTopInset: number;
  colors: Palette;
  copy: UiCopy;
  language: LanguageMode;
  accountInfo: { name?: string; email?: string } | null;
  currencySymbol: string;
  fontPreference: FontPreference;
  colorSchemeLabel: string;
  pinEnabled: boolean;
  tagsCount: number;
  onOpenLanguage: () => void;
  onOpenCurrency: () => void;
  onOpenFont: () => void;
  onOpenColorScheme: () => void;
  onOpenPin: () => void;
  onOpenTags: () => void;
  onSwitch: () => void;
  onDisconnect: () => void;
  onOpenExport: () => void;
};

type LoadingBarProps = {
  visible: boolean;
  syncing: boolean;
  cardColor: string;
  primaryColor: string;
  mutedColor: string;
  text: string;
};

type TabPageProps =
  | {
      tab: "expenses";
      isCurrent: boolean;
      props: ExpensesTabProps;
      loadingBar: LoadingBarProps;
      tabWidth: number;
    }
  | {
      tab: "summary";
      isCurrent: boolean;
      props: SummaryTabProps;
      loadingBar: LoadingBarProps;
      tabWidth: number;
    }
  | {
      tab: "settings";
      isCurrent: boolean;
      props: SettingsTabProps;
      loadingBar: LoadingBarProps;
      tabWidth: number;
    };

function TabPageImpl(props: TabPageProps) {
  const { tab, isCurrent, props: tabProps, loadingBar, tabWidth } = props;
  const showSettingsTopPad = tab === "settings";
  return (
    <View
      pointerEvents={isCurrent ? "auto" : "none"}
      importantForAccessibility={isCurrent ? "auto" : "no-hide-descendants"}
      style={{ width: tabWidth, height: "100%", position: "relative" }}
    >
      <View
        style={[
          { flex: 1 },
          showSettingsTopPad && { paddingTop: tabProps.contentTopInset },
        ]}
      >
        {loadingBar.visible && (
          <View
            style={[
              styles.loadingBar,
              styles.loadingOverlay,
              { backgroundColor: loadingBar.cardColor },
            ]}
          >
            {loadingBar.syncing && (
              <ActivityIndicator color={loadingBar.primaryColor} />
            )}
            <Text style={{ color: loadingBar.mutedColor }}>{loadingBar.text}</Text>
          </View>
        )}
        {tab === "expenses" ? (
          <ExpensesView
            colors={tabProps.colors}
            summary={tabProps.summary}
            transactions={tabProps.transactions}
            searchActive={tabProps.searchActive}
            searchText={tabProps.searchText}
            selectedRows={tabProps.selectedRows}
            currencySymbol={tabProps.currencySymbol}
            copy={tabProps.copy}
            onExitSearch={tabProps.onExitSearch}
            onOpenDetail={tabProps.onOpenDetail}
            onEdit={tabProps.onEdit}
            onDeleteSelected={tabProps.onDeleteSelected}
            onMove={tabProps.onMove}
            onToggleSelection={tabProps.onToggleSelection}
            onLoadOlder={tabProps.onLoadOlder}
            topInset={tabProps.contentTopInset}
            tagsList={tabProps.tagsList}
          />
        ) : tab === "summary" ? (
          <SummaryView
            colors={tabProps.colors}
            copy={tabProps.copy}
            summaries={tabProps.summaries}
            transactions={tabProps.transactions}
            freqIncome={tabProps.freqIncome}
            availableYears={tabProps.availableYears}
            topInset={tabProps.contentTopInset}
            currencySymbol={tabProps.currencySymbol}
          />
        ) : (
          <SettingsView
            colors={tabProps.colors}
            copy={tabProps.copy}
            language={tabProps.language}
            accountInfo={tabProps.accountInfo}
            currencySymbol={tabProps.currencySymbol}
            fontPreference={tabProps.fontPreference}
            colorSchemeLabel={tabProps.colorSchemeLabel}
            pinEnabled={tabProps.pinEnabled}
            tagsCount={tabProps.tagsCount}
            onOpenLanguage={tabProps.onOpenLanguage}
            onOpenCurrency={tabProps.onOpenCurrency}
            onOpenFont={tabProps.onOpenFont}
            onOpenColorScheme={tabProps.onOpenColorScheme}
            onOpenPin={tabProps.onOpenPin}
            onOpenTags={tabProps.onOpenTags}
            onSwitch={tabProps.onSwitch}
            onDisconnect={tabProps.onDisconnect}
            onOpenExport={tabProps.onOpenExport}
          />
        )}
      </View>
    </View>
  );
}

const TabPage = memo(TabPageImpl);

type HeaderShellProps = {
  tab: Tab;
  bg: string;
  isDark: boolean;
  headerTopInset: number;
  headerFadeHeight: number;
  expensesSubtitle: string;
  expensesAvailableYears: number[];
  expensesAvailableMonths: number[];
  expensesYear: number;
  expensesMonth: number;
  historyTint: string;
  onToggleTheme: () => void;
  onOpenHistory: () => void;
  onSelectPeriod: (month: number, year: number) => void;
  goToday: () => void;
  goPrevMonth: () => void;
  goNextMonth: () => void;
  copy: UiCopy;
};

function HeaderShellImpl(
  props: HeaderShellProps & {
    colors: Palette;
  },
) {
  const {
    tab,
    bg,
    isDark,
    headerTopInset,
    headerFadeHeight,
    expensesSubtitle,
    historyTint,
    onToggleTheme,
    onOpenHistory,
    copy,
    colors,
  } = props;
  const pageTitle =
    tab === "expenses"
      ? copy.expenses
      : tab === "summary"
        ? copy.summary
        : copy.settings;
  const pageSubtitle =
    tab === "expenses"
      ? expensesSubtitle
      : tab === "summary"
        ? copy.summarySubtitle
        : copy.settingsSubtitle;
  const showHeaderFade = tab === "expenses" || tab === "summary";
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
      }}
      pointerEvents="box-none"
    >
      {showHeaderFade && <HeaderFade color={bg} height={headerFadeHeight} />}
      <View pointerEvents="box-none" style={{ paddingTop: headerTopInset }}>
        <View
          style={[
            styles.topBar,
            styles.topBarMobile,
            { backgroundColor: "transparent" },
          ]}
        >
          <HeaderTitleFade color={bg} />
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.headerLogo,
                { backgroundColor: colors.primary },
              ]}
            >
              <MaterialCommunityIcons
                name="sack"
                size={19}
                color={colors.onPrimary}
              />
            </View>
            <View style={styles.titleBlock}>
              <Text
                numberOfLines={1}
                style={[
                  styles.pageTitle,
                  styles.pageTitleMobile,
                  isDark
                    ? styles.headerReadableTextDark
                    : styles.headerReadableTextLight,
                  { color: colors.text, textShadowColor: colors.shadow },
                ]}
              >
                {pageTitle}
              </Text>
              {!!pageSubtitle && (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.pageSub,
                    styles.pageSubMobile,
                    isDark
                      ? styles.headerReadableTextDark
                      : styles.headerReadableTextLight,
                    { color: colors.muted, textShadowColor: colors.shadow },
                  ]}
                >
                  {pageSubtitle}
                </Text>
              )}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <HeaderActionButton
              colors={colors}
              icon={isDark ? "weather-night" : "white-balance-sunny"}
              iconColor={colors.yellow}
              onPress={onToggleTheme}
            />
            <HeaderActionButton
              colors={colors}
              icon="history"
              iconColor={historyTint}
              onPress={onOpenHistory}
            />
          </View>
        </View>
        {tab === "expenses" && (
          <PeriodControls
            colors={colors}
            copy={copy}
            year={props.expensesYear}
            month={props.expensesMonth}
            availableYears={props.expensesAvailableYears}
            availableMonths={props.expensesAvailableMonths}
            onSelectPeriod={props.onSelectPeriod}
            goToday={props.goToday}
            goPrevMonth={props.goPrevMonth}
            goNextMonth={props.goNextMonth}
          />
        )}
      </View>
    </Animated.View>
  );
}

const HeaderShell = memo(HeaderShellImpl);
