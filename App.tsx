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
  useWindowDimensions,
  View,
  StatusBar as NativeStatusBar,
} from "react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import Svg, { Circle, G, Rect } from "react-native-svg";
import {
  applySearch,
  buildTransactionFromDraft,
  calculateSummaries,
  filterTransactionsByPeriod,
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

type Tab = "expenses" | "summary";
type ThemeMode = "dark" | "light";

const emptySearch: SearchFilters = { text: "", minAmount: "", maxAmount: "", startDate: "", endDate: "" };

function getBlankDraft(type: TransactionType = "GASTO NO FRECUENTE"): TransactionDraft {
  return {
    date: formatDateToISO(new Date()),
    amount: "",
    detail: "",
    type,
  };
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const colors = theme === "dark" ? dark : light;
  const [tab, setTab] = useState<Tab>("expenses");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [accessToken, setAccessToken] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [setupStatus, setSetupStatus] = useState("Modo demo activo");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [freqIncome, setFreqIncome] = useState<Record<string, number>>({});
  const [addVisible, setAddVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [freqVisible, setFreqVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [accountVisible, setAccountVisible] = useState(false);
  const [sheetCandidates, setSheetCandidates] = useState<SheetCandidate[]>([]);
  const [accountInfo, setAccountInfo] = useState<{ name?: string; email?: string } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [draft, setDraft] = useState<TransactionDraft>(getBlankDraft());
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(emptySearch);
  const [searchActive, setSearchActive] = useState(false);
  const [deletedTx, setDeletedTx] = useState<Transaction | null>(null);
  const [freqInput, setFreqInput] = useState("");
  const { width } = useWindowDimensions();
  const compact = width < 820;
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

  const periodTransactions = useMemo(() => {
    const source = searchActive ? applySearch(transactions, searchFilters) : filterTransactionsByPeriod(transactions, month, year);
    return source;
  }, [transactions, month, year, searchActive, searchFilters]);

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
          setSetupStatus("Listo para conectar");
        }
      }
    } finally {
      setBootstrapping(false);
    }
  }

  async function connectGoogleWorkspace(token: string, preferredSheetId = "") {
    setLoading(true);
    setSetupStatus("Buscando hojas compatibles en Drive...");
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
        setSetupStatus("Elige tu hoja de gastos");
        return;
      }
      const sheetId = candidates[0]?.id || (await createBucksSpreadsheet(token));
      await selectSpreadsheet(token, sheetId, candidates[0]?.name || SHEET_NAMES.transactions);
    } catch (error) {
      Alert.alert("Google Sheets", error instanceof Error ? error.message : "No se pudo conectar la hoja");
      setSetupStatus("Modo demo activo");
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
      setSetupStatus(`Hoja conectada: ${name}`);
      await reloadFromGoogle(token, sheetId);
    } finally {
      setLoading(false);
    }
  }

  async function rescanDrive() {
    if (!accessToken) return;
    setMenuVisible(false);
    await connectGoogleWorkspace(accessToken);
  }

  async function signInWithGoogle() {
    if (!GOOGLE_ANDROID_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID) {
      Alert.alert("Google OAuth", "Faltan las credenciales en .env.");
      return;
    }
    setLoading(true);
    setSetupStatus("Abriendo Google...");
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
      setSetupStatus("Listo para conectar");
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
    setSetupStatus("Listo para conectar");
  }

  async function disconnectGoogle() {
    setAccountVisible(false);
    try {
      await GoogleSignin.signOut();
    } catch {
      // Still clear local state when Google Play Services has no active session.
    }
    await clearGoogleSession();
  }

  async function switchGoogleAccount() {
    setAccountVisible(false);
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

  function changeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setMonth(next.getMonth());
    setYear(next.getFullYear());
    setSearchActive(false);
  }

  function openAdd(type?: TransactionType) {
    setEditingTx(null);
    setDraft(getBlankDraft(type));
    setAddVisible(true);
  }

  function openEdit(tx: Transaction) {
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
    if (accessToken && spreadsheetId) {
      await deleteGoogleTransaction(accessToken, spreadsheetId, tx.rowId);
      await reloadFromGoogle();
      return;
    }
    const next = transactions.filter((item) => item.rowId !== tx.rowId).map((item, idx) => ({ ...item, rowId: idx + 2 }));
    setTransactions(next);
    setSummaries(calculateSummaries(next, freqIncome));
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
    Alert.alert("Mover registro", "Elige la nueva posición para reflejarla también en Google Sheets.", [
      { text: "Subir", onPress: () => moveTx(tx, "up") },
      { text: "Bajar", onPress: () => moveTx(tx, "down") },
      { text: "Cancelar", style: "cancel" },
    ]);
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

  async function exportRows(format: ExportFormat) {
    const rows = searchActive ? periodTransactions : transactions.filter((tx) => new Date(tx.rawDate).getFullYear() === year);
    if (!rows.length) {
      Alert.alert("Exportar", "No hay datos para exportar.");
      return;
    }
    if (format === "xlsx") {
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
    setExportVisible(false);
  }

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    summaries.forEach((row) => {
      const yr = Number(row.monthYear.split(" ").pop());
      if (yr) years.add(yr);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [summaries]);

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
          <View style={[styles.loginMark, { backgroundColor: colors.green, borderColor: colors.green }]}>
            <MaterialCommunityIcons name="sack" size={38} color="#061108" />
          </View>
          <Text style={[styles.loginTitle, { color: colors.text }]}>Bucks Manager</Text>
          <TouchableOpacity
            disabled={!canConnect || loading}
            onPress={signInWithGoogle}
            style={[styles.googleLoginBtn, { backgroundColor: canConnect ? colors.green : colors.disabled }]}
          >
            {loading ? (
              <ActivityIndicator color="#061108" />
            ) : (
              <>
                <MaterialCommunityIcons name="google" size={21} color="#061108" />
                <Text style={styles.googleLoginText}>Acceder con Google</Text>
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
      <View style={[styles.shell, compact && styles.shellCompact, { backgroundColor: colors.bg, paddingTop: compact ? statusBarInset + 6 : 12 }]}>
        <View style={[styles.sidebar, compact && styles.sidebarCompact, { backgroundColor: colors.sidebar, borderColor: colors.border }]}>
          <View style={styles.brandRow}>
            <View style={[styles.logo, { backgroundColor: colors.green }]}>
              <MaterialCommunityIcons name="sack" size={28} color="#061108" />
            </View>
            <View>
              <Text style={[styles.brandTitle, { color: colors.text }]}>Bucks Manager</Text>
              <Text style={[styles.brandSub, { color: colors.muted }]}>Control de gastos</Text>
            </View>
          </View>

          <View style={styles.periodBox}>
            <Text style={[styles.kicker, { color: colors.muted }]}>PERIODO</Text>
            <View style={styles.yearRow}>
              {availableYears.map((item) => (
                <TouchableOpacity key={item} onPress={() => setYear(item)} style={[styles.yearChip, item === year && { backgroundColor: colors.green }]}>
                  <Text style={[styles.yearText, { color: item === year ? "#07130c" : colors.text }]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.monthRow}>
              <IconButton name="chevron-left" onPress={() => changeMonth(-1)} colors={colors} />
              <Text style={[styles.monthLabel, { color: colors.text }]}>{MONTH_NAMES[month]}</Text>
              <IconButton name="chevron-right" onPress={() => changeMonth(1)} colors={colors} />
            </View>
          </View>

          <View style={styles.navBlock}>
            <NavButton label="Tabla de Gastos" icon="table" active={tab === "expenses"} onPress={() => setTab("expenses")} colors={colors} />
            <NavButton label="Análisis" icon="chart-bar" active={tab === "summary"} onPress={() => setTab("summary")} colors={colors} />
          </View>

          <View style={[styles.quickGrid, compact && { display: "none" }]}>
            {MONTH_NAMES.map((name, idx) => (
              <TouchableOpacity key={name} onPress={() => setMonth(idx)} style={[styles.monthChip, { borderColor: colors.border }, idx === month && { backgroundColor: colors.green, borderColor: colors.green }]}>
                <Text style={[styles.monthChipText, { color: idx === month ? "#061108" : colors.muted }]}>{name.slice(0, 3)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sidebarBottom}>
            <TouchableOpacity onPress={() => setAccountVisible(true)} style={[styles.accountBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="account-circle" size={20} color={colors.green} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.accountName, { color: colors.text }]}>{accountInfo?.name || "Cuenta Google"}</Text>
                <Text numberOfLines={1} style={[styles.accountEmail, { color: colors.muted }]}>{accountInfo?.email || "Gestionar cuenta"}</Text>
              </View>
            </TouchableOpacity>
            <Text style={[styles.storageNote, { color: colors.muted }]}>Los datos se guardan en tu hoja de Google</Text>
          </View>
        </View>

        <View style={[styles.content, compact && { width: "100%" }]}>
          <View style={[styles.topBar, compact && styles.topBarMobile, { backgroundColor: compact ? colors.card : "transparent", borderColor: compact ? colors.border : "transparent" }]}>
            <View style={styles.headerLeft}>
              {compact && (
                <TouchableOpacity style={[styles.headerBtn, styles.headerBtnOutlined, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={() => setMenuVisible(true)}>
                  <MaterialCommunityIcons name="menu" size={21} color={colors.text} />
                </TouchableOpacity>
              )}
              <View style={styles.titleBlock}>
                <Text numberOfLines={1} style={[styles.pageTitle, compact && styles.pageTitleMobile, { color: colors.text }]}>
                  {tab === "expenses" ? "Tabla de Gastos" : "Análisis"}
                </Text>
                <Text numberOfLines={1} style={[styles.pageSub, compact && styles.pageSubMobile, { color: colors.muted }]}>
                  {`${MONTH_NAMES[month]} ${year}`}
                </Text>
              </View>
            </View>
            <View style={styles.topActions}>
              <TouchableOpacity style={[styles.themeToggle, { backgroundColor: theme === "dark" ? colors.blue : colors.green }]} onPress={() => setTheme(theme === "dark" ? "light" : "dark")}>
                <View style={styles.themeThumb} />
                <MaterialCommunityIcons name={theme === "dark" ? "weather-night" : "weather-sunny"} size={18} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.headerBtn, compact && styles.headerBtnOutlined, { backgroundColor: compact ? colors.input : colors.card, borderColor: colors.border }]} onPress={() => setSearchVisible(true)}>
                <MaterialCommunityIcons name="magnify" size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.headerBtn, compact && styles.headerBtnOutlined, { backgroundColor: compact ? colors.input : colors.card, borderColor: colors.border }]} onPress={() => setExportVisible(true)}>
                <MaterialCommunityIcons name="file-export" size={20} color={colors.blue} />
              </TouchableOpacity>
            </View>
          </View>

          {compact && (
            <MobileControls
              colors={colors}
              year={year}
              month={month}
              availableYears={availableYears}
              setYear={setYear}
              changeMonth={changeMonth}
              goToday={() => {
                const today = new Date();
                setMonth(today.getMonth());
                setYear(today.getFullYear());
                setSearchActive(false);
              }}
            />
          )}

          {!accessToken && (
            <View style={[styles.connectCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.connectTitle, { color: colors.text }]}>Modo demo listo</Text>
                <Text style={[styles.connectText, { color: colors.muted }]}>
                  Tus credenciales se leen desde `.env`. Al conectar se buscará o creará tu hoja privada de Google.
                </Text>
              </View>
              <TouchableOpacity
                disabled={!GOOGLE_ANDROID_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID}
                onPress={signInWithGoogle}
                style={[styles.connectBtn, { backgroundColor: GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID ? colors.green : colors.disabled }]}
              >
                <Text style={styles.connectBtnText}>Conectar Google</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && (
            <View style={styles.loadingBar}>
              <ActivityIndicator color={colors.green} />
              <Text style={{ color: colors.muted }}>Sincronizando...</Text>
            </View>
          )}

          {tab === "expenses" ? (
            <ExpensesView
              colors={colors}
              summary={currentSummary}
              transactions={periodTransactions}
              searchActive={searchActive}
              compact={compact}
              onEditFreq={() => {
                setFreqInput(String(currentSummary.freqIncome || 0));
                setFreqVisible(true);
              }}
              onExitSearch={() => setSearchActive(false)}
              onOpenDetail={setDetailTx}
              onEdit={openEdit}
              onDelete={deleteTx}
              onMove={openMoveMenu}
              expandedRows={expandedRows}
              onToggleRow={(rowId: number) => setExpandedRows((current) => ({ ...current, [rowId]: !current[rowId] }))}
            />
          ) : (
            <SummaryView colors={colors} summaries={summaries} />
          )}
        </View>

        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.green }]} onPress={() => openAdd()}>
          <MaterialCommunityIcons name="plus" size={28} color="#061108" />
        </TouchableOpacity>
        {deletedTx && (
          <TouchableOpacity style={[styles.undoFab, compact && { left: 18 }, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={undoDelete}>
            <MaterialCommunityIcons name="undo" size={20} color={colors.green} />
            <Text style={{ color: colors.text, fontWeight: "800" }}>Deshacer</Text>
          </TouchableOpacity>
        )}
      </View>

      <TransactionModal
        visible={addVisible}
        colors={colors}
        draft={draft}
        editing={!!editingTx}
        setDraft={setDraft}
        onClose={() => setAddVisible(false)}
        onSubmit={submitDraft}
      />
      <SearchModal
        visible={searchVisible}
        colors={colors}
        filters={searchFilters}
        setFilters={setSearchFilters}
        onClose={() => setSearchVisible(false)}
        onSubmit={() => {
          setSearchActive(true);
          setSearchVisible(false);
          setTab("expenses");
        }}
        onClear={() => setSearchFilters(emptySearch)}
      />
      <ExportModal visible={exportVisible} colors={colors} onClose={() => setExportVisible(false)} onExport={exportRows} />
      <FreqIncomeModal visible={freqVisible} colors={colors} value={freqInput} setValue={setFreqInput} onClose={() => setFreqVisible(false)} onSubmit={saveFreqIncome} />
      <DetailModal tx={detailTx} colors={colors} onClose={() => setDetailTx(null)} />
      <MobileMenu
        visible={menuVisible}
        colors={colors}
        tab={tab}
        setTab={setTab}
        month={month}
        setMonth={setMonth}
        onRescan={rescanDrive}
        onAccount={() => setAccountVisible(true)}
        accountInfo={accountInfo}
        onClose={() => setMenuVisible(false)}
      />
      <AccountModal
        visible={accountVisible}
        colors={colors}
        accountInfo={accountInfo}
        onClose={() => setAccountVisible(false)}
        onSwitch={switchGoogleAccount}
        onDisconnect={disconnectGoogle}
      />
      <SheetChooser
        visible={sheetCandidates.length > 1}
        colors={colors}
        candidates={sheetCandidates}
        onClose={() => setSheetCandidates([])}
        onSelect={(candidate: SheetCandidate) => selectSpreadsheet(accessToken, candidate.id, candidate.name)}
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

function MobileControls({ colors, year, month, availableYears, setYear, changeMonth, goToday }: any) {
  return (
    <View style={[styles.mobileControls, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileYearRail}>
        {availableYears.map((item: number) => (
          <TouchableOpacity
            key={item}
            onPress={() => setYear(item)}
            style={[styles.mobileYearChip, { backgroundColor: colors.input, borderColor: colors.border }, item === year && { backgroundColor: colors.green, borderColor: colors.green }]}
          >
            <Text style={[styles.mobileYearText, { color: item === year ? "#061108" : colors.text }]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={[styles.monthNavMobile, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.monthArrowMobile} onPress={() => changeMonth(-1)}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={[styles.monthNavTextMobile, { color: colors.text }]}>{MONTH_NAMES[month]}</Text>
        <TouchableOpacity style={styles.monthArrowMobile} onPress={() => changeMonth(1)}>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={goToday} style={[styles.todayBtnMobile, { backgroundColor: colors.blue }]}>
        <MaterialCommunityIcons name="calendar-today" size={18} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

function MobileMenu({ visible, colors, tab, setTab, month, setMonth, onRescan, onAccount, accountInfo, onClose }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity activeOpacity={1} style={styles.drawerOverlay} onPress={onClose}>
        <View style={[styles.drawer, { backgroundColor: colors.sidebar, borderColor: colors.border }]}>
          <View style={styles.brandRow}>
            <View style={[styles.logo, { backgroundColor: colors.green }]}>
              <MaterialCommunityIcons name="sack" size={28} color="#061108" />
            </View>
            <View>
              <Text style={[styles.brandTitle, { color: colors.text }]}>Bucks Manager</Text>
              <Text style={[styles.brandSub, { color: colors.muted }]}>Control de gastos</Text>
            </View>
          </View>
          <View style={styles.navBlock}>
            <NavButton label="Tabla de Gastos" icon="table" active={tab === "expenses"} onPress={() => { setTab("expenses"); onClose(); }} colors={colors} />
            <NavButton label="Análisis" icon="chart-bar" active={tab === "summary"} onPress={() => { setTab("summary"); onClose(); }} colors={colors} />
            <NavButton label="Buscar hoja en Drive" icon="google-drive" active={false} onPress={onRescan} colors={colors} />
          </View>
          <View style={styles.quickGrid}>
            {MONTH_NAMES.map((name, idx) => (
              <TouchableOpacity key={name} onPress={() => { setMonth(idx); onClose(); }} style={[styles.monthChip, { borderColor: colors.border }, idx === month && { backgroundColor: colors.green, borderColor: colors.green }]}>
                <Text style={[styles.monthChipText, { color: idx === month ? "#061108" : colors.muted }]}>{name.slice(0, 3)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.sidebarBottom}>
            <TouchableOpacity onPress={() => { onClose(); onAccount(); }} style={[styles.accountBtn, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="account-circle" size={20} color={colors.green} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.accountName, { color: colors.text }]}>{accountInfo?.name || "Cuenta Google"}</Text>
                <Text numberOfLines={1} style={[styles.accountEmail, { color: colors.muted }]}>{accountInfo?.email || "Gestionar cuenta"}</Text>
              </View>
            </TouchableOpacity>
            <Text style={[styles.storageNote, { color: colors.muted }]}>Los datos se guardan en tu hoja de Google.</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function AccountModal({ visible, colors, accountInfo, onClose, onSwitch, onDisconnect }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.accountModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ModalHeader title="Cuenta Google" icon="account-circle" colors={colors} onClose={onClose} />
          <View style={[styles.accountHero, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <View style={[styles.accountAvatar, { backgroundColor: colors.green }]}>
              <Text style={styles.accountInitial}>{(accountInfo?.email || accountInfo?.name || "G").slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text numberOfLines={1} style={[styles.accountHeroName, { color: colors.text }]}>{accountInfo?.name || "Cuenta conectada"}</Text>
            <Text numberOfLines={1} style={[styles.accountHeroEmail, { color: colors.muted }]}>{accountInfo?.email || "Google"}</Text>
          </View>
          <TouchableOpacity style={[styles.accountAction, { borderColor: colors.border }]} onPress={onSwitch}>
            <MaterialCommunityIcons name="account-switch" size={20} color={colors.blue} />
            <Text style={[styles.accountActionText, { color: colors.text }]}>Cambiar o agregar cuenta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.accountAction, { borderColor: colors.border }]} onPress={onDisconnect}>
            <MaterialCommunityIcons name="logout" size={20} color={colors.red} />
            <Text style={[styles.accountActionText, { color: colors.red }]}>Desconectar cuenta actual</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
  compact,
  onEditFreq,
  onExitSearch,
  onOpenDetail,
  onEdit,
  onDelete,
  onMove,
  expandedRows,
  onToggleRow,
}: any) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={[styles.statsGrid, compact && styles.statsGridMobile]}>
        <StatCard title="Ing. Frec." value={formatMoney(summary.freqIncome)} tone="income" icon="cash" colors={colors} action={onEditFreq} />
        <StatCard title="Ing. No Frec." value={formatMoney(summary.nonFreqIncome)} tone="income" icon="trending-up" colors={colors} />
        <StatCard title="Gasto Frec." value={formatMoney(summary.freqExpense)} tone="expense" icon="credit-card" colors={colors} />
        <StatCard title="Gasto No Frec." value={formatMoney(summary.nonFreqExpense)} tone="expense" icon="trending-down" colors={colors} />
        <StatCard title="Gasto Total" value={formatMoney(summary.totalExpense)} tone="warn" icon="basket" colors={colors} />
        <StatCard title="Balance" value={formatMoney(summary.netMonthly)} tone="balance" icon="wallet" colors={colors} />
      </View>

      {searchActive && (
        <View style={[styles.searchBanner, { backgroundColor: colors.greenSoft }]}>
          <Text style={{ color: colors.green, fontWeight: "800" }}>Mostrando resultados de búsqueda avanzada</Text>
          <TouchableOpacity onPress={onExitSearch}>
            <Text style={{ color: colors.green, fontWeight: "900" }}>Salir</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.tableCard, compact && styles.tableCardMobile, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ScrollView horizontal={compact} showsHorizontalScrollIndicator={compact}>
          <View style={compact ? styles.mobileTableWide : styles.tableWide}>
            <View style={[styles.tableHeader, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Text style={styles.rowGripHeader} />
              <Text style={[styles.th, { color: colors.text, flex: 0.78 }]}>FECHA</Text>
              <Text style={[styles.th, { color: colors.muted, flex: 0.9 }]}>MONTO</Text>
              <Text style={[styles.th, { color: colors.text, flex: 1.4 }]}>DETALLE</Text>
              <Text style={[styles.th, { color: colors.muted, flex: 1.1 }]}>TIPO</Text>
              <Text style={[styles.th, { color: colors.text, width: 94, textAlign: "center" }]}>ACCIÓN</Text>
            </View>
            {transactions.map((tx: Transaction) => (
              <TouchableOpacity
                key={`${tx.rowId}-${tx.createdAt}`}
                onPress={() => onOpenDetail(tx)}
                style={[
                  styles.tr,
                  compact && styles.trMobile,
                  expandedRows[tx.rowId] && { backgroundColor: colors.expandedRow },
                  tx.type === "GASTO FRECUENTE" && { backgroundColor: colors.freqExpenseRow },
                  { borderColor: colors.border },
                ]}
              >
                <TouchableOpacity style={styles.rowGrip} onPress={() => onMove(tx)}>
                  <MaterialCommunityIcons name="drag-horizontal-variant" size={20} color={colors.muted} />
                </TouchableOpacity>
                <Text style={[styles.td, compact && styles.tdMobile, { color: colors.text, flex: 0.78 }]}>{tx.date}</Text>
                <Text style={[styles.tdAmount, compact && styles.tdMobile, { color: tx.amount >= 0 ? colors.green : colors.red, flex: 0.9 }]}>{formatMoney(tx.amount)}</Text>
                <View style={[styles.detailCell, { flex: 1.4 }]}>
                  <Text style={[styles.td, compact && styles.tdMobile, expandedRows[tx.rowId] ? styles.detailExpanded : styles.detailClipped, { color: colors.text }]}>
                    {tx.detail}
                  </Text>
                  {!expandedRows[tx.rowId] && <View style={[styles.detailFade, { backgroundColor: colors.card }]} />}
                  <TouchableOpacity style={[styles.expandBtn, { backgroundColor: expandedRows[tx.rowId] ? colors.blue : colors.expandBlue, borderColor: colors.expandBorder }]} onPress={() => onToggleRow(tx.rowId)}>
                    <MaterialCommunityIcons name={expandedRows[tx.rowId] ? "minus" : "plus"} size={15} color="#ffffff" />
                  </TouchableOpacity>
                </View>
                <View style={[styles.typePill, { borderColor: typeColor(tx.type, colors), backgroundColor: typeFill(tx.type, colors), flex: 1.1 }]}>
                  <Text numberOfLines={1} style={[styles.typePillText, { color: typeTextColor(tx.type, colors) }]}>{abbrev(tx.type).toUpperCase()}</Text>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.editBg, borderColor: colors.editBorder }]} onPress={() => onEdit(tx)}>
                    <MaterialCommunityIcons name="pencil" size={18} color={colors.green} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.actionDark, borderColor: colors.border }]} onPress={() => onDelete(tx)}>
                    <MaterialCommunityIcons name="trash-can" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
            {!transactions.length && <Text style={[styles.empty, { color: colors.muted }]}>No hay movimientos para mostrar.</Text>}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function SummaryView({ colors, summaries }: { colors: Palette; summaries: SummaryRow[] }) {
  const totals = summaries.reduce(
    (acc, row) => ({
      income: acc.income + row.totalIncome,
      expense: acc.expense + Math.abs(row.totalExpense),
      net: acc.net + row.netMonthly,
    }),
    { income: 0, expense: 0, net: 0 },
  );
  const savings = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : 0;
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.kpiGrid}>
        <Kpi title="Ingresos Totales" value={`S/ ${totals.income.toFixed(2)}`} icon="trending-up" color={colors.green} colors={colors} />
        <Kpi title="Gastos Totales" value={`S/ ${totals.expense.toFixed(2)}`} icon="trending-down" color={colors.red} colors={colors} />
        <Kpi title="Balance Neto" value={`S/ ${totals.net.toFixed(2)}`} icon="wallet" color={totals.net >= 0 ? colors.blue : colors.red} colors={colors} />
        <Kpi title="Tasa de Ahorro" value={`${savings}%`} icon="piggy-bank" color={colors.yellow} colors={colors} />
      </View>
      <View style={styles.chartRow}>
        <PieCard title="Ingresos" values={[totals.income, Math.max(0, totals.net)]} colors={colors} />
        <PieCard title="Gastos" values={[totals.expense, Math.max(0, totals.income - totals.expense)]} colors={colors} danger />
      </View>
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Comparativa Interanual</Text>
        <BarChart rows={summaries} colors={colors} />
      </View>
      <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {summaries.map((row) => (
          <View key={row.monthYear} style={[styles.summaryRow, { borderColor: colors.border }]}>
            <Text style={[styles.summaryMonth, { color: colors.text }]}>{row.monthYear}</Text>
            <Text style={{ color: row.netMonthly >= 0 ? colors.green : colors.red, fontWeight: "900" }}>{formatMoney(row.netMonthly)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function TransactionModal({ visible, colors, draft, setDraft, editing, onClose, onSubmit }: any) {
  const chooseType = () => {
    Alert.alert(
      "Tipo",
      "Selecciona el tipo de movimiento.",
      [...TRANSACTION_TYPES.map((type) => ({ text: titleCaseType(type), onPress: () => setDraft({ ...draft, type }) })), { text: "Cancelar", style: "cancel" as const }],
    );
  };
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
          <View style={styles.recordBody}>
            <Field label="Fecha" value={draft.date} onChangeText={(date: string) => setDraft({ ...draft, date })} colors={colors} placeholder="YYYY-MM-DD" rightIcon="calendar" />
            <Text style={[styles.label, { color: colors.text }]}>Tipo</Text>
            <TouchableOpacity style={[styles.selectInput, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={chooseType}>
              <View style={styles.selectTypeLeft}>
                <View style={[styles.typeDot, { backgroundColor: typeColor(draft.type, colors) }]} />
                <Text style={[styles.selectTypeText, { color: colors.text }]}>{titleCaseType(draft.type)}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-down" size={24} color={colors.blue} />
            </TouchableOpacity>
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
              <TouchableOpacity style={[styles.recordSubmit, { backgroundColor: colors.green }]} onPress={onSubmit}>
                <MaterialCommunityIcons name="plus" size={20} color="#061108" />
                <Text style={styles.recordSubmitText}>{editing ? "Guardar" : "Agregar"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SearchModal({ visible, colors, filters, setFilters, onClose, onSubmit, onClear }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <ModalHeader title="Búsqueda avanzada" icon="magnify" colors={colors} onClose={onClose} />
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
      </View>
    </Modal>
  );
}

function ExportModal({ visible, colors, onClose, onExport }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <ModalHeader title="Exportar movimientos" icon="file-export" colors={colors} onClose={onClose} />
          <Text style={[styles.connectText, { color: colors.muted }]}>Exporta el rango visible o los movimientos del año actual.</Text>
          <View style={styles.twoCols}>
            <TouchableOpacity style={[styles.exportChoice, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={() => onExport("xlsx")}>
              <MaterialCommunityIcons name="file-excel" size={28} color={colors.green} />
              <Text style={[styles.exportLabel, { color: colors.text }]}>Excel / CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportChoice, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={() => onExport("pdf")}>
              <MaterialCommunityIcons name="file-pdf-box" size={28} color={colors.red} />
              <Text style={[styles.exportLabel, { color: colors.text }]}>PDF</Text>
            </TouchableOpacity>
          </View>
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

function DetailModal({ tx, colors, onClose }: { tx: Transaction | null; colors: Palette; onClose: () => void }) {
  return (
    <Modal visible={!!tx} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.detailModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.detailModalAccent, { backgroundColor: colors.yellow }]} />
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="receipt-text" size={20} color={colors.yellow} /> Detalle del gasto
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          {tx && (
            <View style={styles.detailStack}>
              <Detail label="Fecha" value={tx.date} tone={colors.blue} colors={colors} wide />
              <Detail label="Hora de creación" value={formatCreatedTime(tx.createdAt)} colors={colors} />
              <Detail label="Monto" value={formatMoney(tx.amount)} tone={colors.red} colors={colors} wide />
              <Detail label="Tipo" value={tx.type} tone={colors.yellow} colors={colors} wide />
              <Detail label="Detalle" value={tx.detail} tone={colors.yellow} colors={colors} wide />
            </View>
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
        <MaterialCommunityIcons name={icon} size={20} color={colors.green} /> {title}
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
      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.green }]} onPress={onSubmit}>
        <Text style={styles.saveText}>{submitLabel}</Text>
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

function PieCard({ title, values, colors, danger = false }: any) {
  const total = values.reduce((a: number, b: number) => a + b, 0) || 1;
  const pct = values[0] / total;
  const stroke = 2 * Math.PI * 38;
  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <Svg width={128} height={128}>
        <Circle cx={64} cy={64} r={38} stroke={colors.border} strokeWidth={18} fill="none" />
        <Circle cx={64} cy={64} r={38} stroke={danger ? colors.red : colors.green} strokeWidth={18} fill="none" strokeDasharray={`${stroke * pct} ${stroke}`} strokeLinecap="round" rotation="-90" origin="64,64" />
      </Svg>
      <Text style={[styles.piePct, { color: danger ? colors.red : colors.green }]}>{Math.round(pct * 100)}%</Text>
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

function Detail({ label, value, colors, wide, tone }: any) {
  return (
    <View style={[styles.detailItem, wide && { width: "100%" }, { backgroundColor: colors.input, borderColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: tone || colors.muted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function IconButton({ name, onPress, colors }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.iconBtn, { backgroundColor: colors.card }]}>
      <MaterialCommunityIcons name={name} size={22} color={colors.text} />
    </TouchableOpacity>
  );
}

function NavButton({ label, icon, active, onPress, colors }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.navBtn, active && { backgroundColor: colors.green }]}>
      <MaterialCommunityIcons name={icon} size={18} color={active ? "#061108" : colors.muted} />
      <Text style={[styles.navText, { color: active ? "#061108" : colors.text }]}>{label}</Text>
    </TouchableOpacity>
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
  if (type === "INGRESO NO FRECUENTE") return colors.green;
  if (type === "GASTO FRECUENTE") return colors.red;
  return "transparent";
}

function typeTextColor(type: string, colors: Palette) {
  if (type === "INGRESO NO FRECUENTE" || type === "GASTO FRECUENTE") return "#061108";
  return colors.text;
}

function formatCreatedTime(createdAt?: string) {
  if (!createdAt) return "-";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

type Palette = typeof dark;

const dark = {
  bg: "#020403",
  sidebar: "#07100d",
  card: "#0b1110",
  input: "#050908",
  border: "#27322e",
  text: "#ffffff",
  muted: "#8f9b95",
  green: "#c8ff00",
  greenSoft: "rgba(200,255,0,0.15)",
  red: "#ff4d57",
  yellow: "#ffc145",
  blue: "#2d9cdb",
  disabled: "#405047",
  actionDark: "#030706",
  editBg: "#063f22",
  editBorder: "#087a3c",
  expandBlue: "#0a5678",
  expandBorder: "#1b80aa",
  expandedRow: "#202216",
  freqExpenseRow: "#341718",
};

const light = {
  bg: "#f7faef",
  sidebar: "#ffffff",
  card: "#ffffff",
  input: "#eaf1e4",
  border: "#b8c9ae",
  text: "#06110b",
  muted: "#66736c",
  green: "#c8ff00",
  greenSoft: "rgba(200,255,0,0.24)",
  red: "#e53935",
  yellow: "#f9a825",
  blue: "#1976d2",
  disabled: "#c9d2cb",
  actionDark: "#eef3ed",
  editBg: "#dff8e9",
  editBorder: "#7ad99e",
  expandBlue: "#1976d2",
  expandBorder: "#6db7ea",
  expandedRow: "#eef3dc",
  freqExpenseRow: "#ffe6e6",
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  shell: { flex: 1, flexDirection: "row", padding: 12, gap: 12 },
  shellCompact: { flexDirection: "column", padding: 0, gap: 0 },
  sidebar: { width: 245, borderWidth: 1, borderRadius: 8, padding: 16 },
  sidebarCompact: { display: "none" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  logo: { width: 61, height: 61, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  brandTitle: { fontSize: 24, fontWeight: "900" },
  brandSub: { fontSize: 16, fontWeight: "700" },
  kicker: { fontSize: 11, fontWeight: "900", marginBottom: 14, textTransform: "uppercase", letterSpacing: 2 },
  periodBox: { marginBottom: 20 },
  yearRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  yearChip: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  yearText: { fontSize: 12, fontWeight: "900" },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  monthLabel: { fontSize: 16, fontWeight: "900" },
  iconBtn: { width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  navBlock: { gap: 10, marginBottom: 28 },
  navBtn: { flexDirection: "row", gap: 14, alignItems: "center", paddingVertical: 16, paddingHorizontal: 18, borderRadius: 12 },
  navText: { fontWeight: "900", fontSize: 18 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthChip: { width: 59, paddingVertical: 13, borderRadius: 9, borderWidth: 1, alignItems: "center" },
  monthChipText: { fontSize: 16, fontWeight: "900" },
  sidebarBottom: { marginTop: "auto", gap: 12 },
  storageNote: { fontSize: 12, fontWeight: "700" },
  accountBtn: { minHeight: 54, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  accountName: { fontSize: 13, fontWeight: "900" },
  accountEmail: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  content: { flex: 1 },
  loginScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 26 },
  loginMark: { width: 78, height: 78, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  loginTitle: { fontSize: 30, fontWeight: "900", textAlign: "center" },
  loginSubtitle: { maxWidth: 310, marginTop: 9, marginBottom: 24, fontSize: 14, fontWeight: "700", lineHeight: 20, textAlign: "center" },
  googleLoginBtn: { minWidth: 232, minHeight: 50, marginTop: 22, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleLoginText: { color: "#061108", fontSize: 15, fontWeight: "900" },
  loginStatus: { marginTop: 14, fontSize: 12, fontWeight: "700", textAlign: "center" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  topBarMobile: { marginBottom: 0, paddingHorizontal: 14, paddingVertical: 16, borderBottomWidth: 1 },
  headerLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  pageTitle: { fontSize: 28, fontWeight: "900" },
  pageTitleMobile: { fontSize: 20 },
  pageSub: { fontSize: 13, fontWeight: "700" },
  pageSubMobile: { fontSize: 14 },
  topActions: { flexDirection: "row", gap: 8 },
  headerBtn: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  headerBtnOutlined: { borderWidth: 1 },
  themeToggle: { width: 65, height: 35, borderRadius: 999, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  themeThumb: { width: 29, height: 29, borderRadius: 15, backgroundColor: "#ffffff" },
  mobileControls: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 16, borderBottomWidth: 1 },
  mobileYearRail: { gap: 8, paddingRight: 2 },
  mobileYearChip: { minWidth: 98, height: 47, borderWidth: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  mobileYearText: { fontSize: 18, fontWeight: "900" },
  monthNavMobile: { flex: 1, minWidth: 168, height: 47, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthArrowMobile: { width: 34, height: 34, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  monthNavTextMobile: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "900" },
  todayBtnMobile: { width: 47, height: 47, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  connectCard: { borderWidth: 1, borderRadius: 8, padding: 14, flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 12 },
  connectTitle: { fontSize: 16, fontWeight: "900" },
  connectText: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  connectBtn: { borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14 },
  connectBtnText: { color: "#061108", fontWeight: "900" },
  loadingBar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  skeletonScreen: { flex: 1, padding: 14, gap: 14 },
  skeletonHeader: { borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  skeletonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skeletonCard: { width: "48.8%", borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  skeletonTable: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  skeletonRow: { height: 42, borderRadius: 8 },
  skeletonBox: { borderRadius: 8, opacity: 0.92 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  statsGridMobile: { padding: 14, gap: 8, marginBottom: 0 },
  statCard: { width: "48.5%", minWidth: 0, borderWidth: 1, borderRadius: 11, padding: 12, position: "relative", flexDirection: "row", alignItems: "center", gap: 10 },
  statIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statContent: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  statValue: { fontSize: 15, fontWeight: "900", marginTop: 4 },
  editStat: { position: "absolute", right: 10, top: 10 },
  searchBanner: { borderRadius: 8, padding: 12, flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  tableCard: { borderWidth: 1, borderRadius: 8, overflow: "hidden", marginBottom: 18 },
  tableCardMobile: { marginHorizontal: 14, borderRadius: 18 },
  tableWide: { width: "100%" },
  mobileTableWide: { width: 760 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: 10 },
  th: { fontSize: 14, fontWeight: "900" },
  tr: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingVertical: 13, paddingHorizontal: 10 },
  trMobile: { paddingVertical: 12 },
  td: { fontSize: 13, fontWeight: "700" },
  tdMobile: { fontSize: 16 },
  tdAmount: { fontSize: 13, fontWeight: "900" },
  detailCell: { minHeight: 26, justifyContent: "center", paddingRight: 32, overflow: "hidden" },
  detailClipped: { maxHeight: 24, lineHeight: 22 },
  detailExpanded: { lineHeight: 24 },
  detailFade: { position: "absolute", right: 25, top: 0, bottom: 0, width: 34, opacity: 0.86 },
  expandBtn: { position: "absolute", right: 0, top: 1, width: 24, height: 24, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  typePill: { minHeight: 38, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, marginHorizontal: 8 },
  typePillText: { fontSize: 12, fontWeight: "900" },
  rowActions: { width: 94, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  actionBtn: { width: 38, height: 38, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rowGripHeader: { width: 28 },
  rowGrip: { width: 28, alignItems: "flex-start", justifyContent: "center" },
  empty: { padding: 18, textAlign: "center", fontWeight: "700" },
  fab: { position: "absolute", right: 22, bottom: 22, width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center" },
  undoFab: { position: "absolute", left: 270, bottom: 22, borderRadius: 999, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", gap: 8 },
  drawerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)" },
  drawer: { width: 306, height: "100%", borderRightWidth: 1, padding: 19 },
  sheetChoice: { borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  sheetChoiceTitle: { fontSize: 15, fontWeight: "900" },
  sheetChoiceMeta: { fontSize: 12, fontWeight: "700", marginTop: 3 },
  accountModal: { borderRadius: 16, borderWidth: 1, padding: 16, width: "100%", maxWidth: 420, alignSelf: "center" },
  accountHero: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center", marginBottom: 12 },
  accountAvatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  accountInitial: { color: "#061108", fontSize: 24, fontWeight: "900" },
  accountHeroName: { fontSize: 18, fontWeight: "900" },
  accountHeroEmail: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  accountAction: { borderTopWidth: 1, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  accountActionText: { fontSize: 15, fontWeight: "900" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  kpi: { width: "24%", minWidth: 150, borderWidth: 1, borderRadius: 8, padding: 14 },
  kpiValue: { fontSize: 20, fontWeight: "900", marginTop: 5 },
  chartRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  chartCard: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 14, alignItems: "center", marginBottom: 12 },
  sectionTitle: { alignSelf: "flex-start", fontSize: 16, fontWeight: "900", marginBottom: 10 },
  piePct: { position: "absolute", top: 82, fontSize: 18, fontWeight: "900" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", padding: 14, borderBottomWidth: 1 },
  summaryMonth: { fontWeight: "900" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "center", padding: 16 },
  modal: { borderRadius: 8, padding: 16, maxWidth: 620, width: "100%", alignSelf: "center" },
  recordModal: { borderWidth: 1, borderRadius: 24, width: "100%", maxWidth: 390, alignSelf: "center", overflow: "hidden" },
  recordHeader: { minHeight: 80, borderBottomWidth: 1, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recordTitle: { fontSize: 21, fontWeight: "900" },
  closeBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  recordBody: { padding: 22 },
  selectInput: { height: 60, borderWidth: 1, borderRadius: 12, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  selectTypeLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  typeDot: { width: 11, height: 11, borderRadius: 6 },
  selectTypeText: { fontSize: 18, fontWeight: "900" },
  moneyInputWrap: { height: 54, borderWidth: 1, borderRadius: 12, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", marginBottom: 22 },
  moneyPrefix: { fontSize: 18, fontWeight: "900", marginRight: 14 },
  moneyInput: { flex: 1, height: "100%", fontSize: 16, fontWeight: "800" },
  recordActions: { flexDirection: "row", gap: 14, marginTop: 10 },
  recordCancel: { flex: 1, height: 52, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  recordSubmit: { flex: 1, height: 52, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  recordCancelText: { fontSize: 15, fontWeight: "900" },
  recordSubmitText: { color: "#061108", fontSize: 15, fontWeight: "900" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "900" },
  label: { fontSize: 12, fontWeight: "900", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 12, fontWeight: "800" },
  inputIcon: { position: "absolute", right: 14, top: 12 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  typeChip: { borderWidth: 1, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 },
  calcGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  calcKey: { width: "23%", borderRadius: 8, alignItems: "center", paddingVertical: 10 },
  twoCols: { flexDirection: "row", gap: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  cancelBtn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  saveBtn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 18 },
  saveText: { color: "#061108", fontWeight: "900" },
  exportChoice: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 18, alignItems: "center", gap: 8 },
  exportLabel: { fontWeight: "900" },
  detailModal: { borderRadius: 24, borderWidth: 1, width: "100%", maxWidth: 390, alignSelf: "center", overflow: "hidden" },
  detailModalAccent: { position: "absolute", left: 0, top: 14, bottom: 0, width: 4 },
  detailStack: { gap: 16, padding: 22 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailItem: { width: "48%", borderRadius: 14, borderWidth: 1, padding: 17, minHeight: 84, justifyContent: "center" },
  detailLabel: { fontSize: 13, fontWeight: "900" },
  detailValue: { fontSize: 17, fontWeight: "900", marginTop: 10, lineHeight: 24 },
});
