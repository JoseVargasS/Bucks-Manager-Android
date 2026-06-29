import Constants from "expo-constants";
import { BlurView } from "expo-blur";
import { getItemAsync, setItemAsync, deleteItemAsync } from "expo-secure-store";
import {
  preventAutoHideAsync,
  setOptions as setSplashOptions,
  hideAsync,
} from "expo-splash-screen";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Easing,
  useWindowDimensions,
  View,
  StatusBar as NativeStatusBar,
} from "react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

import {
  buildTransactionFromDraft,
  calculateSummaries,
  formatDateToISO,
  insertChronologically,
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
  removeTagFromAllRows,
} from "./src/api/googleWorkspace";
import {
  getWorkspaceAccessToken as getWorkspaceAccessTokenBase,
  syncAccountInfo as syncAccountInfoBase,
} from "./src/api/googleAuth";
import { ColorSchemePreference, getPalette } from "./src/theme/colors";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { getBlankDraft } from "./src/utils/transactions";
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
} from "./src/data/localCache";
import { styles } from "./src/styles/globalStyles";
import { BottomNav } from "./src/components/layout/BottomNav";
import { LoginScreen } from "./src/components/screens/LoginScreen";
import { PinScreen } from "./src/components/screens/PinScreen";
import {
  TransactionModal,
  TransactionModalHandle,
} from "./src/components/modals/TransactionModal";
import {
  DetailModal,
  DetailModalHandle,
} from "./src/components/modals/DetailModal";
import { ExportModal } from "./src/components/modals/ExportModal";
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
import { getAppFontFamily } from "./src/components/ui/AppText";
import {
  HistoryEntry,
  SearchFilters,
  Tab,
  MaterialIconName,
  Tag,
  Transaction,
  TransactionDraft,
} from "./src/types";

import {
  ANIM_SPLASH_DURATION,
  ANIM_TAB_PAGER,
  PIN_DELAY_MS,
  TOKEN_KEY,
  SHEET_KEY,
  TAB_ORDER,
} from "./src/theme/constants";
import { useFinancialState } from "./src/hooks/useFinancialState";
import { usePreferences, CURRENCY_OPTIONS } from "./src/hooks/usePreferences";
import { useExport } from "./src/hooks/useExport";
import { useErrorHelpers } from "./src/hooks/useErrorHelpers";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import {
  StartupSplash,
  BottomFade,
  TabPage,
  HeaderShell,
} from "./src/components/AppShell";

preventAutoHideAsync().catch(() => undefined);
setSplashOptions({ duration: ANIM_SPLASH_DURATION, fade: true });

const GOOGLE_ANDROID_CLIENT_ID =
  Constants.expoConfig?.extra?.googleAndroidClientId || "";
const GOOGLE_WEB_CLIENT_ID =
  Constants.expoConfig?.extra?.googleWebClientId || "";
// ponytail: module-level promise chain serializes every Sheets mutation so a
// fast edit cannot race with the reconcile read of an earlier edit. The chain
// holds the in-flight task only; UI state lives in pendingSyncRef/setPendingSync.
const syncQueueRef = { current: Promise.resolve() };
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
  {
    value: "pink",
    labelEs: "Rosa",
    labelEn: "Pink",
    icon: "heart",
  },
  {
    value: "sports",
    labelEs: "Deportes",
    labelEn: "Sports",
    icon: "trophy",
  },
  {
    value: "techy",
    labelEs: "Techy",
    labelEn: "Techy",
    icon: "chip",
  },
  {
    value: "sky",
    labelEs: "Cielo",
    labelEn: "Sky",
    icon: "weather-night",
  },
];

function deriveSyncStatus(args: {
  authError: string;
  syncError: string;
  pendingSync: boolean;
  isSyncing: boolean;
  hasLocalData: boolean;
  isEn: boolean;
  savedDataText: string;
  syncingLabel: string;
}): string {
  const {
    authError,
    syncError,
    pendingSync,
    isSyncing,
    hasLocalData,
    isEn,
    savedDataText,
    syncingLabel,
  } = args;
  if (authError) return authError;
  if (syncError)
    return hasLocalData
      ? isEn
        ? "Showing saved data"
        : "Mostrando datos guardados"
      : syncError;
  if (pendingSync) return isEn ? "Pending sync" : "Pendiente de sincronizar";
  if (isSyncing)
    return hasLocalData
      ? `${savedDataText} · ${syncingLabel.toLowerCase()}`
      : syncingLabel;
  return "";
}

function AppContent() {
  const { colors, theme, colorScheme, toggleTheme } = useTheme();
  const themeProgress = useRef(
    new Animated.Value(theme === "dark" ? 1 : 0),
  ).current;
  const themeAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const themeBgDark = useMemo(
    () => getPalette("dark", colorScheme).bg,
    [colorScheme],
  );
  const themeBgLight = useMemo(
    () => getPalette("light", colorScheme).bg,
    [colorScheme],
  );
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
  const {
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
  } = usePreferences();
  const { getErrorMessage, isAuthError, shouldRescanForSheetError } =
    useErrorHelpers(copy.syncError);
  const [tagsList, setTagsList] = useState<Tag[]>([]);
  const [tagEditorVisible, setTagEditorVisible] = useState(false);
  const fin = useFinancialState(tagsList);
  const {
    transactions,
    summaries,
    freqIncome,
    freqIncomeRef,
    hasLocalData,
    hasLocalDataRef,
    month,
    year,
    searchFilters,
    searchActive,
    selectedRows,
    setTransactions,
    setSummaries,
    setSearchFilters,
    setSearchActive,
    setSelectedRows,
    availableYears,
    availableMonths,
    currentSummary,
    visibleTransactions,
    applyFinancialState,
    persistFinancialState,
    resetFinancial,
    renumberTransactions,
    selectPeriod,
    goToday,
    goPrevMonth,
    goNextMonth,
    loadOlder,
    toggleSelection,
  } = fin;
  const [tab, setTab] = useState<Tab>("expenses");
  const [accessToken, setAccessToken] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);
  const [accountTransition, setAccountTransition] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFirstRemoteLoad, setIsFirstRemoteLoad] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [authError, setAuthError] = useState("");
  const [pendingSync, setPendingSync] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{
    name?: string;
    email?: string;
  } | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const {
    exportVisible,
    exportConfig,
    exportMinDate,
    setExportConfig,
    openExport,
    closeExport,
    startExport,
  } = useExport(transactions, currencySymbol, copy, getErrorMessage);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(
    null,
  );
  const [pinEnabled, setPinEnabledState] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinLoading, setPinLoading] = useState(true);
  const [pinSetupVisible, setPinSetupVisible] = useState(false);
  const [pinWrong, setPinWrong] = useState(false);
  const pinLockedRef = useRef(false);
  const transactionModalRef = useRef<TransactionModalHandle>(null);
  const detailModalRef = useRef<DetailModalHandle>(null);
  const searchModalRef = useRef<SearchModalHandle>(null);
  const optionSheetRef = useRef<OptionSheetHandle>(null);
  const reloadPromiseRef = useRef<Promise<void> | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTags(language)
      .then((loaded) => {
        setTagsList(loaded);
        const validIds = new Set(loaded.map((t) => t.id));
        setTransactions((current) => {
          const migrated = migrateTransactionTags(current, loaded);
          return migrated.map((tx) => {
            if (!tx.tags?.length) return tx;
            const cleaned = tx.tags.filter((t) => validIds.has(t));
            return cleaned.length === tx.tags.length
              ? tx
              : { ...tx, tags: cleaned };
          });
        });
        setSummaries((current) => current);
      })
      .catch(() => undefined);
  }, [language, setTransactions, setSummaries]);

  const prevTagsListRef = useRef<Tag[]>([]);
  useEffect(() => {
    if (!tagsList.length) return;
    const validIds = new Set(tagsList.map((t) => t.id));
    const prevIds = new Set(prevTagsListRef.current.map((t) => t.id));
    const removedIds = [...prevIds].filter((id) => !validIds.has(id));
    prevTagsListRef.current = tagsList;
    setTransactions((current) => {
      let changed = false;
      const next = current.map((tx) => {
        if (!tx.tags?.length) return tx;
        const cleaned = tx.tags.filter((t) => validIds.has(t));
        if (cleaned.length === tx.tags.length) return tx;
        changed = true;
        return { ...tx, tags: cleaned };
      });
      return changed ? next : current;
    });
    if (removedIds.length && accessToken && spreadsheetId) {
      for (const tagId of removedIds) {
        removeTagFromAllRows(accessToken, spreadsheetId, tagId).catch(
          () => undefined,
        );
      }
    }
  }, [tagsList, accessToken, spreadsheetId, setTransactions]);

  useEffect(() => {
    if (!bootstrapping) hideAsync().catch(() => undefined);
  }, [bootstrapping]);

  const lastTabWidthRef = useRef(tabWidth);
  useEffect(() => {
    if (lastTabWidthRef.current === tabWidth) return;
    lastTabWidthRef.current = tabWidth;
    pagerTranslateX.stopAnimation();
    pagerTranslateX.setValue(-TAB_ORDER.indexOf(tabRef.current) * tabWidth);
  }, [pagerTranslateX, tabWidth]);

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
  const syncStatusText = deriveSyncStatus({
    authError,
    syncError,
    pendingSync,
    isSyncing,
    hasLocalData,
    isEn,
    savedDataText,
    syncingLabel: copy.syncing,
  });
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
        if (hadCache) {
          await clearStaleSession();
        } else {
          await disconnectGoogle();
        }
      } else if (shouldRescanForSheetError(error)) {
        await connectGoogleWorkspace(activeToken, "", true);
      } else if (!hadCache) {
        setSyncError(getErrorMessage(error));
      }
    } finally {
      setIsFirstRemoteLoad(false);
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors.red, copy]);

  async function getWorkspaceAccessToken(interactive: boolean) {
    return getWorkspaceAccessTokenBase(interactive);
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
        await Promise.all([deleteItemAsync(SHEET_KEY), deleteFinancialCache()]);
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
        error instanceof Error ? error.message : copy.googleSignInError;
      const isDeveloperError =
        message.includes("DEVELOPER_ERROR") || message.includes("code: 10");
      Alert.alert(
        "Google",
        isDeveloperError ? copy.oauthConfigRejected : message,
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
    const info = syncAccountInfoBase();
    if (info) setAccountInfo(info);
  }

  function resetFinancialState() {
    resetFinancial();
    setSpreadsheetId("");
    setAccountInfo(null);
    setSyncError("");
    setAuthError("");
    setPendingSync(false);
    setIsSyncing(false);
    pendingSyncRef.current = false;
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

  async function clearStaleSession() {
    await Promise.all([
      deleteItemAsync(TOKEN_KEY),
      deleteItemAsync(SHEET_KEY),
      deleteFinancialCache(),
    ]).catch(() => undefined);
    setAccessToken("");
    setSpreadsheetId("");
    setAccountInfo(null);
    setSyncError("");
    setAuthError("");
    setPendingSync(false);
    setIsSyncing(false);
    pendingSyncRef.current = false;
    fin.didSetInitialPeriodRef.current = false;
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
        ? Object.fromEntries(
            summary.map((row) => [row.monthYear, row.freqIncome]),
          )
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
  }, [setSelectedRows]);

  function syncGoogleInBackground(task: (freshToken: string) => Promise<void>, title: string) {
    pendingSyncRef.current = false;
    setPendingSync(false);
    setIsSyncing(true);
    setSyncError("");
    syncQueueRef.current = syncQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const tokens = await GoogleSignin.getTokens();
        const fresh = tokens.accessToken || "";
        if (!fresh) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
        setAccessToken(fresh);
        await setItemAsync(TOKEN_KEY, fresh).catch(() => undefined);
        return fresh;
      })
      .then((freshToken) => task(freshToken))
      .then(() => {
        pendingSyncRef.current = false;
        setPendingSync(false);
      })
      .catch((error) => {
        pendingSyncRef.current = false;
        setPendingSync(false);
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
          async (freshToken) => {
            if (currentEdit) {
              await updateGoogleTransaction(
                freshToken,
                sheetId,
                currentEdit.rowId,
                currentDraft,
              );
            } else {
              await saveTransaction(freshToken, sheetId, currentDraft);
            }
            await reloadFromGoogle(freshToken, sheetId, false, true);
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
    [changeTab, setSearchActive, setSearchFilters, setSelectedRows],
  );

  const clearSearchFilters = useCallback(() => {
    requestAnimationFrame(() => {
      setSearchFilters(emptySearchFilters);
      setSearchActive(false);
    });
  }, [setSearchFilters, setSearchActive]);

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
      syncGoogleInBackground(async (freshToken) => {
        await deleteGoogleTransaction(freshToken, spreadsheetId, tx.rowId);
        await reloadFromGoogle(freshToken, spreadsheetId, false, true);
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
      syncGoogleInBackground(async (freshToken) => {
        for (const tx of selected)
          await deleteGoogleTransaction(freshToken, spreadsheetId, tx.rowId);
        await reloadFromGoogle(freshToken, spreadsheetId, false, true);
      }, "Eliminar seleccion");
    }
  }

  const selectedRowsRef = useRef(selectedRows);
  selectedRowsRef.current = selectedRows;
  const handleTransactionPress = useCallback(
    (tx: Transaction) => {
      if (selectedRowsRef.current.length) {
        toggleSelection(tx);
        return;
      }
      detailModalRef.current?.open(tx);
    },
    [toggleSelection],
  );

  const moveTx = useCallback(
    async (tx: Transaction, direction: "up" | "down") => {
      try {
        if (accessToken && spreadsheetId) {
          syncGoogleInBackground(async (freshToken) => {
            await moveGoogleTransaction(
              freshToken,
              spreadsheetId,
              tx.rowId,
              direction,
            );
            await reloadFromGoogle(freshToken, spreadsheetId, false, true);
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
          error instanceof Error ? error.message : copy.moveRecordError,
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    [
      colors.blue,
      colors.yellow,
      copy.moveDownOnePosition,
      copy.moveRecord,
      copy.moveUpOnePosition,
      moveTx,
    ],
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
      syncGoogleInBackground(async (freshToken) => {
        await insertTransactionAtRow(
          freshToken,
          spreadsheetId,
          draft,
          entry.transaction.rowId,
        );
        await reloadFromGoogle(freshToken, spreadsheetId, false, true);
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
  }, [copy.pinApp, getErrorMessage, pinEnabled]);

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

  const exitSearch = useCallback(
    () => setSearchActive(false),
    [setSearchActive],
  );
  const openTagEditor = useCallback(() => setTagEditorVisible(true), []);
  const openSearch = useCallback(
    () => searchModalRef.current?.open(searchFilters),
    [searchFilters],
  );
  const closeConfirm = useCallback(() => setConfirmConfig(null), []);
  const closeHistory = useCallback(() => setHistoryVisible(false), []);
  const closePinSetup = useCallback(() => setPinSetupVisible(false), []);
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
      <View style={[styles.shell, styles.shellCompact, { paddingTop: 0 }]}>
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

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </ThemeProvider>
  );
}
