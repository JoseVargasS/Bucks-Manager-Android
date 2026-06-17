import Constants from "expo-constants";
import { BlurTargetView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, SafeAreaView, Text, TouchableOpacity, View, StatusBar as NativeStatusBar } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from "react-native-svg";

import {
  applySearch, buildTransactionFromDraft, calculateSummaries,
  formatDateToISO, getMonthYear, insertChronologically, MONTH_NAMES, SHEET_NAMES,
} from "./src/domain/bucksLogic";
import {
  createBucksSpreadsheet, findCompatibleSheets, moveTransaction as moveGoogleTransaction,
  readSummaries, readTransactions, saveTransaction, updateFreqIncome as updateGoogleFreqIncome,
  updateTransaction as updateGoogleTransaction, deleteTransaction as deleteGoogleTransaction,
} from "./src/api/googleWorkspace";
import { dark, light, Palette } from "./src/theme/colors";
import { getBlankDraft, compareTransactionsDesc, filterTransactionsByRollingPeriod } from "./src/utils/transactions";
import { formatMoney, formatCreatedTime } from "./src/utils/formats";
import { styles } from "./src/styles/globalStyles";
import { SkeletonScreen } from "./src/components/ui/SkeletonScreen";
import { BottomNav } from "./src/components/layout/BottomNav";
import { PeriodControls } from "./src/components/layout/PeriodControls";
import { LoginScreen } from "./src/components/screens/LoginScreen";
import { ExpensesView } from "./src/components/screens/ExpensesView";
import { SearchPage } from "./src/components/screens/SearchPage";
import { SummaryView } from "./src/components/screens/SummaryView";
import { SettingsView } from "./src/components/screens/SettingsView";
import { TransactionModal } from "./src/components/modals/TransactionModal";
import { DetailModal } from "./src/components/modals/DetailModal";
import { FreqIncomeModal } from "./src/components/modals/FreqIncomeModal";
import { ExportModal, ExportConfig } from "./src/components/modals/ExportModal";
import { ConfirmModal, ConfirmConfig } from "./src/components/modals/ConfirmModal";
import { SheetChooserModal } from "./src/components/modals/SheetChooserModal";
import { OptionSheet, PickerConfig } from "./src/components/modals/OptionSheet";
import { ExportFormat, SearchFilters, SheetCandidate, SummaryRow, Transaction, TransactionDraft, TransactionType } from "./src/types";
import { UI_COPY, UI_MONTH_NAMES, UiCopy } from "./src/i18n";

const GOOGLE_ANDROID_CLIENT_ID = Constants.expoConfig?.extra?.googleAndroidClientId || "";
const GOOGLE_WEB_CLIENT_ID = Constants.expoConfig?.extra?.googleWebClientId || "";
const TOKEN_KEY = "bucks_google_access_token";
const SHEET_KEY = "bucks_spreadsheet_id";
const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

type Tab = "expenses" | "search" | "summary" | "settings";
type ThemeMode = "dark" | "light";
type LanguageMode = "es" | "en";
type FontPreference = "system" | "serif" | "mono";

const emptySearch: SearchFilters = { text: "", minAmount: "", maxAmount: "", startDate: "", endDate: "" };
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
  startMonth: new Date().getMonth(),
  startYear: new Date().getFullYear(),
  endMonth: new Date().getMonth(),
  endYear: new Date().getFullYear(),
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
  const [deletedTx, setDeletedTx] = useState<Transaction | null>(null);
  const [freqInput, setFreqInput] = useState("");
  const [exportVisible, setExportVisible] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportConfig>(defaultExportConfig);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);
  const blurTargetRef = useRef<View | null>(null);
  const didSetInitialPeriodRef = useRef(false);
  const compact = true;
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
    setFreqIncome({}); setAccountInfo(null); setDeletedTx(null);
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
    setDraft({ date: formatDateToISO(tx.rawDate), amount: tx.formula ? `=${tx.formula}` : String(Math.abs(tx.amount)), detail: tx.detail, type: tx.type, createdAt: tx.createdAt });
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
        if (currentEdit) await updateGoogleTransaction(accessToken, spreadsheetId, currentEdit.rowId, currentDraft);
        else await saveTransaction(accessToken, spreadsheetId, currentDraft);
        await reloadFromGoogle(accessToken, spreadsheetId, false);
      }, currentEdit ? copy.editRecord : copy.newRecord);
    }
  }

  async function deleteTx(tx: Transaction) {
    setDeletedTx(tx); setDetailTx(null);
    setSelectedRows((current) => current.filter((rowId) => rowId !== tx.rowId));
    const next = renumberTransactions(transactions.filter((item) => item.rowId !== tx.rowId));
    setTransactions(next); setSummaries(calculateSummaries(next, freqIncome));
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
    setDeletedTx(selected[0]);
    const selectedIds = new Set(selected.map((tx) => tx.rowId));
    const next = renumberTransactions(transactions.filter((item) => !selectedIds.has(item.rowId)));
    setTransactions(next); setSummaries(calculateSummaries(next, freqIncome));
    setSelectedRows([]);
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

  async function undoDelete() {
    if (!deletedTx) return;
    const next = [...transactions, deletedTx].sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());
    setTransactions(next.map((item, idx) => ({ ...item, rowId: idx + 2 })));
    setSummaries(calculateSummaries(next, freqIncome));
    if (accessToken && spreadsheetId) {
      const restored = deletedTx;
      const draft: TransactionDraft = {
        date: formatDateToISO(restored.rawDate),
        amount: restored.formula ? `=${restored.formula}` : String(Math.abs(restored.amount)),
        detail: restored.detail,
        type: restored.type,
        createdAt: restored.createdAt,
      };
      syncGoogleInBackground(async () => {
        await saveTransaction(accessToken, spreadsheetId, draft);
        await reloadFromGoogle(accessToken, spreadsheetId, false);
      }, "Deshacer");
    }
    setDeletedTx(null);
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
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <NativeStatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
        <SkeletonScreen colors={colors} />
      </SafeAreaView>
    );
  }

  if (!accessToken) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <NativeStatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />
        <LoginScreen colors={colors} copy={copy} loading={loading} canConnect={Boolean(GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID)} onSignIn={signInWithGoogle} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
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
                />
              ) : (
                <SummaryView colors={colors} copy={copy} summaries={summaries} transactions={transactions} freqIncome={freqIncome} compact={compact} availableYears={availableYears} topInset={contentTopInset} currencySymbol={currencySymbol} />
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
              <SettingsView colors={colors} copy={copy} theme={theme} setTheme={setTheme} accountInfo={accountInfo}
                language={language} currencySymbol={currencySymbol} fontPreference={fontPreference}
                onOpenLanguage={openLanguagePicker} onOpenCurrency={openCurrencyPicker} onOpenFont={openFontPicker}
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
               </View>
              {tab === "expenses" && (
                <PeriodControls colors={colors} copy={copy} year={year} month={month} availableYears={availableYears} availableMonths={availableMonths}
                  onSelectPeriod={selectPeriod} goToday={goToday}
                />
              )}
            </View>
          </View>
        </BlurTargetView>

        {deletedTx && (
          <TouchableOpacity style={[styles.undoFab, compact && { left: 18 }, { backgroundColor: colors.card }]} onPress={undoDelete}>
            <MaterialCommunityIcons name="undo" size={20} color={colors.blue} />
            <Text style={{ color: colors.text, fontWeight: "600" }}>{copy.undo}</Text>
          </TouchableOpacity>
        )}
        <BottomFade color={colors.bg} height={bottomFadeHeight} />
        <BottomNav colors={colors} copy={copy} tab={tab} setTab={setTab} onAdd={() => openAdd()} onSearch={() => setSearchVisible(true)} blurTarget={blurTargetRef} />
      </View>

      <TransactionModal visible={addVisible} colors={colors} draft={draft} setDraft={setDraft}
        copy={copy} currencySymbol={currencySymbol}
        editing={!!editingTx} openPicker={setPicker} onClose={() => setAddVisible(false)} onSubmit={submitDraft} />
      <FreqIncomeModal visible={freqVisible} colors={colors} value={freqInput} setValue={setFreqInput}
        copy={copy} onClose={() => setFreqVisible(false)} onSubmit={saveFreqIncome} />
      <DetailModal tx={detailTx} colors={colors} currencySymbol={currencySymbol} copy={copy} onClose={() => setDetailTx(null)} onEdit={openEdit} onDelete={requestDelete} />
      <SheetChooserModal visible={sheetCandidates.length > 1} colors={colors} candidates={sheetCandidates}
        onClose={() => setSheetCandidates([])} onSelect={(c) => selectSpreadsheet(accessToken, c.id, c.name)} />
      <OptionSheet config={picker} colors={colors} onClose={() => setPicker(null)} />
      <ConfirmModal config={confirmConfig} colors={colors} currencySymbol={currencySymbol} copy={copy} onClose={() => setConfirmConfig(null)} onConfirm={handleConfirm} />
      <ExportModal visible={exportVisible} colors={colors} config={exportConfig} setConfig={setExportConfig}
        minDate={transactions.length ? transactions.reduce((earliest, tx) => tx.rawDate < earliest ? tx.rawDate : earliest, transactions[0].rawDate).slice(0, 10) : ""}
        copy={copy} onClose={() => setExportVisible(false)} onExport={(cfg: ExportConfig) => { setExportVisible(false); exportRows(cfg); }} />
      <SearchModal visible={searchVisible} colors={colors} filters={searchFilters} setFilters={setSearchFilters}
        copy={copy} currencySymbol={currencySymbol}
        onClose={() => setSearchVisible(false)}
        onClear={() => { setSearchFilters(emptySearch); setSearchActive(false); setSearchVisible(false); }}
        onSubmit={() => { setSearchActive(true); setTab("expenses"); setSelectedRows([]); setSearchVisible(false); }}
      />
    </SafeAreaView>
  );
}

function getLatestTransactionDate(transactions: Transaction[]) {
  const today = new Date();
  return transactions.reduce<Date | null>((latest, tx) => {
    const date = new Date(tx.rawDate);
    if (Number.isNaN(date.getTime()) || date > today) return latest;
    if (!latest || date.getTime() > latest.getTime()) return date;
    return latest;
  }, null);
}

function parseLocalDateTime(value: string, endOfDay: boolean) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return Number.NaN;
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime();
}

function parseMonthKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return Number.NaN;
  return year * 12 + (month - 1);
}

function buildExportFileName(cfg: ExportConfig) {
  const range = cfg.rangeMode === "months"
    ? buildRangeFilePart(cfg.startDate, cfg.endDate, formatMonthFilePart)
    : buildRangeFilePart(cfg.startDate, cfg.endDate, formatDateFilePart);
  return `bucks-manager_${range}`;
}

function buildRangeFilePart(start: string, end: string, formatter: (value: string) => string) {
  if (start && end) return `${formatter(start)}_a_${formatter(end)}`;
  if (start) return `desde_${formatter(start)}`;
  if (end) return `hasta_${formatter(end)}`;
  return "todo";
}

function formatMonthFilePart(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "mes";
  return `${slugify(MONTH_NAMES[month - 1] || "mes")}-${year}`;
}

function formatDateFilePart(value: string) {
  return value;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPeriodRange(transactions: Transaction[]) {
  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const dates = transactions
    .map((tx) => new Date(tx.rawDate))
    .filter((date) => !Number.isNaN(date.getTime()) && date <= today);
  if (!dates.length) {
    return {
      minYear: currentMonthStart.getFullYear(),
      minMonth: currentMonthStart.getMonth(),
      maxYear: currentMonthStart.getFullYear(),
      maxMonth: currentMonthStart.getMonth(),
    };
  }
  const first = dates.reduce<Date>((earliest, date) => date < earliest ? date : earliest, dates[0]);
  const last = dates.reduce<Date>((latest, date) => date > latest ? date : latest, dates[0]);
  return {
    minYear: first.getFullYear(),
    minMonth: first.getMonth(),
    maxYear: last.getFullYear(),
    maxMonth: last.getMonth(),
  };
}

function getAvailableMonthsForYear(year: number, transactions: Transaction[]) {
  const range = getPeriodRange(transactions);
  if (year < range.minYear || year > range.maxYear) return [];
  const start = year === range.minYear ? range.minMonth : 0;
  const end = year === range.maxYear ? range.maxMonth : 11;
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function detectDeviceCurrencySymbol() {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
  const region = locale.split("-").pop()?.toUpperCase();
  const map: Record<string, string> = {
    PE: "S/",
    US: "$",
    EC: "$",
    PA: "$",
    SV: "$",
    ES: "€",
    FR: "€",
    DE: "€",
    IT: "€",
    PT: "€",
    GB: "£",
    JP: "¥",
    BR: "R$",
    MX: "MX$",
    CO: "COP$",
    CL: "CLP$",
  };
  return map[region || ""] || "S/";
}

function applyDefaultFont(fontPreference: FontPreference) {
  const fontFamily = fontPreference === "serif" ? "serif" : fontPreference === "mono" ? "monospace" : "sans-serif";
  const text = Text as typeof Text & { defaultProps?: { style?: unknown } };
  text.defaultProps = text.defaultProps || {};
  text.defaultProps.style = [{ fontFamily }];
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

function SearchModal({ visible, colors, copy, currencySymbol, filters, setFilters, onClose, onClear, onSubmit }: {
  visible: boolean; colors: Palette; copy: UiCopy; currencySymbol: string; filters: SearchFilters; setFilters: (f: SearchFilters) => void;
  onClose: () => void; onClear: () => void; onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.searchOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.searchSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.searchGrabber, { backgroundColor: colors.border }]} />
          <View style={styles.searchHeader}>
            <View style={[styles.searchHeaderIcon, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="magnify" size={21} color={colors.primary} />
            </View>
            <View style={styles.searchTitleBlock}>
              <Text style={[styles.searchTitle, { color: colors.text }]}>{copy.advancedSearch}</Text>
              <Text style={[styles.searchSubtitle, { color: colors.muted }]}>{copy.advancedSearchSubtitle}</Text>
            </View>
            <TouchableOpacity style={[styles.optionClose, { backgroundColor: colors.input }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <SearchPage colors={colors} copy={copy} currencySymbol={currencySymbol} filters={filters} setFilters={setFilters} onSubmit={onSubmit} onClear={onClear} />
        </View>
      </View>
    </Modal>
  );
}
