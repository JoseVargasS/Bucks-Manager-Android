import Constants from "expo-constants";
import { BlurTargetView, BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Text, TouchableOpacity, View, StatusBar as NativeStatusBar } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from "react-native-svg";

import {
  applySearch, buildTransactionFromDraft, calculateSummaries,
  formatDateToISO, getMonthYear, insertChronologically, MONTH_NAMES, SHEET_NAMES,
} from "./src/domain/bucksLogic";
import {
  createBucksSpreadsheet, findCompatibleSheets, moveTransaction as moveGoogleTransaction,
  readSummaries, readTransactions, saveTransaction, insertTransactionAtRow, updateFreqIncome as updateGoogleFreqIncome,
  updateTransaction as updateGoogleTransaction, deleteTransaction as deleteGoogleTransaction,
} from "./src/api/googleWorkspace";
import { dark, light, Palette } from "./src/theme/colors";
import { getBlankDraft, compareTransactionsDesc, filterTransactionsByRollingPeriod } from "./src/utils/transactions";
import { formatMoney } from "./src/domain/bucksLogic";
import { formatCreatedTime } from "./src/utils/formats";
import { loadHistory, addHistoryEntry, removeHistoryEntry } from "./src/utils/history";
import { isPinEnabled, savePin, verifyPin, clearPin } from "./src/utils/pin";
import { loadTags } from "./src/utils/tags";
import { styles } from "./src/styles/globalStyles";
import { SkeletonScreen } from "./src/components/ui/SkeletonScreen";
import { BottomNav } from "./src/components/layout/BottomNav";
import { PeriodControls } from "./src/components/layout/PeriodControls";
import { LoginScreen } from "./src/components/screens/LoginScreen";
import { ExpensesView } from "./src/components/screens/ExpensesView";
import { SearchPage } from "./src/components/screens/SearchPage";
import { SummaryView } from "./src/components/screens/SummaryView";
import { SettingsView } from "./src/components/screens/SettingsView";
import { PinScreen } from "./src/components/screens/PinScreen";
import { TransactionModal } from "./src/components/modals/TransactionModal";
import { DetailModal } from "./src/components/modals/DetailModal";
import { FreqIncomeModal } from "./src/components/modals/FreqIncomeModal";
import { ExportModal, ExportConfig } from "./src/components/modals/ExportModal";
import { ConfirmModal, ConfirmConfig } from "./src/components/modals/ConfirmModal";
import { HistoryModal } from "./src/components/modals/HistoryModal";
import { PinSetupModal } from "./src/components/modals/PinSetupModal";
import { SheetChooserModal } from "./src/components/modals/SheetChooserModal";
import { SearchModal } from "./src/components/modals/SearchModal";
import { TagEditorModal } from "./src/components/modals/TagEditorModal";
import { OptionSheet, PickerConfig } from "./src/components/modals/OptionSheet";
import { ExportFormat, HistoryEntry, SearchFilters, SheetCandidate, SummaryRow, Tab, ThemeMode, LanguageMode, FontPreference, Tag, Transaction, TransactionDraft, TransactionType } from "./src/types";
import { getLatestTransactionDate, parseLocalDateTime, parseMonthKey, buildExportFileName, getPeriodRange, getAvailableMonthsForYear, detectDeviceCurrencySymbol, applyDefaultFont } from "./src/utils/helpers";
import { UI_COPY, UI_MONTH_NAMES, UiCopy } from "./src/i18n";

const GOOGLE_ANDROID_CLIENT_ID = Constants.expoConfig?.extra?.googleAndroidClientId || "";
const GOOGLE_WEB_CLIENT_ID = Constants.expoConfig?.extra?.googleWebClientId || "";
const TOKEN_KEY = "bucks_google_access_token";
const SHEET_KEY = "bucks_spreadsheet_id";
const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

const emptySearch: SearchFilters = { text: "", tag: "", minAmount: "", maxAmount: "", startDate: "", endDate: "" };
const LANGUAGE_KEY = "bucks_language";
const CURRENCY_SYMBOL_KEY = "bucks_currency_symbol";
const FONT_KEY = "bucks_font";
const CURRENCY_OPTIONS = [
  { labelEs: "Soles peruanos (S/)", labelEn: "Peruvian soles (S/)", value: "S/", icon: "cash" as const },
  { labelEs: "Dólares ($)", labelEn: "US dollars ($)", value: "$", icon: "currency-usd" as const },
  { labelEs: "Euros (€)", labelEn: "Euros (€)", value: "€", icon: "currency-eur" as const },
  { labelEs: "Libras (£)", labelEn: "Pounds (£)", value: "£", icon: "currency-gbp" as const },
  { labelEs: "Yenes (¥)", labelEn: "Yen (¥)", value: "¥", icon: "currency-jpy" as const },
  { labelEs: "Reales (R$)", labelEn: "Brazilian reais (R$)", value: "R$", icon: "currency-brl" as const },
  { labelEs: "Pesos mexicanos (MX$)", labelEn: "Mexican pesos (MX$)", value: "MX$", icon: "cash" as const },
  { labelEs: "Pesos colombianos (COP$)", labelEn: "Colombian pesos (COP$)", value: "COP$", icon: "cash" as const },
  { labelEs: "Pesos chilenos (CLP$)", labelEn: "Chilean pesos (CLP$)", value: "CLP$", icon: "cash" as const },
];
const defaultExportConfig: ExportConfig = {
  format: "xlsx" as ExportFormat,
  rangeMode: "dates" as const,
  startDate: "",
  endDate: "",
};

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const colors: Palette = theme === "dark" ? dark : light;
  const [language, setLanguage] = useState<LanguageMode>("es");
  const copy = UI_COPY[language];
  const [currencySymbol, setCurrencySymbol] = useState(detectDeviceCurrencySymbol);
  const [fontPreference, setFontPreference] = useState<FontPreference>("system");
  const [tab, setTab] = useState<Tab>("expenses");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [accessToken, setAccessToken] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [freqIncome, setFreqIncome] = useState<Record<string, number>>({});
  const [addVisible, setAddVisible] = useState(false);
  const [freqVisible, setFreqVisible] = useState(false);
  const [sheetCandidates, setSheetCandidates] = useState<SheetCandidate[]>([]);
  const [accountInfo, setAccountInfo] = useState<{ name?: string; email?: string } | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [draft, setDraft] = useState<TransactionDraft>(getBlankDraft());
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(emptySearch);
  const [searchActive, setSearchActive] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [loadedMonthCount, setLoadedMonthCount] = useState(1);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [picker, setPicker] = useState<PickerConfig>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [freqInput, setFreqInput] = useState("");
  const [exportVisible, setExportVisible] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportConfig>(defaultExportConfig);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);
  const [pinEnabled, setPinEnabledState] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinLoading, setPinLoading] = useState(true);
  const [pinSetupVisible, setPinSetupVisible] = useState(false);
  const [pinWrong, setPinWrong] = useState(false);
  const [tagsList, setTagsList] = useState<Tag[]>([]);
  const [tagEditorVisible, setTagEditorVisible] = useState(false);
  const pinLockedRef = useRef(false);
  const blurTargetRef = useRef<View | null>(null);
  const didSetInitialPeriodRef = useRef(false);
  const statusBarInset = NativeStatusBar.currentHeight || 0;
  const headerTopInset = statusBarInset + 6;
  const headerHeight = tab === "expenses" ? 112 : 62;
  const contentTopInset = headerTopInset + headerHeight;
  const headerFadeHeight = Math.max(headerTopInset + 28, 56);
  const bottomFadeHeight = 128;

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    });
    restorePreferences();
    restoreSession();
    loadHistory().then(setHistoryEntries).catch(() => undefined);
    loadTags().then(setTagsList).catch(() => undefined);
    isPinEnabled().then((enabled) => {
      setPinEnabledState(enabled);
      setPinVerified(!enabled);
      pinLockedRef.current = false;
    }).finally(() => setPinLoading(false));

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background") {
        pinLockedRef.current = true;
        setPinVerified(false);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    applyDefaultFont(fontPreference);
  }, [fontPreference]);

  // --- Derived data ---
  const visibleTransactions = useMemo(() => {
    const source = searchActive
      ? applySearch(transactions, searchFilters)
      : filterTransactionsByRollingPeriod(transactions, month, year, loadedMonthCount);
    return [...source].sort(compareTransactionsDesc);
  }, [transactions, month, year, loadedMonthCount, searchActive, searchFilters]);

  const currentSummary = useMemo(() => {
    const key = `${MONTH_NAMES[month]} ${year}`;
    return summaries.find((row) => row.monthYear === key) || {
      monthYear: key, freqIncome: freqIncome[key] || 0, nonFreqIncome: 0,
      totalIncome: freqIncome[key] || 0, freqExpense: 0, nonFreqExpense: 0,
      totalExpense: 0, netMonthly: freqIncome[key] || 0, netNoFreq: 0,
    };
  }, [summaries, month, year, freqIncome]);

  const availableYears = useMemo(() => {
    const range = getPeriodRange(transactions);
    return Array.from({ length: range.maxYear - range.minYear + 1 }, (_, index) => range.maxYear - index);
  }, [transactions]);

  const availableMonths = useMemo(() => getAvailableMonthsForYear(year, transactions), [year, transactions]);

  const uiMonthNames = copy.languageCode === "en" ? UI_MONTH_NAMES.en : UI_MONTH_NAMES.es;
  const pageTitle = tab === "expenses" ? copy.expenses : tab === "summary" ? copy.summary : copy.settings;
  const pageSubtitle = tab === "expenses" ? `${uiMonthNames[month]} ${year}` : tab === "summary" ? copy.summarySubtitle : copy.settingsSubtitle;

  // --- Session management ---
  async function restoreSession() {
    setBootstrapping(true);
    try {
      const [token, sheetId] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(SHEET_KEY)]);
      if (token && sheetId) {
        try {
          const fresh = await getWorkspaceAccessToken(false);
          const activeToken = fresh.accessToken || token;
          setAccessToken(activeToken);
          syncAccountInfo();
          await connectGoogleWorkspace(activeToken, sheetId);
        } catch { await clearGoogleSession(); }
      }
    } finally { setBootstrapping(false); }
  }

  async function restorePreferences() {
    const [storedLanguage, storedCurrency, storedFont] = await Promise.all([
      SecureStore.getItemAsync(LANGUAGE_KEY),
      SecureStore.getItemAsync(CURRENCY_SYMBOL_KEY),
      SecureStore.getItemAsync(FONT_KEY),
    ]);
    if (storedLanguage === "es" || storedLanguage === "en") setLanguage(storedLanguage);
    if (storedCurrency && CURRENCY_OPTIONS.some((option) => option.value === storedCurrency)) setCurrencySymbol(storedCurrency);
    if (storedFont === "system" || storedFont === "serif" || storedFont === "mono") {
      setFontPreference(storedFont);
      applyDefaultFont(storedFont);
    }
  }

  function saveLanguage(next: string) {
    const value = next === "en" ? "en" : "es";
    setLanguage(value);
    SecureStore.setItemAsync(LANGUAGE_KEY, value).catch(() => undefined);
  }

  function saveCurrencySymbol(next: string) {
    setCurrencySymbol(next);
    SecureStore.setItemAsync(CURRENCY_SYMBOL_KEY, next).catch(() => undefined);
  }

  function saveFontPreference(next: string) {
    const value = next === "serif" || next === "mono" ? next : "system";
    applyDefaultFont(value);
    setFontPreference(value);
    SecureStore.setItemAsync(FONT_KEY, value).catch(() => undefined);
  }

  function openLanguagePicker() {
    setPicker({
      title: copy.language,
      selectedValue: language,
      options: [
        { label: copy.spanish, value: "es", icon: "translate" },
        { label: copy.english, value: "en", icon: "translate" },
      ],
      onSelect: saveLanguage,
    });
  }

  function openCurrencyPicker() {
    setPicker({
      title: copy.currencySymbol,
      selectedValue: currencySymbol,
      options: CURRENCY_OPTIONS.map((option) => ({
        label: language === "en" ? option.labelEn : option.labelEs,
        value: option.value,
        icon: option.icon,
      })),
      onSelect: saveCurrencySymbol,
    });
  }

  function openFontPicker() {
    setPicker({
      title: copy.fontStyle,
      selectedValue: fontPreference,
      options: [
        { label: copy.system, value: "system", icon: "format-font" },
        { label: copy.serif, value: "serif", icon: "format-letter-case" },
        { label: copy.mono, value: "mono", icon: "code-tags" },
      ],
      onSelect: saveFontPreference,
    });
  }

  async function getWorkspaceAccessToken(interactive: boolean) {
    let current = GoogleSignin.getCurrentUser();
    if (!current) {
      const silent = await GoogleSignin.signInSilently();
      current = silent.type === "success" ? silent.data : null;
    }
    const grantedScopes = new Set(current?.scopes || []);
    const hasWorkspaceScopes = GOOGLE_WORKSPACE_SCOPES.every((scope) => grantedScopes.has(scope));
    if (!hasWorkspaceScopes) {
      if (!interactive) throw new Error("Faltan permisos de Google Workspace.");
      const response = await GoogleSignin.addScopes({ scopes: GOOGLE_WORKSPACE_SCOPES });
      if (!response || response.type !== "success") throw new Error("No se autorizaron los permisos de Drive y Sheets.");
    }
    return GoogleSignin.getTokens();
  }

  async function connectGoogleWorkspace(token: string, _preferredSheetId = "") {
    setLoading(true);
    try {
      const candidates = await findCompatibleSheets(token);
      const namedSheet = candidates.find((c) => c.name.trim().toUpperCase() === SHEET_NAMES.transactions);
      if (namedSheet) { await selectSpreadsheet(token, namedSheet.id, namedSheet.name); return; }
      const sheetId = await createBucksSpreadsheet(token);
      await selectSpreadsheet(token, sheetId, SHEET_NAMES.transactions);
    } catch (error) {
      Alert.alert("Google Sheets", error instanceof Error ? error.message : "No se pudo conectar la hoja");
    } finally { setLoading(false); }
  }

  async function selectSpreadsheet(token: string, sheetId: string, _name: string) {
    setLoading(true);
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await SecureStore.setItemAsync(SHEET_KEY, sheetId);
      setAccessToken(token); setSpreadsheetId(sheetId); setSheetCandidates([]);
      await reloadFromGoogle(token, sheetId);
    } finally { setLoading(false); }
  }

  async function signInWithGoogle() {
    if (!GOOGLE_ANDROID_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID) {
      Alert.alert("Google OAuth", "Faltan las credenciales en .env."); return;
    }
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      const tokens = await getWorkspaceAccessToken(true);
      if (!tokens.accessToken) throw new Error("Google no devolvió access token.");
      syncAccountInfo();
      await connectGoogleWorkspace(tokens.accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar sesión con Google.";
      const isDeveloperError = message.includes("DEVELOPER_ERROR") || message.includes("code: 10");
      Alert.alert("Google", isDeveloperError
        ? "Google rechazó la configuración OAuth. En Google Cloud revisa que el cliente Android use package com.josev.bucksmanager y el SHA-1 debug actual. También confirma que GOOGLE_WEB_CLIENT_ID sea tipo Web application."
        : message);
    } finally { setLoading(false); }
  }

  function syncAccountInfo() {
    const current = GoogleSignin.getCurrentUser();
    const data = ((current as { data?: { user: { name?: string; email?: string } } })?.data || current) as { user?: { name?: string; email?: string }; name?: string; email?: string };
    if (data) setAccountInfo({ name: data.user?.name || data.name, email: data.user?.email || data.email });
  }

  async function clearGoogleSession() {
    await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(SHEET_KEY)]);
    setAccessToken(""); setSpreadsheetId(""); setTransactions([]); setSummaries([]);
    setFreqIncome({}); setAccountInfo(null);
    didSetInitialPeriodRef.current = false;
  }

  async function disconnectGoogle() {
    try { await GoogleSignin.signOut(); } catch { /* ok */ }
    await clearGoogleSession();
  }

  async function switchGoogleAccount() {
    try { await GoogleSignin.signOut(); } catch { /* ok */ }
    await clearGoogleSession();
    await signInWithGoogle();
  }

  async function rescanDrive() { if (accessToken) await connectGoogleWorkspace(accessToken); }

  // --- Data operations ---
  async function reloadFromGoogle(token = accessToken, sheetId = spreadsheetId, showLoader = true) {
    if (!token || !sheetId) return;
    if (showLoader) setLoading(true);
    try {
      const [tx, summary] = await Promise.all([readTransactions(token, sheetId), readSummaries(token, sheetId)]);
      setTransactions(tx);
      setSummaries(summary.length ? summary : calculateSummaries(tx, freqIncome));
      if (!didSetInitialPeriodRef.current && tx.length) {
        const latestDate = getLatestTransactionDate(tx);
        if (latestDate) {
          setMonth(latestDate.getMonth());
          setYear(latestDate.getFullYear());
          setLoadedMonthCount(1);
        }
        didSetInitialPeriodRef.current = true;
      }
    } finally { if (showLoader) setLoading(false); }
  }

  function selectPeriod(nextMonth: number, nextYear: number) {
    const validMonths = getAvailableMonthsForYear(nextYear, transactions);
    const clampedMonth = validMonths.includes(nextMonth)
      ? nextMonth
      : validMonths.reduce((closest, item) => Math.abs(item - nextMonth) < Math.abs(closest - nextMonth) ? item : closest, validMonths[0] ?? nextMonth);
    setMonth(clampedMonth); setYear(nextYear); setSearchActive(false); setLoadedMonthCount(1); setSelectedRows([]);
  }
  const goToday = useCallback(() => {
    const today = new Date();
    selectPeriod(today.getMonth(), today.getFullYear());
  }, []);

  function openAdd(type?: TransactionType) { setEditingTx(null); setDraft(getBlankDraft(type)); setAddVisible(true); }

  function openEdit(tx: Transaction) {
    setDetailTx(null); setSelectedRows([]); setEditingTx(tx);
    setDraft({ date: formatDateToISO(tx.rawDate), amount: tx.formula ? `=${tx.formula}` : String(Math.abs(tx.amount)), detail: tx.detail, type: tx.type, createdAt: tx.createdAt, tags: tx.tags || [] });
    setAddVisible(true);
  }

  function renumberTransactions(items: Transaction[]) {
    return items.map((item, idx) => ({ ...item, rowId: idx + 2 }));
  }

  function syncGoogleInBackground(task: () => Promise<void>, title: string) {
    task().catch((error) => {
      Alert.alert(title, error instanceof Error ? error.message : copy.syncError);
    });
  }

  function requestDelete(tx: Transaction) {
    setDetailTx(null);
    setConfirmConfig({ kind: "delete", tx });
  }

  function requestDeleteSelected() {
    if (!selectedRows.length) return;
    setConfirmConfig({ kind: "deleteSelected", count: selectedRows.length });
  }

  function handleConfirm() {
    const cfg = confirmConfig;
    setConfirmConfig(null);
    if (!cfg) return;
    if (cfg.kind === "delete" && cfg.tx) deleteTx(cfg.tx);
    else if (cfg.kind === "deleteSelected") deleteSelectedRows();
  }

  async function submitDraft() {
    if (!draft.date || !draft.amount || !draft.detail.trim()) {
      Alert.alert(copy.incompleteData, copy.completeRequired); return;
    }
    const currentDraft = draft;
    const currentEdit = editingTx;
    const optimistic = buildTransactionFromDraft(currentDraft, currentEdit?.rowId || transactions.length + 2);
    const next = currentEdit
      ? renumberTransactions(insertChronologically(transactions.filter((tx) => tx.rowId !== currentEdit.rowId), optimistic))
      : renumberTransactions(insertChronologically(transactions, optimistic));
    setTransactions(next);
    setSummaries(calculateSummaries(next, freqIncome));
    setAddVisible(false);
    setEditingTx(null);
    setDraft(getBlankDraft());

    if (accessToken && spreadsheetId) {
      syncGoogleInBackground(async () => {
        if (currentEdit) {
          await updateGoogleTransaction(accessToken, spreadsheetId, currentEdit.rowId, currentDraft);
        } else {
          await saveTransaction(accessToken, spreadsheetId, currentDraft);
        }
        await reloadFromGoogle(accessToken, spreadsheetId, false);
      }, currentEdit ? copy.editRecord : copy.newRecord);
    }
  }

  async function deleteTx(tx: Transaction) {
    setDetailTx(null);
    setSelectedRows((current) => current.filter((rowId) => rowId !== tx.rowId));
    const next = renumberTransactions(transactions.filter((item) => item.rowId !== tx.rowId));
    setTransactions(next); setSummaries(calculateSummaries(next, freqIncome));
    addHistoryEntry({ action: "delete", transaction: tx }).then((entry) => {
      setHistoryEntries((prev) => [entry, ...prev]);
    }).catch(() => undefined);
    if (accessToken && spreadsheetId) {
      syncGoogleInBackground(async () => {
        await deleteGoogleTransaction(accessToken, spreadsheetId, tx.rowId);
        await reloadFromGoogle(accessToken, spreadsheetId, false);
      }, copy.deleteRecord);
    }
  }

  async function deleteSelectedRows() {
    const selected = transactions.filter((tx) => selectedRows.includes(tx.rowId)).sort((a, b) => b.rowId - a.rowId);
    if (!selected.length) return;
    const selectedIds = new Set(selected.map((tx) => tx.rowId));
    const next = renumberTransactions(transactions.filter((item) => !selectedIds.has(item.rowId)));
    setTransactions(next); setSummaries(calculateSummaries(next, freqIncome));
    setSelectedRows([]);
    for (const tx of selected) {
      addHistoryEntry({ action: "delete", transaction: tx }).then((entry) => {
        setHistoryEntries((prev) => [entry, ...prev]);
      }).catch(() => undefined);
    }
    if (accessToken && spreadsheetId) {
      syncGoogleInBackground(async () => {
        for (const tx of selected) await deleteGoogleTransaction(accessToken, spreadsheetId, tx.rowId);
        await reloadFromGoogle(accessToken, spreadsheetId, false);
      }, "Eliminar seleccion");
    }
  }

  function toggleSelection(tx: Transaction) {
    setSelectedRows((current) => current.includes(tx.rowId) ? current.filter((r) => r !== tx.rowId) : [...current, tx.rowId]);
  }

  function handleTransactionPress(tx: Transaction) {
    if (selectedRows.length) { toggleSelection(tx); return; }
    setDetailTx(tx);
  }

  async function moveTx(tx: Transaction, direction: "up" | "down") {
    setLoading(true);
    try {
      if (accessToken && spreadsheetId) {
        await moveGoogleTransaction(accessToken, spreadsheetId, tx.rowId, direction);
        await reloadFromGoogle(); return;
      }
      const index = transactions.findIndex((item) => item.rowId === tx.rowId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= transactions.length) return;
      const next = [...transactions];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      setTransactions(next.map((item, idx) => ({ ...item, rowId: idx + 2 })));
    } catch (error) {
      Alert.alert("Mover registro", error instanceof Error ? error.message : "No se pudo mover el registro.");
    } finally { setLoading(false); }
  }

  function openMoveMenu(tx: Transaction) {
    setPicker({
      title: "Mover registro", selectedValue: "",
      options: [
        { label: "Subir una posición", value: "up", icon: "arrow-up", tone: colors.blue },
        { label: "Bajar una posición", value: "down", icon: "arrow-down", tone: colors.yellow },
      ],
      onSelect: (direction: string) => moveTx(tx, direction as "up" | "down"),
    });
  }

  async function undoDeleteEntry(entry: HistoryEntry) {
    const entryId = entry.id;
    setHistoryEntries((prev) => prev.filter((e) => e.id !== entryId));
    removeHistoryEntry(entryId).catch(() => undefined);

    const next = [...transactions, entry.transaction].sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());
    setTransactions(next.map((item, idx) => ({ ...item, rowId: idx + 2 })));
    setSummaries(calculateSummaries(next, freqIncome));
    if (accessToken && spreadsheetId) {
      const draft: TransactionDraft = {
        date: formatDateToISO(entry.transaction.rawDate),
        amount: entry.transaction.formula ? `=${entry.transaction.formula}` : String(Math.abs(entry.transaction.amount)),
        detail: entry.transaction.detail,
        type: entry.transaction.type,
        createdAt: entry.transaction.createdAt,
      };
      syncGoogleInBackground(async () => {
        await insertTransactionAtRow(accessToken, spreadsheetId, draft, entry.transaction.rowId);
        await reloadFromGoogle(accessToken, spreadsheetId, false);
      }, "Deshacer");
    }
  }

  async function handlePinOpen() {
    if (pinEnabled) {
      await clearPin();
      pinLockedRef.current = false;
      setPinEnabledState(false);
      setPinVerified(true);
    } else {
      setPinSetupVisible(true);
    }
  }

  function handlePinSave(value: string) {
    savePin(value).then(() => {
      setPinEnabledState(true);
      setPinVerified(true);
      setPinSetupVisible(false);
    }).catch(() => undefined);
  }

  function handlePinVerify(pin: string) {
    verifyPin(pin).then((ok) => {
      if (ok) {
        pinLockedRef.current = false;
        setPinVerified(true);
        setPinWrong(false);
      } else {
        setPinWrong(true);
        setTimeout(() => setPinWrong(false), 1500);
      }
    });
  }

  async function saveFreqIncome() {
    const amount = Number(freqInput);
    if (!Number.isFinite(amount) || amount < 0) { Alert.alert("Monto inválido", "Ingresa un monto válido."); return; }
    const key = `${MONTH_NAMES[month]} ${year}`;
    if (accessToken && spreadsheetId) await updateGoogleFreqIncome(accessToken, spreadsheetId, key, amount);
    const nextFreq = { ...freqIncome, [key]: amount };
    setFreqIncome(nextFreq);
    setSummaries(calculateSummaries(transactions, nextFreq));
    setFreqVisible(false);
  }

  async function exportRows(cfg: ExportConfig) {
    let rows: Transaction[];
    if (cfg.rangeMode === "dates") {
      const from = cfg.startDate ? parseLocalDateTime(cfg.startDate, false) : 0;
      const to = cfg.endDate ? parseLocalDateTime(cfg.endDate, true) : Infinity;
      rows = transactions.filter((tx) => {
        const t = parseLocalDateTime(formatDateToISO(tx.rawDate), false);
        return t >= from && t <= to;
      });
    } else {
      const fromYM = cfg.startDate ? parseMonthKey(cfg.startDate) : 0;
      const toYM = cfg.endDate ? parseMonthKey(cfg.endDate) : Infinity;
      rows = transactions.filter((tx) => {
        const txYM = parseMonthKey(formatDateToISO(tx.rawDate).slice(0, 7));
        return txYM >= fromYM && txYM <= toYM;
      });
    }
    if (!rows.length) { Alert.alert("Exportar", "No hay datos para exportar."); return; }
    const baseFileName = buildExportFileName(cfg);
    if (cfg.format === "xlsx") {
      const csv = ["Fecha,Monto,Detalle,Tipo,Hora de creacion"]
        .concat(rows.map((tx) => `${tx.date},${tx.amount},"${tx.detail.replace(/"/g, '""')}",${tx.type},${formatCreatedTime(tx.createdAt)}`))
        .join("\n");
      const uri = `${FileSystem.cacheDirectory}${baseFileName}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv);
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Exportar movimientos" });
    } else {
      const html = `<html><body><h1>Bucks Manager</h1><table border="1" cellspacing="0" cellpadding="6">${rows
        .map((tx) => `<tr><td>${tx.date}</td><td>${formatMoney(tx.amount, currencySymbol)}</td><td>${tx.detail}</td><td>${tx.type}</td><td>${formatCreatedTime(tx.createdAt)}</td></tr>`)
        .join("")}</table></body></html>`;
      const pdf = await Print.printToFileAsync({ html });
      const uri = `${FileSystem.cacheDirectory}${baseFileName}.pdf`;
      await FileSystem.deleteAsync(uri, { idempotent: true });
      await FileSystem.copyAsync({ from: pdf.uri, to: uri });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Exportar PDF" });
    }
  }

  // --- Render ---
  if (bootstrapping) {
    return (
      <View style={[styles.safe, { backgroundColor: colors.bg }]}>
        <NativeStatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
        <SkeletonScreen colors={colors} />
      </View>
    );
  }

  if (!accessToken) {
    return (
      <View style={[styles.safe, { backgroundColor: colors.bg }]}>
        <NativeStatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
        <LoginScreen colors={colors} copy={copy} loading={loading} canConnect={Boolean(GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID)} onSignIn={signInWithGoogle} />
      </View>
    );
  }

  if (pinLoading) {
    return (
      <View style={[styles.safe, { backgroundColor: colors.bg }]}>
        <NativeStatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
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
        <NativeStatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
        <PinScreen
          colors={colors}
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
    <View style={[styles.safe, { backgroundColor: colors.bg }]}>
      <NativeStatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
      <View style={[styles.shell, styles.shellCompact, { backgroundColor: colors.bg, paddingTop: 0 }]}>
        <BlurTargetView ref={blurTargetRef} style={[styles.content, { width: "100%", position: "relative" }]}>
          {tab === "expenses" || tab === "summary" ? (
            <View style={{ flex: 1 }}>
              {loading && (
                <View style={styles.loadingBar}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ color: colors.muted }}>{copy.syncing}</Text>
                </View>
              )}
              {tab === "expenses" ? (
                <ExpensesView
                  colors={colors} summary={currentSummary} transactions={visibleTransactions}
                  searchActive={searchActive} searchText={searchFilters.text} selectedRows={selectedRows}
                  currencySymbol={currencySymbol}
                  copy={copy}
                  onEditFreq={() => { setFreqInput(String(currentSummary.freqIncome || 0)); setFreqVisible(true); }}
                  onExitSearch={() => setSearchActive(false)}
                  onOpenDetail={handleTransactionPress} onEdit={openEdit}
                  onDeleteSelected={requestDeleteSelected} onMove={openMoveMenu}
                  onToggleSelection={toggleSelection}
                  onLoadOlder={() => setLoadedMonthCount((c) => c + 1)}
                  topInset={contentTopInset}
                  tagsList={tagsList}
                />
              ) : (
                <SummaryView colors={colors} copy={copy} summaries={summaries} transactions={transactions} freqIncome={freqIncome} availableYears={availableYears} topInset={contentTopInset} currencySymbol={currencySymbol} />
              )}
            </View>
          ) : (
            <View style={{ paddingTop: contentTopInset, flex: 1 }}>
              {loading && (
                <View style={styles.loadingBar}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ color: colors.muted }}>{copy.syncing}</Text>
                </View>
              )}
              <SettingsView colors={colors} copy={copy} accountInfo={accountInfo}
                language={language} currencySymbol={currencySymbol} fontPreference={fontPreference} pinEnabled={pinEnabled}
                tagsCount={tagsList.length}
                onOpenLanguage={openLanguagePicker} onOpenCurrency={openCurrencyPicker} onOpenFont={openFontPicker}
                onOpenPin={handlePinOpen} onOpenTags={() => setTagEditorVisible(true)}
                onRescan={rescanDrive} onSwitch={switchGoogleAccount} onDisconnect={disconnectGoogle} onOpenExport={() => setExportVisible(true)}
              />
            </View>
          )}

          <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }} pointerEvents="box-none">
            {(tab === "expenses" || tab === "summary") && <HeaderFade color={colors.bg} height={headerFadeHeight} />}
            {/* TopBar + PeriodControls encima de todo, clickeables */}
            <View pointerEvents="box-none" style={{ paddingTop: headerTopInset }}>
              <View style={[styles.topBar, styles.topBarMobile, { backgroundColor: "transparent" }]}>
                <HeaderTitleFade color={colors.bg} />
               <View style={styles.headerLeft}>
                  <View style={[styles.headerLogo, { backgroundColor: colors.primary }]}>
                    <MaterialCommunityIcons name="sack" size={19} color={colors.onPrimary} />
                  </View>
                  <View style={styles.titleBlock}>
                    <Text numberOfLines={1} style={[styles.pageTitle, styles.pageTitleMobile, theme === "dark" ? styles.headerReadableTextDark : styles.headerReadableTextLight, { color: colors.text, textShadowColor: colors.shadow }]}>{pageTitle}</Text>
                    {!!pageSubtitle && <Text numberOfLines={1} style={[styles.pageSub, styles.pageSubMobile, theme === "dark" ? styles.headerReadableTextDark : styles.headerReadableTextLight, { color: colors.muted, textShadowColor: colors.shadow }]}>{pageSubtitle}</Text>}
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }}
                    onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    <MaterialCommunityIcons name={theme === "dark" ? "weather-night" : "white-balance-sunny"} size={20} color={colors.yellow} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }}
                    onPress={() => setHistoryVisible(true)}
                  >
                    <MaterialCommunityIcons name="history" size={20} color={historyEntries.length ? colors.primary : colors.muted} />
                  </TouchableOpacity>
                </View>
               </View>
              {tab === "expenses" && (
                <PeriodControls colors={colors} copy={copy} year={year} month={month} availableYears={availableYears} availableMonths={availableMonths}
                  onSelectPeriod={selectPeriod} goToday={goToday}
                />
              )}
            </View>
          </View>
        </BlurTargetView>

        <BottomFade color={colors.bg} height={bottomFadeHeight} />
        <BottomNav colors={colors} copy={copy} tab={tab} setTab={setTab} onAdd={() => openAdd()} onSearch={() => setSearchVisible(true)} blurTarget={blurTargetRef} />
      </View>

      <TransactionModal visible={addVisible} colors={colors} draft={draft} setDraft={setDraft} tags={tagsList}
        copy={copy} currencySymbol={currencySymbol}
        editing={!!editingTx} openPicker={setPicker} onClose={() => setAddVisible(false)} onSubmit={submitDraft} />
      <FreqIncomeModal visible={freqVisible} colors={colors} value={freqInput} setValue={setFreqInput}
        copy={copy} onClose={() => setFreqVisible(false)} onSubmit={saveFreqIncome} />
      <DetailModal tx={detailTx} colors={colors} currencySymbol={currencySymbol} copy={copy} onClose={() => setDetailTx(null)} onEdit={openEdit} onDelete={requestDelete} />
      <SheetChooserModal visible={sheetCandidates.length > 1} colors={colors} candidates={sheetCandidates}
        onClose={() => setSheetCandidates([])} onSelect={(c) => selectSpreadsheet(accessToken, c.id, c.name)} />
      <OptionSheet config={picker} colors={colors} onClose={() => setPicker(null)} />
      <ConfirmModal config={confirmConfig} colors={colors} currencySymbol={currencySymbol} copy={copy} onClose={() => setConfirmConfig(null)} onConfirm={handleConfirm} />
      <HistoryModal visible={historyVisible} entries={historyEntries} colors={colors} currencySymbol={currencySymbol} copy={copy} onClose={() => setHistoryVisible(false)} onUndo={undoDeleteEntry} />
      <PinSetupModal visible={pinSetupVisible} colors={colors} copy={copy} onClose={() => setPinSetupVisible(false)} onSave={handlePinSave} />
      <ExportModal visible={exportVisible} colors={colors} config={exportConfig} setConfig={setExportConfig}
        minDate={transactions.length ? transactions.reduce((earliest, tx) => tx.rawDate < earliest ? tx.rawDate : earliest, transactions[0].rawDate).slice(0, 10) : ""}
        copy={copy} onClose={() => setExportVisible(false)} onExport={(cfg: ExportConfig) => { setExportVisible(false); exportRows(cfg); }} />
      <SearchModal visible={searchVisible} colors={colors} filters={searchFilters} setFilters={setSearchFilters}
        copy={copy} currencySymbol={currencySymbol} tags={tagsList}
        onClose={() => setSearchVisible(false)}
        onClear={() => { setSearchFilters(emptySearch); setSearchActive(false); setSearchVisible(false); }}
        onSubmit={() => { setSearchActive(true); setTab("expenses"); setSelectedRows([]); setSearchVisible(false); }}
      />
      <TagEditorModal visible={tagEditorVisible} colors={colors} copy={copy} tags={tagsList} setTags={setTagsList} onClose={() => setTagEditorVisible(false)} />
    </View>
  );
}

function HeaderFade({ color, height }: { color: string; height: number }) {
  return (
    <Svg pointerEvents="none" width="100%" height={height} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
      <Defs>
        <LinearGradient id="headerFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.94" />
          <Stop offset="0.38" stopColor={color} stopOpacity="0.72" />
          <Stop offset="0.72" stopColor={color} stopOpacity="0.24" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#headerFade)" />
    </Svg>
  );
}

function HeaderTitleFade({ color }: { color: string }) {
  return (
    <Svg pointerEvents="none" width="92%" height={70} style={styles.headerTitleFade}>
      <Defs>
        <LinearGradient id="headerTitleFadeHorizontal" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity="0.96" />
          <Stop offset="0.58" stopColor={color} stopOpacity="0.82" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="headerTitleFadeVertical" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <Stop offset="0.18" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="0.82" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
        <Mask id="headerTitleFadeMask">
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#headerTitleFadeVertical)" />
        </Mask>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#headerTitleFadeHorizontal)" mask="url(#headerTitleFadeMask)" />
    </Svg>
  );
}

function BottomFade({ color, height }: { color: string; height: number }) {
  return (
    <Svg pointerEvents="none" width="100%" height={height} style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10 }}>
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
}
