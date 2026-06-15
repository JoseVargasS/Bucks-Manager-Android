import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar as NativeStatusBar,
} from "react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import Svg, { Circle, G, Rect } from "react-native-svg";
import {
  applySearch,
  buildTransactionFromDraft,
  calculateSummaries,
  formatDateToISO,
  formatMoney,
  getMonthYear,
  MONTH_NAMES,
  SHEET_NAMES,
  TRANSACTION_TYPES,
} from "./src/domain/bucksLogic";
import {
  createBucksSpreadsheet,
  findCompatibleSheets,
  moveTransaction as moveGoogleTransaction,
  readSummaries,
  readTransactions,
  saveTransaction,
  updateFreqIncome as updateGoogleFreqIncome,
  updateTransaction as updateGoogleTransaction,
  deleteTransaction as deleteGoogleTransaction,
} from "./src/api/googleWorkspace";
import { ExportFormat, SearchFilters, SheetCandidate, SummaryRow, Transaction, TransactionDraft, TransactionType } from "./src/types";

const GOOGLE_ANDROID_CLIENT_ID =
  Constants.expoConfig?.extra?.googleAndroidClientId || "";
const GOOGLE_WEB_CLIENT_ID =
  Constants.expoConfig?.extra?.googleWebClientId || "";
const TOKEN_KEY = "bucks_google_access_token";
const SHEET_KEY = "bucks_spreadsheet_id";

type Tab = "expenses" | "search" | "summary" | "settings";
type ThemeMode = "dark" | "light";
type PickerOption = { label: string; value: string; icon?: string; tone?: string };
type PickerConfig = { title: string; options: PickerOption[]; selectedValue: string; onSelect: (value: string) => void } | null;

const emptySearch: SearchFilters = { text: "", minAmount: "", maxAmount: "", startDate: "", endDate: "" };

function getBlankDraft(type: TransactionType = "GASTO NO FRECUENTE"): TransactionDraft {
  return {
    date: formatDateToISO(new Date()),
    amount: "",
    detail: "",
    type,
  };
}

function compareTransactionsDesc(a: Transaction, b: Transaction) {
  const dateDiff = new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime();
  if (dateDiff) return dateDiff;
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
}

function filterTransactionsByRollingPeriod(transactions: Transaction[], month: number, year: number, monthCount: number) {
  const end = new Date(year, month + 1, 1).getTime();
  const start = new Date(year, month - Math.max(1, monthCount) + 1, 1).getTime();
  return transactions.filter((tx) => {
    const time = new Date(tx.rawDate).getTime();
    return time >= start && time < end;
  });
}

function groupTransactionsByDate(transactions: Transaction[]) {
  return transactions.reduce<Array<{ key: string; label: string; items: Transaction[] }>>((groups, tx) => {
    const key = formatDateToISO(new Date(tx.rawDate));
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = { key, label: formatDateGroupLabel(tx.rawDate), items: [] };
      groups.push(group);
    }
    group.items.push(tx);
    return groups;
  }, []);
}

function formatDateGroupLabel(rawDate: string) {
  const date = new Date(rawDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (formatDateToISO(date) === formatDateToISO(today)) return `HOY · ${date.toLocaleDateString("es-PE", { month: "short", day: "2-digit" }).toUpperCase()}`;
  if (formatDateToISO(date) === formatDateToISO(yesterday)) return `AYER · ${date.toLocaleDateString("es-PE", { month: "short", day: "2-digit" }).toUpperCase()}`;
  return date.toLocaleDateString("es-PE", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const colors = theme === "dark" ? dark : light;
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
  const [loadedMonthCount, setLoadedMonthCount] = useState(1);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [picker, setPicker] = useState<PickerConfig>(null);
  const [deletedTx, setDeletedTx] = useState<Transaction | null>(null);
  const [freqInput, setFreqInput] = useState("");
  const [exportVisible, setExportVisible] = useState(false);
  const [exportConfig, setExportConfig] = useState<{ format: ExportFormat; rangeMode: "dates" | "months"; startDate: string; endDate: string; startMonth: number; startYear: number; endMonth: number; endYear: number }>({
    format: "xlsx",
    rangeMode: "dates",
    startDate: "",
    endDate: "",
    startMonth: new Date().getMonth(),
    startYear: new Date().getFullYear(),
    endMonth: new Date().getMonth(),
    endYear: new Date().getFullYear(),
  });
  const compact = true;
  const statusBarInset = NativeStatusBar.currentHeight || 0;

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
      scopes: [
        "https://www.googleapis.com/auth/drive.metadata.readonly",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
    restoreSession();
  }, []);

  const visibleTransactions = useMemo(() => {
    const source = searchActive ? applySearch(transactions, searchFilters) : filterTransactionsByRollingPeriod(transactions, month, year, loadedMonthCount);
    return [...source].sort(compareTransactionsDesc);
  }, [transactions, month, year, loadedMonthCount, searchActive, searchFilters]);

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

  async function restoreSession() {
    try {
      const [token, sheetId] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(SHEET_KEY)]);
      if (token && sheetId) {
        try {
          const fresh = await GoogleSignin.getTokens();
          const activeToken = fresh.accessToken || token;
          setAccessToken(activeToken);
          syncAccountInfo();
          await connectGoogleWorkspace(activeToken, sheetId);
        } catch {
          await clearGoogleSession();
        }
      }
    } finally {
      setBootstrapping(false);
    }
  }

  async function connectGoogleWorkspace(token: string, preferredSheetId = "") {
    setLoading(true);
    try {
      const candidates = await findCompatibleSheets(token);
      const namedSheet = candidates.find((candidate) => candidate.name.trim().toUpperCase() === SHEET_NAMES.transactions);
      const preferred = candidates.find((candidate) => candidate.id === preferredSheetId);
      if (namedSheet) {
        await selectSpreadsheet(token, namedSheet.id, namedSheet.name);
        return;
      }
      if (preferred) {
        await selectSpreadsheet(token, preferred.id, preferred.name);
        return;
      }
      if (candidates.length > 1) {
        setSheetCandidates(candidates);
        setAccessToken(token);
        return;
      }
      const sheetId = candidates[0]?.id || (await createBucksSpreadsheet(token));
      await selectSpreadsheet(token, sheetId, candidates[0]?.name || SHEET_NAMES.transactions);
    } catch (error) {
      Alert.alert("Google Sheets", error instanceof Error ? error.message : "No se pudo conectar la hoja");
    } finally {
      setLoading(false);
    }
  }

  async function selectSpreadsheet(token: string, sheetId: string, name: string) {
    setLoading(true);
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await SecureStore.setItemAsync(SHEET_KEY, sheetId);
      setAccessToken(token);
      setSpreadsheetId(sheetId);
      setSheetCandidates([]);
      await reloadFromGoogle(token, sheetId);
    } finally {
      setLoading(false);
    }
  }

  async function rescanDrive() {
    if (!accessToken) return;
    await connectGoogleWorkspace(accessToken);
  }

  async function signInWithGoogle() {
    if (!GOOGLE_ANDROID_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID) {
      Alert.alert("Google OAuth", "Faltan las credenciales en .env.");
      return;
    }
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      if (!tokens.accessToken) throw new Error("Google no devolvió access token.");
      syncAccountInfo();
      await connectGoogleWorkspace(tokens.accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar sesión con Google.";
      const isDeveloperError = message.includes("DEVELOPER_ERROR") || message.includes("code: 10");
      Alert.alert(
        "Google",
        isDeveloperError
          ? "Google rechazó la configuración OAuth. En Google Cloud revisa que el cliente Android use package com.josev.bucksmanager y el SHA-1 debug actual. También confirma que GOOGLE_WEB_CLIENT_ID sea tipo Web application."
          : message,
      );
      setLoading(false);
    }
  }

  function syncAccountInfo() {
    const current = GoogleSignin.getCurrentUser();
    const data = (current as any)?.data || current;
    if (data) setAccountInfo({ name: data.user?.name || data.name, email: data.user?.email || data.email });
  }

  async function clearGoogleSession() {
    await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(SHEET_KEY)]);
    setAccessToken("");
    setSpreadsheetId("");
    setTransactions([]);
    setSummaries([]);
    setFreqIncome({});
    setAccountInfo(null);
    setDeletedTx(null);
  }

  async function disconnectGoogle() {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Still clear local state when Google Play Services has no active session.
    }
    await clearGoogleSession();
  }

  async function switchGoogleAccount() {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Continue to sign-in even if there is no native Google session to close.
    }
    await clearGoogleSession();
    await signInWithGoogle();
  }

  async function reloadFromGoogle(token = accessToken, sheetId = spreadsheetId) {
    if (!token || !sheetId) return;
    setLoading(true);
    try {
      const [tx, summary] = await Promise.all([readTransactions(token, sheetId), readSummaries(token, sheetId)]);
      setTransactions(tx);
      setSummaries(summary.length ? summary : calculateSummaries(tx, freqIncome));
    } finally {
      setLoading(false);
    }
  }

  function selectPeriod(nextMonth: number, nextYear: number) {
    setMonth(nextMonth);
    setYear(nextYear);
    setSearchActive(false);
    setLoadedMonthCount(1);
    setSelectedRows([]);
  }

  function openAdd(type?: TransactionType) {
    setEditingTx(null);
    setDraft(getBlankDraft(type));
    setAddVisible(true);
  }

  function openEdit(tx: Transaction) {
    setDetailTx(null);
    setSelectedRows([]);
    setEditingTx(tx);
    setDraft({
      date: formatDateToISO(tx.rawDate),
      amount: String(tx.formula || Math.abs(tx.amount)),
      detail: tx.detail,
      type: tx.type,
      createdAt: tx.createdAt,
    });
    setAddVisible(true);
  }

  async function submitDraft() {
    if (!draft.date || !draft.amount || !draft.detail.trim()) {
      Alert.alert("Datos incompletos", "Completa fecha, monto y detalle.");
      return;
    }
    setLoading(true);
    try {
      if (accessToken && spreadsheetId) {
        if (editingTx) await updateGoogleTransaction(accessToken, spreadsheetId, editingTx.rowId, draft);
        else await saveTransaction(accessToken, spreadsheetId, draft);
        await reloadFromGoogle();
      } else if (editingTx) {
        const updated = buildTransactionFromDraft(draft, editingTx.rowId);
        const next = transactions.map((tx) => (tx.rowId === editingTx.rowId ? updated : tx));
        setTransactions(next);
        setSummaries(calculateSummaries(next, freqIncome));
      } else {
        const tx = buildTransactionFromDraft(draft, transactions.length + 2);
        const next = [...transactions, tx].sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());
        setTransactions(next.map((item, idx) => ({ ...item, rowId: idx + 2 })));
        setSummaries(calculateSummaries(next, freqIncome));
      }
      setAddVisible(false);
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTx(tx: Transaction) {
    setDeletedTx(tx);
    setDetailTx(null);
    setSelectedRows((current) => current.filter((rowId) => rowId !== tx.rowId));
    if (accessToken && spreadsheetId) {
      await deleteGoogleTransaction(accessToken, spreadsheetId, tx.rowId);
      await reloadFromGoogle();
      return;
    }
    const next = transactions.filter((item) => item.rowId !== tx.rowId).map((item, idx) => ({ ...item, rowId: idx + 2 }));
    setTransactions(next);
    setSummaries(calculateSummaries(next, freqIncome));
  }

  async function deleteSelectedRows() {
    const selected = transactions.filter((tx) => selectedRows.includes(tx.rowId)).sort((a, b) => b.rowId - a.rowId);
    if (!selected.length) return;
    setDeletedTx(selected[0]);
    setLoading(true);
    try {
      if (accessToken && spreadsheetId) {
        for (const tx of selected) await deleteGoogleTransaction(accessToken, spreadsheetId, tx.rowId);
        await reloadFromGoogle();
      } else {
        const selectedIds = new Set(selected.map((tx) => tx.rowId));
        const next = transactions.filter((item) => !selectedIds.has(item.rowId)).map((item, idx) => ({ ...item, rowId: idx + 2 }));
        setTransactions(next);
        setSummaries(calculateSummaries(next, freqIncome));
      }
      setSelectedRows([]);
    } catch (error) {
      Alert.alert("Eliminar", error instanceof Error ? error.message : "No se pudo eliminar la selección.");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelection(tx: Transaction) {
    setSelectedRows((current) => (current.includes(tx.rowId) ? current.filter((rowId) => rowId !== tx.rowId) : [...current, tx.rowId]));
  }

  function handleTransactionPress(tx: Transaction) {
    if (selectedRows.length) {
      toggleSelection(tx);
      return;
    }
    setDetailTx(tx);
  }

  async function moveTx(tx: Transaction, direction: "up" | "down") {
    setLoading(true);
    try {
      if (accessToken && spreadsheetId) {
        await moveGoogleTransaction(accessToken, spreadsheetId, tx.rowId, direction);
        await reloadFromGoogle();
        return;
      }
      const index = transactions.findIndex((item) => item.rowId === tx.rowId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= transactions.length) return;
      const next = [...transactions];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      setTransactions(next.map((item, idx) => ({ ...item, rowId: idx + 2 })));
    } catch (error) {
      Alert.alert("Mover registro", error instanceof Error ? error.message : "No se pudo mover el registro.");
    } finally {
      setLoading(false);
    }
  }

  function openMoveMenu(tx: Transaction) {
    setPicker({
      title: "Mover registro",
      selectedValue: "",
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
    setDeletedTx(null);
  }

  async function saveFreqIncome() {
    const amount = Number(freqInput);
    if (!Number.isFinite(amount) || amount < 0) {
      Alert.alert("Monto inválido", "Ingresa un monto válido.");
      return;
    }
    const key = `${MONTH_NAMES[month]} ${year}`;
    if (accessToken && spreadsheetId) await updateGoogleFreqIncome(accessToken, spreadsheetId, key, amount);
    const nextFreq = { ...freqIncome, [key]: amount };
    setFreqIncome(nextFreq);
    setSummaries(calculateSummaries(transactions, nextFreq));
    setFreqVisible(false);
  }

  async function exportRows(config: typeof exportConfig) {
    let rows: Transaction[];
    if (config.rangeMode === "dates") {
      const from = config.startDate ? new Date(config.startDate + "T00:00:00").getTime() : 0;
      const to = config.endDate ? new Date(config.endDate + "T23:59:59").getTime() : Infinity;
      rows = transactions.filter((tx) => { const t = new Date(tx.rawDate).getTime(); return t >= from && t <= to; });
    } else {
      rows = transactions.filter((tx) => {
        const d = new Date(tx.rawDate);
        const txYM = d.getFullYear() * 12 + d.getMonth();
        const fromYM = config.startDate ? (new Date(config.startDate + "-01").getFullYear() * 12 + new Date(config.startDate + "-01").getMonth()) : 0;
        const toYM = config.endDate ? (new Date(config.endDate + "-01").getFullYear() * 12 + new Date(config.endDate + "-01").getMonth()) : Infinity;
        return txYM >= fromYM && txYM <= toYM;
      });
    }
    if (!rows.length) {
      Alert.alert("Exportar", "No hay datos para exportar.");
      return;
    }
    if (config.format === "xlsx") {
      const csv = ["Fecha,Monto,Detalle,Tipo,Hora de creacion"]
        .concat(rows.map((tx) => `${tx.date},${tx.amount},"${tx.detail.replace(/"/g, '""')}",${tx.type},${formatCreatedTime(tx.createdAt)}`))
        .join("\n");
      const uri = `${FileSystem.cacheDirectory}bucks-manager.csv`;
      await FileSystem.writeAsStringAsync(uri, csv);
      await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Exportar movimientos" });
    } else {
      const html = `<html><body><h1>Bucks Manager</h1><table border="1" cellspacing="0" cellpadding="6">${rows
        .map((tx) => `<tr><td>${tx.date}</td><td>${formatMoney(tx.amount)}</td><td>${tx.detail}</td><td>${tx.type}</td><td>${formatCreatedTime(tx.createdAt)}</td></tr>`)
        .join("")}</table></body></html>`;
      const pdf = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(pdf.uri, { mimeType: "application/pdf", dialogTitle: "Exportar PDF" });
    }
  }

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    summaries.forEach((row) => {
      const yr = Number(row.monthYear.split(" ").pop());
      if (yr) years.add(yr);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [summaries]);

  const pageTitle = tab === "expenses" ? "Gastos" : tab === "search" ? "Buscar" : tab === "summary" ? "Análisis" : "Ajustes";
  const pageSubtitle = tab === "expenses" ? "" : tab === "search" ? "Filtros de movimientos" : tab === "summary" ? "Resumen por mes" : "Cuenta y exportación";

  if (bootstrapping) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <SkeletonScreen colors={colors} />
      </SafeAreaView>
    );
  }

  if (!accessToken) {
    const canConnect = Boolean(GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <View style={styles.loginScreen}>
          <View style={[styles.loginMark, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            <MaterialCommunityIcons name="sack" size={38} color={colors.onPrimary} />
          </View>
          <Text style={[styles.loginTitle, { color: colors.text }]}>Bucks Manager</Text>
          <TouchableOpacity
            disabled={!canConnect || loading}
            onPress={signInWithGoogle}
            style={[styles.googleLoginBtn, { backgroundColor: canConnect ? colors.primary : colors.disabled }]}
          >
            {loading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <MaterialCommunityIcons name="google" size={21} color={colors.onPrimary} />
                <Text style={[styles.googleLoginText, { color: colors.onPrimary }]}>Acceder con Google</Text>
              </>
            )}
          </TouchableOpacity>
          {!canConnect && <Text style={[styles.loginStatus, { color: colors.muted }]}>Faltan credenciales OAuth en .env</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <View style={[styles.shell, styles.shellCompact, { backgroundColor: colors.bg, paddingTop: statusBarInset + 6 }]}>

        <View style={[styles.content, { width: "100%", position: "relative" }]}>
          <View style={{ paddingTop: tab === "expenses" ? 154 : 62, flex: 1 }}>
            {loading && (
              <View style={styles.loadingBar}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.muted }}>Sincronizando...</Text>
              </View>
            )}

            {tab === "expenses" ? (
              <ExpensesView
                colors={colors}
                summary={currentSummary}
                transactions={visibleTransactions}
                searchActive={searchActive}
                searchText={searchFilters.text}
                selectedRows={selectedRows}
                onEditFreq={() => {
                  setFreqInput(String(currentSummary.freqIncome || 0));
                  setFreqVisible(true);
                }}
                onExitSearch={() => setSearchActive(false)}
                onOpenDetail={handleTransactionPress}
                onEdit={openEdit}
                onDeleteSelected={deleteSelectedRows}
                onMove={openMoveMenu}
                onToggleSelection={toggleSelection}
                onLoadOlder={() => setLoadedMonthCount((current) => current + 1)}
              />
            ) : tab === "search" ? (
              <SearchPage
                colors={colors}
                filters={searchFilters}
                setFilters={setSearchFilters}
                onSubmit={() => {
                  setSearchActive(true);
                  setTab("expenses");
                  setSelectedRows([]);
                }}
                onClear={() => {
                  setSearchFilters(emptySearch);
                  setSearchActive(false);
                }}
              />
            ) : tab === "summary" ? (
              <SummaryView colors={colors} summaries={summaries} availableYears={availableYears} compact={compact} />
            ) : (
              <SettingsView
                colors={colors}
                theme={theme}
                setTheme={setTheme}
                accountInfo={accountInfo}
                onRescan={rescanDrive}
              onSwitch={switchGoogleAccount}
              onDisconnect={disconnectGoogle}
              onOpenExport={() => setExportVisible(true)}
            />
          )}
          </View>

          <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: tab === "expenses" ? 154 : 62, backgroundColor: `${colors.bg}0a` }} />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 28, pointerEvents: "none" }}>
              {[0.45, 0.2, 0.06, 0].map((opacity, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: `${colors.bg}${Math.round(opacity * 255).toString(16).padStart(2, "0")}` }} />
              ))}
            </View>
            <View>
              <View style={[styles.topBar, styles.topBarMobile, { backgroundColor: "transparent" }]}>
                <View style={styles.headerLeft}>
                  <View style={[styles.headerLogo, { backgroundColor: colors.primary }]}>
                    <MaterialCommunityIcons name="sack" size={19} color={colors.onPrimary} />
                  </View>
                  <View style={styles.titleBlock}>
                    <Text numberOfLines={1} style={[styles.pageTitle, styles.pageTitleMobile, { color: colors.text }]}>
                      {pageTitle}
                    </Text>
                    {!!pageSubtitle && (
                      <Text numberOfLines={1} style={[styles.pageSub, styles.pageSubMobile, { color: colors.muted }]}>
                        {pageSubtitle}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              {tab === "expenses" && (
                <PeriodControls
                  colors={colors}
                  year={year}
                  month={month}
                  availableYears={availableYears}
                  onSelectPeriod={selectPeriod}
                  openPicker={setPicker}
                  goToday={() => {
                    const today = new Date();
                    selectPeriod(today.getMonth(), today.getFullYear());
                  }}
                />
              )}
            </View>
          </View>
        </View>

        {deletedTx && (
          <TouchableOpacity style={[styles.undoFab, compact && { left: 18 }, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={undoDelete}>
            <MaterialCommunityIcons name="undo" size={20} color={colors.blue} />
            <Text style={{ color: colors.text, fontWeight: "800" }}>Deshacer</Text>
          </TouchableOpacity>
        )}
        <BottomNav
          colors={colors}
          tab={tab}
          setTab={setTab}
          onAdd={() => openAdd()}
        />
      </View>

      <TransactionModal
        visible={addVisible}
        colors={colors}
        draft={draft}
        editing={!!editingTx}
        setDraft={setDraft}
        openPicker={setPicker}
        onClose={() => setAddVisible(false)}
        onSubmit={submitDraft}
      />
      <FreqIncomeModal visible={freqVisible} colors={colors} value={freqInput} setValue={setFreqInput} onClose={() => setFreqVisible(false)} onSubmit={saveFreqIncome} />
      <DetailModal tx={detailTx} colors={colors} onClose={() => setDetailTx(null)} onEdit={openEdit} onDelete={deleteTx} />
      <SheetChooser
        visible={sheetCandidates.length > 1}
        colors={colors}
        candidates={sheetCandidates}
        onClose={() => setSheetCandidates([])}
        onSelect={(candidate: SheetCandidate) => selectSpreadsheet(accessToken, candidate.id, candidate.name)}
      />
      <OptionSheet config={picker} colors={colors} onClose={() => setPicker(null)} />
      <ExportModal
        visible={exportVisible}
        colors={colors}
        config={exportConfig}
        setConfig={setExportConfig}
        minDate={transactions.length ? transactions.reduce((earliest, tx) => tx.rawDate < earliest ? tx.rawDate : earliest, transactions[0].rawDate).slice(0, 10) : ""}
        onClose={() => setExportVisible(false)}
        onExport={(cfg: typeof exportConfig) => {
          setExportVisible(false);
          exportRows(cfg);
        }}
      />
    </SafeAreaView>
  );
}

function SkeletonScreen({ colors }: { colors: Palette }) {
  return (
    <View style={styles.skeletonScreen}>
      <View style={[styles.skeletonHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.skeletonBox, { width: 42, height: 42, borderRadius: 8, backgroundColor: colors.input }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skeletonBox, { width: "58%", height: 18, backgroundColor: colors.input }]} />
          <View style={[styles.skeletonBox, { width: "34%", height: 12, backgroundColor: colors.input }]} />
        </View>
      </View>
      <View style={styles.skeletonGrid}>
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <View key={item} style={[styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.skeletonBox, { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.input }]} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={[styles.skeletonBox, { width: "50%", height: 10, backgroundColor: colors.input }]} />
              <View style={[styles.skeletonBox, { width: "78%", height: 16, backgroundColor: colors.input }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={[styles.skeletonTable, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[0, 1, 2, 3, 4, 5].map((item) => <View key={item} style={[styles.skeletonRow, { backgroundColor: colors.input }]} />)}
      </View>
    </View>
  );
}

function BottomNav({ colors, tab, setTab, onAdd }: { colors: Palette; tab: Tab; setTab: (tab: Tab) => void; onAdd: () => void }) {
  return (
    <View style={[styles.bottomNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <BottomNavItem colors={colors} active={tab === "expenses"} icon="view-dashboard-outline" label="Gastos" onPress={() => setTab("expenses")} />
      <BottomNavItem colors={colors} active={tab === "search"} icon="magnify" label="Buscar" onPress={() => setTab("search")} />
      <TouchableOpacity onPress={onAdd} style={[styles.bottomAddButton, { backgroundColor: colors.primary }]}>
        <MaterialCommunityIcons name="plus" size={31} color={colors.onPrimary} />
      </TouchableOpacity>
      <BottomNavItem colors={colors} active={tab === "summary"} icon="chart-line" label="Análisis" onPress={() => setTab("summary")} />
      <BottomNavItem colors={colors} active={tab === "settings"} icon="cog-outline" label="Ajustes" onPress={() => setTab("settings")} />
    </View>
  );
}

function BottomNavItem({ colors, active, icon, label, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.bottomNavItem, active && { backgroundColor: colors.primarySoft }]}>
      <MaterialCommunityIcons name={icon} size={21} color={active ? colors.primary : colors.muted} />
      <Text numberOfLines={1} style={[styles.bottomNavLabel, { color: active ? colors.primary : colors.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PeriodControls({ colors, year, month, availableYears, onSelectPeriod, goToday }: any) {
  return (
    <View style={styles.periodControls}>
      <View style={styles.periodTitleBlock}>
        <Text style={[styles.periodEyebrow, { color: colors.muted }]}>PERIODO</Text>
        <Text numberOfLines={1} style={[styles.periodTitle, { color: colors.text }]}>{`${MONTH_NAMES[month]} ${year}`}</Text>
      </View>
      <View style={styles.periodActions}>
        <Select
          value={String(year)}
          options={availableYears.map((item: number) => ({ label: String(item), value: String(item) }))}
          onSelect={(v: string) => onSelectPeriod(month, Number(v))}
          colors={colors}
          style={{ flex: 0, minWidth: 100 }}
        />
        <Select
          value={String(month)}
          options={MONTH_NAMES.map((name, index) => ({ label: name, value: String(index) }))}
          onSelect={(v: string) => onSelectPeriod(Number(v), year)}
          colors={colors}
          style={{ flex: 1 }}
        />
        <TouchableOpacity onPress={goToday} style={[styles.periodToday, { backgroundColor: colors.infoSoft, borderColor: colors.blue }]}>
          <MaterialCommunityIcons name="calendar-today" size={18} color={colors.blue} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SheetChooser({ visible, colors, candidates, onClose, onSelect }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <ModalHeader title="Selecciona tu hoja" icon="google-spreadsheet" colors={colors} onClose={onClose} />
          <Text style={[styles.connectText, { color: colors.muted, marginBottom: 12 }]}>
            Encontré varias hojas compatibles. Elige la que quieres usar como base de datos.
          </Text>
          {candidates.map((candidate: SheetCandidate) => (
            <TouchableOpacity key={candidate.id} style={[styles.sheetChoice, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={() => onSelect(candidate)}>
              <MaterialCommunityIcons name="google-spreadsheet" size={22} color={colors.green} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.sheetChoiceTitle, { color: colors.text }]}>{candidate.name}</Text>
                <Text style={[styles.sheetChoiceMeta, { color: colors.muted }]}>{candidate.modifiedTime ? `Modificada: ${new Date(candidate.modifiedTime).toLocaleDateString("es-PE")}` : "Google Sheets"}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function ExpensesView({
  colors,
  summary,
  transactions,
  searchActive,
  searchText,
  selectedRows,
  onEditFreq,
  onExitSearch,
  onOpenDetail,
  onEdit,
  onDeleteSelected,
  onMove,
  onToggleSelection,
  onLoadOlder,
}: any) {
  const groups = groupTransactionsByDate(transactions);
  const selectedCount = selectedRows.length;
  const selectedTx = transactions.find((tx: Transaction) => tx.rowId === selectedRows[0]);
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pageScroll}>
      <View style={[styles.statsGrid, styles.statsGridMobile]}>
        <StatCard title="Ing. Frec." value={formatMoney(summary.freqIncome)} tone="income" icon="cash" colors={colors} action={onEditFreq} />
        <StatCard title="Ing. No Frec." value={formatMoney(summary.nonFreqIncome)} tone="income" icon="trending-up" colors={colors} />
        <StatCard title="Gasto Frec." value={formatMoney(summary.freqExpense)} tone="expense" icon="credit-card" colors={colors} />
        <StatCard title="Gasto No Frec." value={formatMoney(summary.nonFreqExpense)} tone="expense" icon="trending-down" colors={colors} />
        <StatCard title="Gasto Total" value={formatMoney(summary.totalExpense)} tone="warn" icon="basket" colors={colors} />
        <StatCard title="Balance" value={formatMoney(summary.netMonthly)} tone="balance" icon="wallet" colors={colors} />
      </View>

      {searchActive && (
        <View style={[styles.searchBanner, styles.searchBannerMobile, { backgroundColor: colors.infoSoft, borderColor: colors.blue }]}>
          <Text style={{ color: colors.blue, fontWeight: "800" }}>Mostrando resultados de busqueda avanzada</Text>
          <TouchableOpacity onPress={onExitSearch}>
            <Text style={{ color: colors.blue, fontWeight: "900" }}>Salir</Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedCount > 0 && (
        <View style={[styles.selectionBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.selectionText, { color: colors.text }]}>{selectedCount === 1 ? "1 seleccionado" : `${selectedCount} seleccionados`}</Text>
          <View style={styles.selectionActions}>
            {selectedCount === 1 && selectedTx && (
              <TouchableOpacity style={[styles.selectionBtn, { backgroundColor: colors.editBg, borderColor: colors.editBorder }]} onPress={() => onEdit(selectedTx)}>
                <MaterialCommunityIcons name="pencil" size={18} color={colors.blue} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.selectionBtn, { backgroundColor: colors.expenseSoft, borderColor: colors.red }]} onPress={onDeleteSelected}>
              <MaterialCommunityIcons name="trash-can" size={18} color={colors.red} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.groupedList}>
        {groups.map((group) => (
          <View key={group.key} style={styles.dateGroup}>
            <Text style={[styles.dateGroupLabel, { color: colors.muted }]}>{group.label}</Text>
            <View style={[styles.txGroupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {group.items.map((tx: Transaction, index: number) => {
                const selected = selectedRows.includes(tx.rowId);
                const icon = tx.amount >= 0 ? "bank-transfer-in" : tx.type === "GASTO FRECUENTE" ? "credit-card-outline" : "basket-outline";
                return (
                  <TouchableOpacity
                    key={`${tx.rowId}-${tx.createdAt}`}
                    onPress={() => onOpenDetail(tx)}
                    onLongPress={() => (selected ? onMove(tx) : onToggleSelection(tx))}
                    style={[
                      styles.groupedTxRow,
                      index > 0 && { borderTopWidth: 1, borderColor: colors.border },
                      tx.type === "GASTO FRECUENTE" && { backgroundColor: colors.freqExpenseRow },
                      selected && { backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <View style={[styles.txIcon, { backgroundColor: selected ? colors.infoSoft : typeFill(tx.type, colors), borderColor: selected ? colors.blue : typeColor(tx.type, colors) }]}>
                      <MaterialCommunityIcons name={selected ? "check" : icon} size={18} color={selected ? colors.blue : typeColor(tx.type, colors)} />
                    </View>
                    <View style={styles.groupedTxMain}>
                      <HighlightedText
                        text={tx.detail}
                        query={searchActive ? searchText : ""}
                        style={[styles.groupedTxTitle, { color: colors.text }]}
                        highlightStyle={{ color: colors.onPrimary, backgroundColor: colors.primary, borderRadius: 4 }}
                      />
                      <Text numberOfLines={1} style={[styles.groupedTxMeta, { color: colors.muted }]}>
                        {`${abbrev(tx.type)} · ${formatCreatedTime(tx.createdAt).slice(0, 5)}`}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={[styles.groupedTxAmount, { color: tx.amount >= 0 ? colors.green : colors.red }]}>{formatMoney(tx.amount)}</Text>
                    {selected && <MaterialCommunityIcons name="drag-vertical" size={18} color={colors.muted} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        {!transactions.length && (
          <View style={[styles.mobileEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.empty, { color: colors.muted }]}>No hay movimientos para mostrar.</Text>
          </View>
        )}
        {!searchActive && (
          <TouchableOpacity style={[styles.loadOlderBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onLoadOlder}>
            <Text style={[styles.loadOlderText, { color: colors.text }]}>CARGAR MOVIMIENTOS ANTERIORES</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function SummaryView({ colors, summaries, compact, availableYears }: { colors: Palette; summaries: SummaryRow[]; compact: boolean; availableYears: number[] }) {
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const filtered = filterYear ? summaries.filter((r) => r.monthYear.endsWith(String(filterYear))) : summaries;
  const totals = filtered.reduce(
    (acc, row) => ({
      income: acc.income + row.totalIncome,
      expense: acc.expense + Math.abs(row.totalExpense),
      net: acc.net + row.netMonthly,
    }),
    { income: 0, expense: 0, net: 0 },
  );
  const savings = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : 0;
  const incomeTypes = [
    { label: "Ing. Frecuente", value: summaries.reduce((a, r) => a + r.freqIncome, 0), color: colors.green },
    { label: "Ing. No Frec.", value: summaries.reduce((a, r) => a + r.nonFreqIncome, 0), color: colors.blue },
  ];
  const expenseTypes = [
    { label: "Gasto Frecuente", value: summaries.reduce((a, r) => a + Math.abs(r.freqExpense), 0), color: colors.red },
    { label: "Gasto No Frec.", value: summaries.reduce((a, r) => a + Math.abs(r.nonFreqExpense), 0), color: colors.yellow },
  ];
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, compact && styles.pageScrollMobile]}>
      <View style={[{ flexDirection: "row", gap: 8, marginBottom: 10 }]}>
        <Select
          value={filterYear ? String(filterYear) : ""}
          options={[{ label: "Todos los años", value: "" }, ...availableYears.map((y) => ({ label: String(y), value: String(y) }))]}
          onSelect={(v: string) => { setFilterYear(v ? Number(v) : null); }}
          colors={colors}
          placeholder="Seleccionar año"
          style={{ flex: 1 }}
        />
      </View>
      <View style={[styles.kpiGrid, compact && styles.kpiGridMobile]}>
        <Kpi title="Ingresos Totales" value={`S/ ${totals.income.toFixed(2)}`} icon="trending-up" color={colors.green} colors={colors} />
        <Kpi title="Gastos Totales" value={`S/ ${totals.expense.toFixed(2)}`} icon="trending-down" color={colors.red} colors={colors} />
        <Kpi title="Balance Neto" value={`S/ ${totals.net.toFixed(2)}`} icon="wallet" color={totals.net >= 0 ? colors.blue : colors.red} colors={colors} />
        <Kpi title="Sin Ing. Frec." value={`S/ ${filtered.reduce((a, r) => a + r.netNoFreq, 0).toFixed(2)}`} icon="cash-remove" color={colors.yellow} colors={colors} />
        <Kpi title="Tasa de Ahorro" value={`${savings}%`} icon="piggy-bank" color={colors.blue} colors={colors} />
      </View>
      <View style={[styles.chartRow, compact && styles.chartRowMobile]}>
        <PieCard title="Ingresos" values={incomeTypes.map((t) => t.value)} colors={colors} labels={incomeTypes.map((t) => t.label)} tints={incomeTypes.map((t) => t.color)} />
        <PieCard title="Gastos" values={expenseTypes.map((t) => t.value)} colors={colors} labels={expenseTypes.map((t) => t.label)} tints={expenseTypes.map((t) => t.color)} danger />
      </View>
      <View style={[styles.tableCard, compact && styles.summaryTableMobile, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.gasTableHeader, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <Text style={[styles.gasTableHeadCell, { color: colors.muted, flex: 1.2 }]}>MES</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.muted }]}>ING. FREC.</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.muted }]}>ING. N/FREC</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.green }]}>TOT. ING</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.muted }]}>G. FREC.</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.muted }]}>G. N/FREC</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.red }]}>TOT. G.</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.blue }]}>NETO</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.yellow }]}>NETO SIN IF</Text>
        </View>
        {filtered.map((row) => (
          <View key={row.monthYear} style={[styles.gasTableRow, { borderColor: colors.border }]}>
            <Text style={[styles.gasTableCell, { color: colors.text, flex: 1.2, fontWeight: "900" }]}>{row.monthYear}</Text>
            <Text style={[styles.gasTableCell, { color: colors.green }]}>{formatMoney(row.freqIncome)}</Text>
            <Text style={[styles.gasTableCell, { color: colors.green }]}>{formatMoney(row.nonFreqIncome)}</Text>
            <Text style={[styles.gasTableCell, { color: colors.green, fontWeight: "900" }]}>{formatMoney(row.totalIncome)}</Text>
            <Text style={[styles.gasTableCell, { color: colors.red }]}>{formatMoney(row.freqExpense)}</Text>
            <Text style={[styles.gasTableCell, { color: colors.red }]}>{formatMoney(row.nonFreqExpense)}</Text>
            <Text style={[styles.gasTableCell, { color: colors.red, fontWeight: "900" }]}>{formatMoney(row.totalExpense)}</Text>
            <Text style={[styles.gasTableCell, { color: row.netMonthly >= 0 ? colors.green : colors.red, fontWeight: "900" }]}>{formatMoney(row.netMonthly)}</Text>
            <Text style={[styles.gasTableCell, { color: colors.yellow, fontWeight: "900" }]}>{formatMoney(row.netNoFreq)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function TransactionModal({ visible, colors, draft, setDraft, editing, openPicker, onClose, onSubmit }: any) {
  const [calVisible, setCalVisible] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.recordModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="calculator-variant" size={19} color={colors.blue} /> {editing ? "Editar Registro" : "Nuevo Registro"}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.recordScroll} contentContainerStyle={styles.recordBody} showsVerticalScrollIndicator={false}>
            <Text style={[styles.label, { color: colors.text }]}>Fecha</Text>
            <TouchableOpacity
              style={[{ backgroundColor: colors.input, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, marginBottom: 12 }]}
              onPress={() => setCalVisible(true)}
            >
              <MaterialCommunityIcons name="calendar" size={20} color={colors.blue} />
              <Text style={[{ color: colors.text, fontWeight: "900", flex: 1 }]}>{draft.date || "Seleccionar fecha"}</Text>
            </TouchableOpacity>
            <CalendarPicker visible={calVisible} value={draft.date} onSelect={(v: string) => setDraft({ ...draft, date: v })} onClose={() => setCalVisible(false)} colors={colors} />
            <Text style={[styles.label, { color: colors.text }]}>Tipo</Text>
            <Select
              value={draft.type}
              options={TRANSACTION_TYPES.map((type) => ({ label: titleCaseType(type), value: type }))}
              onSelect={(type: string) => setDraft({ ...draft, type: type as TransactionType })}
              colors={colors}
              placeholder="Seleccionar tipo"
              style={{ marginBottom: 18 }}
            />
            <Text style={[styles.label, { color: colors.text }]}>
              Monto <Text style={{ color: colors.muted, fontSize: 13 }}>(puedes hacer operaciones: + - * /)</Text>
            </Text>
            <View style={[styles.moneyInputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Text style={[styles.moneyPrefix, { color: colors.text }]}>S/</Text>
              <TextInput
                value={draft.amount}
                onChangeText={(amount: string) => setDraft({ ...draft, amount })}
                placeholder="Ej: (100+50)*25-10/2"
                placeholderTextColor={colors.muted}
                style={[styles.moneyInput, { color: colors.text }]}
              />
            </View>
            <Field label="Detalle" value={draft.detail} onChangeText={(detail: string) => setDraft({ ...draft, detail })} colors={colors} placeholder="Ej: Compra en supermercado" />
            <View style={styles.recordActions}>
              <TouchableOpacity style={[styles.recordCancel, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
                <Text style={[styles.recordCancelText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.recordSubmit, { backgroundColor: colors.primary }]} onPress={onSubmit}>
                <MaterialCommunityIcons name="plus" size={20} color={colors.onPrimary} />
                <Text style={[styles.recordSubmitText, { color: colors.onPrimary }]}>{editing ? "Guardar" : "Agregar"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SearchPage({ colors, filters, setFilters, onSubmit, onClear }: any) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, styles.pageScrollMobile]}>
      <View style={[styles.pagePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.pagePanelHeader}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.primary} />
        <Text style={[styles.pagePanelTitle, { color: colors.text }]}>Búsqueda avanzada</Text>
        </View>
        <Field label="Descripción / Detalle" value={filters.text} onChangeText={(text: string) => setFilters({ ...filters, text })} colors={colors} />
        <View style={styles.twoCols}>
          <Field label="Monto mínimo" value={filters.minAmount} onChangeText={(minAmount: string) => setFilters({ ...filters, minAmount })} colors={colors} />
          <Field label="Monto máximo" value={filters.maxAmount} onChangeText={(maxAmount: string) => setFilters({ ...filters, maxAmount })} colors={colors} />
        </View>
        <View style={styles.twoCols}>
          <Field label="Desde" value={filters.startDate} onChangeText={(startDate: string) => setFilters({ ...filters, startDate })} colors={colors} placeholder="YYYY-MM-DD" />
          <Field label="Hasta" value={filters.endDate} onChangeText={(endDate: string) => setFilters({ ...filters, endDate })} colors={colors} placeholder="YYYY-MM-DD" />
        </View>
        <ActionRow colors={colors} onCancel={onClear} onSubmit={onSubmit} submitLabel="Buscar" cancelLabel="Limpiar" />
      </View>
    </ScrollView>
  );
}

function SettingsView({ colors, theme, setTheme, accountInfo, onRescan, onSwitch, onDisconnect, onOpenExport }: any) {
  const initial = (accountInfo?.email || accountInfo?.name || "B").slice(0, 1).toUpperCase();
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, styles.pageScrollMobile]}>
      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: colors.muted }]}>CUENTA</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.settingsRow, { borderColor: colors.border }]} onPress={onSwitch}>
            <View style={[styles.settingsAvatar, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
              <Text style={[styles.accountInitial, { color: colors.primary }]}>{initial}</Text>
            </View>
            <View style={styles.settingsRowText}>
              <Text numberOfLines={1} style={[styles.accountHeroName, { color: colors.text }]}>{accountInfo?.name || "Cuenta conectada"}</Text>
              <Text numberOfLines={1} style={[styles.accountHeroEmail, { color: colors.muted }]}>{accountInfo?.email || "Google"}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
          </TouchableOpacity>
          <SettingsRow colors={colors} icon="google-drive" label="Buscar hoja en Drive" onPress={onRescan} />
          <SettingsRow colors={colors} icon="account-switch" label="Cambiar o agregar cuenta" onPress={onSwitch} last />
        </View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: colors.muted }]}>TEMA</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.settingsRow, { borderColor: colors.border }]} onPress={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <MaterialCommunityIcons name={theme === "dark" ? "weather-night" : "white-balance-sunny"} size={22} color={colors.yellow} />
            <Text style={[styles.settingsRowLabel, { color: colors.text }]}>Modo oscuro</Text>
            <View style={[styles.themeToggle, { backgroundColor: theme === "dark" ? colors.primary : colors.switchTrack }]}>
              <View style={[styles.themeThumb, theme === "dark" ? { marginLeft: 23 } : { marginLeft: 0 }]} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: colors.muted }]}>EXPORTAR</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsRow colors={colors} icon="file-export" label="Exportar movimientos" onPress={onOpenExport} last />
        </View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={onDisconnect}>
        <Text style={[styles.signOutText, { color: colors.red }]}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SettingsRow({ colors, icon, label, onPress, last = false }: any) {
  return (
    <TouchableOpacity style={[styles.settingsRow, !last && { borderBottomWidth: 1, borderColor: colors.border }]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.blue} />
      <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
    </TouchableOpacity>
  );
}

function OptionSheet({ config, colors, onClose }: { config: PickerConfig; colors: Palette; onClose: () => void }) {
  if (!config) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.optionOverlay}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.optionSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.optionHeader, { borderColor: colors.border }]}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>{config.title}</Text>
            <TouchableOpacity style={[styles.optionClose, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.optionList} contentContainerStyle={styles.optionListContent} showsVerticalScrollIndicator={false}>
            {config.options.map((option) => {
              const selected = option.value === config.selectedValue;
              const tone = option.tone || colors.primary;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionRow,
                    { backgroundColor: selected ? colors.primarySoft : colors.input, borderColor: selected ? colors.primary : colors.border },
                  ]}
                  onPress={() => {
                    config.onSelect(option.value);
                    onClose();
                  }}
                >
                  <View style={[styles.optionIcon, { backgroundColor: selected ? colors.primarySoft : colors.card, borderColor: tone }]}>
                    <MaterialCommunityIcons name={(option.icon || "chevron-right") as any} size={19} color={tone} />
                  </View>
                  <Text numberOfLines={1} style={[styles.optionLabel, { color: selected ? colors.primary : colors.text }]}>{option.label}</Text>
                  {selected && <MaterialCommunityIcons name="check" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FreqIncomeModal({ visible, colors, value, setValue, onClose, onSubmit }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <ModalHeader title="Ingreso frecuente" icon="cash" colors={colors} onClose={onClose} />
          <Field label="Monto" value={value} onChangeText={setValue} colors={colors} />
          <ActionRow colors={colors} onCancel={onClose} onSubmit={onSubmit} submitLabel="Guardar" />
        </View>
      </View>
    </Modal>
  );
}

function DetailModal({ tx, colors, onClose, onEdit, onDelete }: { tx: Transaction | null; colors: Palette; onClose: () => void; onEdit: (tx: Transaction) => void; onDelete: (tx: Transaction) => void }) {
  return (
    <Modal visible={!!tx} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.detailModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.recordHeader, { borderBottomWidth: 0 }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="receipt-text" size={20} color={colors.yellow} /> Detalle del gasto
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { borderWidth: 0, backgroundColor: "transparent" }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          {tx && (
            <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
              <View style={styles.detailHero}>
                <View style={[styles.detailHeroIcon, { backgroundColor: tx.amount >= 0 ? colors.incomeSoft : colors.expenseSoft }]}>
                  <MaterialCommunityIcons name={tx.amount >= 0 ? "bank-transfer-in" : "receipt-text-outline"} size={24} color={tx.amount >= 0 ? colors.green : colors.red} />
                </View>
                <View style={styles.detailHeroText}>
                  <Text style={[styles.detailHeroLabel, { color: colors.muted }]}>{titleCaseType(tx.type)}</Text>
                  <Text numberOfLines={1} style={[styles.detailHeroAmount, { color: tx.amount >= 0 ? colors.green : colors.red }]}>{formatMoney(tx.amount)}</Text>
                </View>
              </View>

              <View style={styles.detailDescription}>
                <Text style={[styles.detailSectionLabel, { color: colors.muted }]}>Detalle</Text>
                <Text selectable style={[styles.detailDescriptionText, { color: colors.text }]}>{tx.detail}</Text>
              </View>

              <View style={styles.detailMetaGrid}>
                <DetailMeta icon="calendar" label="Fecha" value={tx.date} tone={colors.blue} colors={colors} />
                <DetailMeta icon="clock-outline" label="Hora" value={formatCreatedTime(tx.createdAt)} tone={colors.muted} colors={colors} />
              </View>

              <View style={styles.detailActions}>
                <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.input }]} onPress={() => onEdit(tx)}>
                  <MaterialCommunityIcons name="pencil" size={18} color={colors.blue} />
                  <Text style={[styles.detailActionText, { color: colors.blue }]}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.input }]} onPress={() => onDelete(tx)}>
                  <MaterialCommunityIcons name="trash-can" size={18} color={colors.red} />
                  <Text style={[styles.detailActionText, { color: colors.red }]}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ModalHeader({ title, icon, colors, onClose }: any) {
  return (
    <View style={styles.modalHeader}>
      <Text style={[styles.modalTitle, { color: colors.text }]}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.blue} /> {title}
      </Text>
      <TouchableOpacity onPress={onClose}>
        <MaterialCommunityIcons name="close" size={24} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}

function Field({ label, value, onChangeText, colors, placeholder = "", rightIcon }: any) {
  return (
    <View style={{ flex: 1, marginBottom: 12 }}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={{ position: "relative" }}>
        <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, rightIcon && { paddingRight: 46 }, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} />
        {rightIcon && <MaterialCommunityIcons name={rightIcon} size={22} color={colors.text} style={styles.inputIcon} />}
      </View>
    </View>
  );
}

function ActionRow({ colors, onCancel, onSubmit, submitLabel, cancelLabel = "Cancelar" }: any) {
  return (
    <View style={styles.modalActions}>
      <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.input }]} onPress={onCancel}>
        <Text style={{ color: colors.text, fontWeight: "800" }}>{cancelLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={onSubmit}>
        <Text style={[styles.saveText, { color: colors.onPrimary }]}>{submitLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function StatCard({ title, value, icon, tone, colors, action }: any) {
  const color = tone === "income" ? colors.green : tone === "warn" ? colors.yellow : tone === "balance" ? colors.blue : colors.red;
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}22` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <View style={styles.statContent}>
        <Text numberOfLines={1} style={[styles.statLabel, { color: colors.muted }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.statValue, { color }]}>{value}</Text>
      </View>
      {action && (
        <TouchableOpacity style={styles.editStat} onPress={action}>
          <MaterialCommunityIcons name="pencil" size={16} color={colors.blue} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function Kpi({ title, value, icon, color, colors }: any) {
  return (
    <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Text style={[styles.statLabel, { color: colors.muted }]}>{title}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
    </View>
  );
}

function PieCard({ title, values, colors, labels, tints, danger = false }: any) {
  const total = values.reduce((a: number, b: number) => a + b, 0) || 1;
  let cumulative = 0;
  const segments = values.map((v: number) => {
    const start = cumulative;
    cumulative += v;
    return { value: v, pct: v / total, startAngle: (start / total) * 360 };
  });
  const stroke = 2 * Math.PI * 38;
  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title} — S/ {values.reduce((a: number, b: number) => a + b, 0).toFixed(2)}</Text>
      <Svg width={128} height={128}>
        <Circle cx={64} cy={64} r={38} stroke={colors.border} strokeWidth={18} fill="none" />
        {segments.map((seg: any, i: number) => {
          const color = tints?.[i] || (danger ? colors.red : colors.green);
          return (
            <Circle
              key={i}
              cx={64} cy={64} r={38}
              stroke={color}
              strokeWidth={18} fill="none"
              strokeDasharray={`${stroke * seg.pct} ${stroke}`}
              strokeLinecap="butt"
              rotation={seg.startAngle - 90}
              origin="64,64"
            />
          );
        })}
      </Svg>
      {labels && <View style={{ width: "100%", marginTop: 8, gap: 4 }}>
        {labels.map((label: string, i: number) => {
          const color = tints?.[i] || (danger ? colors.red : colors.green);
          return (
            <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
              <Text style={{ flex: 1, fontSize: 11, fontWeight: "800", color: colors.text }}>{label}</Text>
              <Text style={{ fontSize: 11, fontWeight: "900", color }}>S/ {values[i].toFixed(2)}</Text>
            </View>
          );
        })}
      </View>}
    </View>
  );
}

function BarChart({ rows, colors }: { rows: SummaryRow[]; colors: Palette }) {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.totalIncome, Math.abs(row.totalExpense))));
  return (
    <Svg width="100%" height={190}>
      {rows.slice(-12).map((row, index) => {
        const x = 18 + index * 26;
        const inc = (row.totalIncome / max) * 120;
        const exp = (Math.abs(row.totalExpense) / max) * 120;
        return (
          <G key={row.monthYear}>
            <Rect x={x} y={150 - inc} width={9} height={inc} rx={3} fill={colors.green} />
            <Rect x={x + 11} y={150 - exp} width={9} height={exp} rx={3} fill={colors.red} />
          </G>
        );
      })}
    </Svg>
  );
}

function DetailMeta({ icon, label, value, tone, colors }: any) {
  return (
    <View style={styles.detailMetaItem}>
      <MaterialCommunityIcons name={icon as any} size={18} color={tone} />
      <View style={styles.detailMetaText}>
        <Text style={[styles.detailMetaLabel, { color: colors.muted }]}>{label}</Text>
        <Text numberOfLines={1} selectable style={[styles.detailMetaValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function HighlightedText({ text, query, style, highlightStyle }: any) {
  const value = String(text || "");
  const needle = String(query || "").trim();
  if (!needle) return <Text numberOfLines={1} style={style}>{value}</Text>;
  const lowerValue = value.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  let index = lowerValue.indexOf(lowerNeedle);
  while (index >= 0) {
    if (index > cursor) parts.push({ text: value.slice(cursor, index), match: false });
    parts.push({ text: value.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
    index = lowerValue.indexOf(lowerNeedle, cursor);
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), match: false });
  return (
    <Text numberOfLines={1} style={style}>
      {parts.map((part, indexPart) => (
        <Text key={`${part.text}-${indexPart}`} style={part.match ? highlightStyle : undefined}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

const MONTH_ABBR = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];
const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function CalendarPicker({ visible, value, onSelect, onClose, colors, mode = "date", minDate, maxDate }: { visible: boolean; value: string; onSelect: (v: string) => void; onClose: () => void; colors: Palette; mode?: "date" | "month"; minDate?: string; maxDate?: string }) {
  const parsed = value ? new Date(value + (value.length <= 7 ? "-15T12:00:00" : "T12:00:00")) : new Date();
  const [viewYear, setViewYear] = useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.getMonth());
  const [selectedDay, setSelectedDay] = useState(parsed.getDate());
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const effectiveMax = maxDate || todayStr;
  const effectiveMin = minDate || "2020-01-01";
  const minParsed = new Date(effectiveMin + (effectiveMin.length <= 7 ? "-15T12:00:00" : "T12:00:00"));
  const maxParsed = new Date(effectiveMax + (effectiveMax.length <= 7 ? "-15T12:00:00" : "T12:00:00"));
  const minYear = Number.isNaN(minParsed.getFullYear()) ? 2000 : minParsed.getFullYear();
  const maxYear = Number.isNaN(maxParsed.getFullYear()) ? now.getFullYear() : maxParsed.getFullYear();
  const canGoBackYear = viewYear > minYear;
  const canGoForwardYear = viewYear < maxYear;
  const canGoBackMonth = viewYear === minYear ? viewMonth > minParsed.getMonth() : viewYear > minYear;
  const canGoForwardMonth = viewYear === maxYear ? viewMonth < maxParsed.getMonth() : viewYear < maxYear;

  const monthName = MONTH_NAMES[viewMonth];
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const isDayDisabled = (day: number) => {
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return ds < effectiveMin || ds > effectiveMax;
  };
  const isMonthDisabled = (m: number) => {
    const padM = String(m + 1).padStart(2, "0");
    const padMinM = String(minParsed.getMonth() + 1).padStart(2, "0");
    const padMaxM = String(maxParsed.getMonth() + 1).padStart(2, "0");
    const minKey = `${minYear}-${padMinM}`;
    const maxKey = `${maxYear}-${padMaxM}`;
    const curKey = `${viewYear}-${padM}`;
    return curKey < minKey || curKey > maxKey;
  };

  const handleSelect = (y: number, m: number, d?: number) => {
    if (mode === "month") {
      onSelect(`${y}-${String(m + 1).padStart(2, "0")}`);
    } else {
      const day = d || 1;
      onSelect(`${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} activeOpacity={1} onPress={onClose} />
      <View style={[{ position: "absolute", left: "50%", top: "50%", transform: [{ translateX: -150 }, { translateY: -200 }], width: 300, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: "hidden", elevation: 20, zIndex: 9999 }]}>
        <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10, borderBottomWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <TouchableOpacity onPress={() => canGoBackYear && setViewYear(viewYear - 1)} disabled={!canGoBackYear}>
              <MaterialCommunityIcons name="chevron-left" size={26} color={canGoBackYear ? colors.text : colors.disabled} />
            </TouchableOpacity>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>{viewYear}</Text>
            <TouchableOpacity onPress={() => canGoForwardYear && setViewYear(viewYear + 1)} disabled={!canGoForwardYear}>
              <MaterialCommunityIcons name="chevron-right" size={26} color={canGoForwardYear ? colors.text : colors.disabled} />
            </TouchableOpacity>
          </View>
          {mode === "date" && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <TouchableOpacity onPress={() => canGoBackMonth && setViewMonth(Math.max(0, viewMonth - 1))} disabled={!canGoBackMonth}>
                <MaterialCommunityIcons name="chevron-left" size={22} color={canGoBackMonth ? colors.muted : colors.disabled} />
              </TouchableOpacity>
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "900" }}>{monthName}</Text>
              <TouchableOpacity onPress={() => canGoForwardMonth && setViewMonth(Math.min(11, viewMonth + 1))} disabled={!canGoForwardMonth}>
                <MaterialCommunityIcons name="chevron-right" size={22} color={canGoForwardMonth ? colors.muted : colors.disabled} />
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={{ padding: 12 }}>
          {mode === "month" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {MONTH_ABBR.map((abbr, i) => {
                const isSelected = i === viewMonth;
                const disabled = isMonthDisabled(i);
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => !disabled && handleSelect(viewYear, i)}
                    disabled={disabled}
                    style={{ width: "25%", paddingVertical: 10, alignItems: "center" }}
                  >
                    <View style={{ width: 52, height: 36, borderRadius: 18, backgroundColor: isSelected ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: disabled ? colors.disabled : isSelected ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: "900" }}>{abbr}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", marginBottom: 4 }}>
                {DAY_LABELS.map((d) => (
                  <Text key={d} style={{ flex: 1, textAlign: "center", color: colors.muted, fontSize: 11, fontWeight: "900" }}>{d}</Text>
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <View key={`e-${i}`} style={{ width: `${100 / 7}%` }} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
                  const isSelected = day === selectedDay;
                  const disabled = isDayDisabled(day);
                  return (
                    <TouchableOpacity key={day} onPress={() => { if (!disabled) { setSelectedDay(day); handleSelect(viewYear, viewMonth, day); } }} disabled={disabled} style={{ width: `${100 / 7}%`, paddingVertical: 6, alignItems: "center" }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isSelected ? colors.primary : isToday ? colors.primarySoft : "transparent", alignItems: "center", justifyContent: "center", borderWidth: isToday && !isSelected ? 1 : 0, borderColor: colors.primary, opacity: disabled ? 0.3 : 1 }}>
                        <Text style={{ color: isSelected ? colors.onPrimary : isToday ? colors.primary : colors.text, fontSize: 13, fontWeight: isSelected ? "900" : "700" }}>{day}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, paddingTop: 6, borderTopWidth: 1, borderColor: colors.border }}>
          <TouchableOpacity onPress={() => {
            const nowDate = new Date();
            if (mode === "month") onSelect(`${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`);
            else onSelect(formatDateToISO(nowDate));
            onClose();
          }}>
            <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 14 }}>Este mes</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onSelect(""); onClose(); }}>
            <Text style={{ color: colors.muted, fontWeight: "900", fontSize: 14 }}>Borrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Select({ value, options, onSelect, colors, placeholder, style }: any) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o: any) => o.value === value);
  return (
    <View style={[{ position: "relative" }, style]}>
      <TouchableOpacity
        style={[{ backgroundColor: colors.input, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderWidth: 1 }]}
        onPress={() => setOpen(!open)}
      >
        <Text numberOfLines={1} style={[{ color: selected ? colors.text : colors.muted, fontWeight: "900", flex: 1 }]}>{selected ? selected.label : placeholder}</Text>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
      </TouchableOpacity>
      {open && (
        <>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { zIndex: 998 }]} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={[{ position: "absolute", top: 46, left: 0, right: 0, maxHeight: 200, backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, borderWidth: 1, zIndex: 999, overflow: "hidden", elevation: 999 }]}>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              {options.map((opt: any) => {
                const isSelected = opt.value === value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[{ paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: isSelected ? colors.primarySoft : "transparent" }]}
                    onPress={() => { onSelect(opt.value); setOpen(false); }}
                  >
                    <Text style={[{ color: isSelected ? colors.primary : colors.text, fontWeight: "900" }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

function ExportModal({ visible, colors, config, setConfig, minDate, onClose, onExport }: any) {
  const [calFrom, setCalFrom] = useState(false);
  const [calTo, setCalTo] = useState(false);
  const rangeLabel = (val: string, isMonth?: boolean) => {
    if (!val) return "Seleccionar";
    if (isMonth) {
      const [y, m] = val.split("-");
      return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
    }
    const d = new Date(val + "T12:00:00");
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  };
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <ModalHeader title="Exportar movimientos" icon="file-export" colors={colors} onClose={onClose} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
            <Text style={[styles.label, { color: colors.text }]}>Formato</Text>
            <View style={styles.twoCols}>
              <TouchableOpacity
                style={[styles.exportChip, { backgroundColor: config.format === "xlsx" ? colors.primarySoft : colors.input, borderColor: config.format === "xlsx" ? colors.primary : colors.border }]}
                onPress={() => setConfig({ ...config, format: "xlsx" })}
              >
                <MaterialCommunityIcons name="file-delimited" size={20} color={config.format === "xlsx" ? colors.primary : colors.muted} />
                <Text style={[{ color: config.format === "xlsx" ? colors.primary : colors.text, fontWeight: "900" }]}>CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportChip, { backgroundColor: config.format === "pdf" ? colors.primarySoft : colors.input, borderColor: config.format === "pdf" ? colors.primary : colors.border }]}
                onPress={() => setConfig({ ...config, format: "pdf" })}
              >
                <MaterialCommunityIcons name="file-pdf-box" size={20} color={config.format === "pdf" ? colors.primary : colors.muted} />
                <Text style={[{ color: config.format === "pdf" ? colors.primary : colors.text, fontWeight: "900" }]}>PDF</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Rango</Text>
            <View style={styles.twoCols}>
              <TouchableOpacity
                style={[styles.exportChip, { backgroundColor: config.rangeMode === "dates" ? colors.primarySoft : colors.input, borderColor: config.rangeMode === "dates" ? colors.primary : colors.border }]}
                onPress={() => setConfig({ ...config, rangeMode: "dates" })}
              >
                <MaterialCommunityIcons name="calendar-range" size={20} color={config.rangeMode === "dates" ? colors.primary : colors.muted} />
                <Text style={[{ color: config.rangeMode === "dates" ? colors.primary : colors.text, fontWeight: "900" }]}>Por fechas</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportChip, { backgroundColor: config.rangeMode === "months" ? colors.primarySoft : colors.input, borderColor: config.rangeMode === "months" ? colors.primary : colors.border }]}
                onPress={() => setConfig({ ...config, rangeMode: "months" })}
              >
                <MaterialCommunityIcons name="calendar-month" size={20} color={config.rangeMode === "months" ? colors.primary : colors.muted} />
                <Text style={[{ color: config.rangeMode === "months" ? colors.primary : colors.text, fontWeight: "900" }]}>Por meses</Text>
              </TouchableOpacity>
            </View>
            {config.rangeMode === "months" ? (
              <>
                <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Mes inicial</Text>
                <TouchableOpacity
                  style={[{ backgroundColor: colors.input, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1 }]}
                  onPress={() => setCalFrom(true)}
                >
                  <MaterialCommunityIcons name="calendar" size={20} color={colors.blue} />
                  <Text style={{ color: config.startDate ? colors.text : colors.muted, fontWeight: "900", flex: 1 }}>{rangeLabel(config.startDate, true)}</Text>
                </TouchableOpacity>
                <CalendarPicker visible={calFrom} value={config.startDate} mode="month" minDate={minDate ? minDate.slice(0, 7) : undefined} onSelect={(v: string) => setConfig({ ...config, startDate: v })} onClose={() => setCalFrom(false)} colors={colors} />
                <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Mes final</Text>
                <TouchableOpacity
                  style={[{ backgroundColor: colors.input, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1 }]}
                  onPress={() => setCalTo(true)}
                >
                  <MaterialCommunityIcons name="calendar" size={20} color={colors.blue} />
                  <Text style={{ color: config.endDate ? colors.text : colors.muted, fontWeight: "900", flex: 1 }}>{rangeLabel(config.endDate, true)}</Text>
                </TouchableOpacity>
                <CalendarPicker visible={calTo} value={config.endDate} mode="month" minDate={minDate ? minDate.slice(0, 7) : undefined} onSelect={(v: string) => setConfig({ ...config, endDate: v })} onClose={() => setCalTo(false)} colors={colors} />
              </>
            ) : (
              <>
                <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Desde</Text>
                <TouchableOpacity
                  style={[{ backgroundColor: colors.input, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1 }]}
                  onPress={() => setCalFrom(true)}
                >
                  <MaterialCommunityIcons name="calendar" size={20} color={colors.blue} />
                  <Text style={{ color: config.startDate ? colors.text : colors.muted, fontWeight: "900", flex: 1 }}>{rangeLabel(config.startDate)}</Text>
                </TouchableOpacity>
                <CalendarPicker visible={calFrom} value={config.startDate} mode="date" minDate={minDate} onSelect={(v: string) => setConfig({ ...config, startDate: v })} onClose={() => setCalFrom(false)} colors={colors} />
                <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Hasta</Text>
                <TouchableOpacity
                  style={[{ backgroundColor: colors.input, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1 }]}
                  onPress={() => setCalTo(true)}
                >
                  <MaterialCommunityIcons name="calendar" size={20} color={colors.blue} />
                  <Text style={{ color: config.endDate ? colors.text : colors.muted, fontWeight: "900", flex: 1 }}>{rangeLabel(config.endDate)}</Text>
                </TouchableOpacity>
                <CalendarPicker visible={calTo} value={config.endDate} mode="date" minDate={minDate} onSelect={(v: string) => setConfig({ ...config, endDate: v })} onClose={() => setCalTo(false)} colors={colors} />
              </>
            )}
            <ActionRow colors={colors} onCancel={onClose} onSubmit={() => onExport(config)} submitLabel="Exportar" />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function abbrev(type: string) {
  return type
    .replace("INGRESO", "Ing.")
    .replace("GASTO", "G.")
    .replace("NO FRECUENTE", "No Frec.")
    .replace("FRECUENTE", "Frec.");
}

function titleCaseType(type: string) {
  return type
    .toLowerCase()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function typeColor(type: string, colors: Palette) {
  if (type === "INGRESO NO FRECUENTE") return colors.green;
  if (type === "INGRESO FRECUENTE") return colors.green;
  if (type === "GASTO FRECUENTE") return colors.red;
  return colors.yellow;
}

function typeFill(type: string, colors: Palette) {
  if (type === "INGRESO NO FRECUENTE" || type === "INGRESO FRECUENTE") return colors.incomeSoft;
  if (type === "GASTO FRECUENTE") return colors.expenseSoft;
  return colors.warnSoft;
}

function typeTextColor(type: string, colors: Palette) {
  return typeColor(type, colors);
}

function formatCreatedTime(createdAt?: string) {
  if (!createdAt) return "-";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

type Palette = typeof dark;

const dark = {
  bg: "#0b0f0d",
  card: "#151b17",
  input: "#0f1512",
  border: "#2d3933",
  text: "#f1f4ee",
  muted: "#9aa69e",
  primary: "#c9dc58",
  primarySoft: "rgba(201,220,88,0.14)",
  onPrimary: "#17200f",
  green: "#69b77a",
  incomeSoft: "rgba(105,183,122,0.14)",
  red: "#e1665f",
  expenseSoft: "rgba(225,102,95,0.14)",
  yellow: "#d9a94d",
  warnSoft: "rgba(217,169,77,0.15)",
  blue: "#62a8c7",
  infoSoft: "rgba(98,168,199,0.14)",
  disabled: "#3d4741",
  switchTrack: "#22302b",
  editBg: "#10252a",
  editBorder: "#2e6f82",
  freqExpenseRow: "#241817",
};

const light = {
  bg: "#f4f6ef",
  card: "#fffef9",
  input: "#edf1e7",
  border: "#c8d2c4",
  text: "#172118",
  muted: "#667168",
  primary: "#6f821e",
  primarySoft: "rgba(111,130,30,0.13)",
  onPrimary: "#ffffff",
  green: "#347f55",
  incomeSoft: "rgba(52,127,85,0.12)",
  red: "#c84f47",
  expenseSoft: "rgba(200,79,71,0.12)",
  yellow: "#a36f20",
  warnSoft: "rgba(163,111,32,0.13)",
  blue: "#347c95",
  infoSoft: "rgba(52,124,149,0.12)",
  disabled: "#c9d2cb",
  switchTrack: "#dbe5d5",
  editBg: "#e4eff0",
  editBorder: "#9ec7d2",
  freqExpenseRow: "#fae9e7",
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  shell: { flex: 1, flexDirection: "row", padding: 12, gap: 12 },
  shellCompact: { flexDirection: "column", padding: 0, gap: 0 },
  content: { flex: 1 },
  pageScroll: { paddingBottom: 172 },
  pageScrollMobile: { paddingHorizontal: 14 },
  loginScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 26 },
  loginMark: { width: 78, height: 78, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  loginTitle: { fontSize: 30, fontWeight: "900", textAlign: "center" },
  googleLoginBtn: { minWidth: 232, minHeight: 50, marginTop: 22, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleLoginText: { fontSize: 15, fontWeight: "900" },
  loginStatus: { marginTop: 14, fontSize: 12, fontWeight: "700", textAlign: "center" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  topBarMobile: { marginBottom: 0, paddingHorizontal: 12, paddingVertical: 10 },
  headerLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogo: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  titleBlock: { flex: 1, minWidth: 0 },
  pageTitle: { fontSize: 28, fontWeight: "900" },
  pageTitleMobile: { fontSize: 20 },
  pageSub: { fontSize: 13, fontWeight: "700" },
  pageSubMobile: { fontSize: 14 },
  themeToggle: { width: 58, height: 34, borderRadius: 999, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  themeThumb: { width: 29, height: 29, borderRadius: 15, backgroundColor: "#ffffff" },
  periodControls: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 10 },
  periodTitleBlock: { gap: 3 },
  periodEyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 0 },
  periodTitle: { fontSize: 18, fontWeight: "900" },
  periodActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  periodSelect: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  periodMonthSelect: { flex: 1, minWidth: 0 },
  periodSelectText: { fontSize: 14, fontWeight: "900" },
  periodToday: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  connectText: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  loadingBar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  skeletonScreen: { flex: 1, padding: 14, gap: 14 },
  skeletonHeader: { borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  skeletonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skeletonCard: { width: "48.8%", borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  skeletonTable: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  skeletonRow: { height: 42, borderRadius: 8 },
  skeletonBox: { borderRadius: 8, opacity: 0.92 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  statsGridMobile: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, gap: 8, marginBottom: 0 },
  statCard: { flexGrow: 1, flexBasis: "48%", minWidth: 0, borderWidth: 1, borderRadius: 11, padding: 12, position: "relative", flexDirection: "row", alignItems: "center", gap: 10 },
  statIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statContent: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  statValue: { fontSize: 15, fontWeight: "900", marginTop: 4 },
  editStat: { position: "absolute", right: 10, top: 10 },
  searchBanner: { borderRadius: 8, borderWidth: 1, padding: 12, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  searchBannerMobile: { marginHorizontal: 14 },
  tableCard: { borderWidth: 1, borderRadius: 8, overflow: "hidden", marginBottom: 18 },
  summaryTableMobile: { borderRadius: 14 },
  empty: { padding: 18, textAlign: "center", fontWeight: "700" },
  mobileEmptyCard: { borderWidth: 1, borderRadius: 14 },
  selectionBar: { marginHorizontal: 14, marginBottom: 10, borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  selectionText: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "900" },
  selectionActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectionBtn: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  groupedList: { paddingHorizontal: 14, gap: 18 },
  dateGroup: { gap: 8 },
  dateGroupLabel: { paddingHorizontal: 4, fontSize: 11, fontWeight: "900", letterSpacing: 0 },
  txGroupCard: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  groupedTxRow: { minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 11 },
  txIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  groupedTxMain: { flex: 1, minWidth: 0 },
  groupedTxTitle: { fontSize: 14, fontWeight: "900" },
  groupedTxMeta: { marginTop: 2, fontSize: 11, fontWeight: "800" },
  groupedTxAmount: { maxWidth: 110, fontSize: 14, fontWeight: "900", textAlign: "right" },
  loadOlderBtn: { minHeight: 48, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  loadOlderText: { fontSize: 11, fontWeight: "900", letterSpacing: 0 },
  undoFab: { position: "absolute", left: 18, bottom: 96, borderRadius: 999, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", gap: 8 },
  bottomNav: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 78, borderTopWidth: 1, paddingTop: 8, paddingBottom: 10, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  bottomNavItem: { flex: 1, minWidth: 0, minHeight: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 4 },
  bottomAddButton: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginTop: -24 },
  bottomNavLabel: { fontSize: 11, fontWeight: "900" },
  sheetChoice: { borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  sheetChoiceTitle: { fontSize: 15, fontWeight: "900" },
  sheetChoiceMeta: { fontSize: 12, fontWeight: "700", marginTop: 3 },
  accountInitial: { fontSize: 24, fontWeight: "900" },
  accountHeroName: { fontSize: 18, fontWeight: "900" },
  accountHeroEmail: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  kpiGridMobile: { gap: 8, marginBottom: 10 },
  kpi: { flexGrow: 1, flexBasis: "23%", minWidth: 150, borderWidth: 1, borderRadius: 8, padding: 14 },
  kpiValue: { fontSize: 20, fontWeight: "900", marginTop: 5 },
  chartRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  chartRowMobile: { flexDirection: "column", gap: 10 },
  chartCard: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 14, alignItems: "center", marginBottom: 12 },
  chartCardMobile: { width: "100%" },
  sectionTitle: { alignSelf: "flex-start", fontSize: 16, fontWeight: "900", marginBottom: 10 },
  piePct: { position: "absolute", top: 82, fontSize: 18, fontWeight: "900" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", padding: 14, borderBottomWidth: 1 },
  summaryMonth: { fontWeight: "900" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "center", padding: 14 },
  modal: { borderRadius: 8, padding: 16, maxWidth: 620, maxHeight: "90%", width: "100%", alignSelf: "center" },
  recordModal: { borderWidth: 1, borderRadius: 20, width: "100%", maxWidth: 390, maxHeight: "90%", alignSelf: "center", overflow: "hidden" },
  recordHeader: { minHeight: 68, borderBottomWidth: 1, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  recordTitle: { flex: 1, minWidth: 0, fontSize: 19, fontWeight: "900" },
  closeBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  recordScroll: { flexShrink: 1, maxHeight: "100%" },
  recordBody: { padding: 18, paddingBottom: 20 },
  selectInput: { minHeight: 56, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 18 },
  selectTypeLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  typeDot: { width: 11, height: 11, borderRadius: 6 },
  selectTypeText: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: "900" },
  moneyInputWrap: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", marginBottom: 18 },
  moneyPrefix: { fontSize: 18, fontWeight: "900", marginRight: 14 },
  moneyInput: { flex: 1, height: "100%", fontSize: 16, fontWeight: "800" },
  recordActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  recordCancel: { flex: 1, height: 52, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  recordSubmit: { flex: 1, height: 52, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  recordCancelText: { fontSize: 15, fontWeight: "900" },
  recordSubmitText: { fontSize: 15, fontWeight: "900" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "900" },
  label: { fontSize: 12, fontWeight: "900", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 12, fontWeight: "800" },
  inputIcon: { position: "absolute", right: 14, top: 12 },
  twoCols: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modalActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  cancelBtn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  saveBtn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 18 },
  saveText: { fontWeight: "900" },
  pagePanel: { borderWidth: 1, borderRadius: 8, padding: 16 },
  pagePanelHeader: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 14 },
  pagePanelTitle: { fontSize: 18, fontWeight: "900" },
  settingsSection: { marginBottom: 22 },
  settingsLabel: { fontSize: 11, fontWeight: "900", marginBottom: 8, paddingHorizontal: 3, letterSpacing: 0 },
  settingsGroup: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  settingsRow: { minHeight: 52, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12 },
  settingsAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  settingsRowText: { flex: 1, minWidth: 0 },
  settingsRowLabel: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "900" },
  signOutBtn: { alignSelf: "center", paddingHorizontal: 18, paddingVertical: 14 },
  signOutText: { fontSize: 14, fontWeight: "900" },
  optionOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.58)" },
  optionBackdrop: { ...StyleSheet.absoluteFill },
  optionSheet: { width: "100%", maxHeight: "70%", borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  optionHeader: { minHeight: 62, borderBottomWidth: 1, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  optionTitle: { flex: 1, minWidth: 0, fontSize: 19, fontWeight: "900" },
  optionClose: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  optionList: { flexShrink: 1 },
  optionListContent: { padding: 14, gap: 8, paddingBottom: 22 },
  optionRow: { minHeight: 54, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  optionIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  optionLabel: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: "900" },
  detailModal: { borderRadius: 20, borderWidth: 1, width: "100%", maxWidth: 390, maxHeight: "90%", alignSelf: "center", overflow: "hidden" },
  detailScroll: { flexShrink: 1 },
  detailBody: { gap: 12, padding: 18 },
  detailHero: { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  detailHeroIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  detailHeroText: { flex: 1, minWidth: 0 },
  detailHeroLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  detailHeroAmount: { marginTop: 4, fontSize: 24, fontWeight: "900" },
  detailDescription: { borderRadius: 14, padding: 14, gap: 7 },
  detailSectionLabel: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  detailDescriptionText: { fontSize: 16, fontWeight: "800", lineHeight: 22 },
  detailMetaGrid: { flexDirection: "row", gap: 10 },
  detailMetaItem: { flex: 1, minWidth: 0, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
  detailMetaText: { flex: 1, minWidth: 0 },
  detailMetaLabel: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  detailMetaValue: { marginTop: 3, fontSize: 13, fontWeight: "900" },
  exportChip: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  gasTableHeader: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 10, paddingHorizontal: 8 },
  gasTableHeadCell: { flex: 1, fontSize: 10, fontWeight: "900", textAlign: "center" },
  gasTableRow: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 9, paddingHorizontal: 8 },
  gasTableCell: { flex: 1, fontSize: 11, fontWeight: "800", textAlign: "center" },
  detailActions: { flexDirection: "row", gap: 10 },
  detailActionBtn: { flex: 1, height: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  detailActionText: { fontSize: 14, fontWeight: "900" },
});
