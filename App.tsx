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
  TRANSACTION_TYPES,
} from "./src/domain/bucksLogic";
import { demoFreqIncome, demoSummaries, demoTransactions } from "./src/data/demoData";
import {
  createBucksSpreadsheet,
  findCompatibleSheets,
  readSummaries,
  readTransactions,
  saveTransaction,
  updateFreqIncome as updateGoogleFreqIncome,
  updateTransaction as updateGoogleTransaction,
  deleteTransaction as deleteGoogleTransaction,
} from "./src/api/googleWorkspace";
import { ExportFormat, SearchFilters, SummaryRow, Transaction, TransactionDraft, TransactionType } from "./src/types";

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
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);
  const [summaries, setSummaries] = useState<SummaryRow[]>(demoSummaries);
  const [freqIncome, setFreqIncome] = useState<Record<string, number>>(demoFreqIncome);
  const [addVisible, setAddVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [freqVisible, setFreqVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [draft, setDraft] = useState<TransactionDraft>(getBlankDraft());
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(emptySearch);
  const [searchActive, setSearchActive] = useState(false);
  const [deletedTx, setDeletedTx] = useState<Transaction | null>(null);
  const [freqInput, setFreqInput] = useState("");
  const { width } = useWindowDimensions();
  const compact = width < 820;

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
    const [token, sheetId] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(SHEET_KEY)]);
    if (token && sheetId) {
      setAccessToken(token);
      setSpreadsheetId(sheetId);
      setSetupStatus("Conectado a Google Sheets");
      reloadFromGoogle(token, sheetId);
    }
  }

  async function connectGoogleWorkspace(token: string) {
    setLoading(true);
    setSetupStatus("Buscando hojas compatibles en Drive...");
    try {
      const candidates = await findCompatibleSheets(token);
      const sheetId = candidates[0]?.id || (await createBucksSpreadsheet(token));
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await SecureStore.setItemAsync(SHEET_KEY, sheetId);
      setAccessToken(token);
      setSpreadsheetId(sheetId);
      setSetupStatus(candidates[0] ? `Hoja conectada: ${candidates[0].name}` : "Hoja Bucks Manager creada");
      await reloadFromGoogle(token, sheetId);
    } catch (error) {
      Alert.alert("Google Sheets", error instanceof Error ? error.message : "No se pudo conectar la hoja");
      setSetupStatus("Modo demo activo");
    } finally {
      setLoading(false);
    }
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

  if (!accessToken) {
    const canConnect = Boolean(GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <View style={styles.loginScreen}>
          <View style={[styles.loginMark, { backgroundColor: colors.greenSoft, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="sack" size={38} color={colors.green} />
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
      <View style={[styles.shell, compact && styles.shellCompact, { backgroundColor: colors.bg }]}>
        <View style={[styles.sidebar, compact && styles.sidebarCompact, { backgroundColor: colors.sidebar, borderColor: colors.border }]}>
          <View style={styles.brandRow}>
            <View style={[styles.logo, { backgroundColor: colors.greenSoft }]}>
              <MaterialCommunityIcons name="sack" size={28} color={colors.green} />
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
              <TouchableOpacity key={name} onPress={() => setMonth(idx)} style={[styles.monthChip, idx === month && { backgroundColor: colors.greenSoft, borderColor: colors.green }]}>
                <Text style={[styles.monthChipText, { color: idx === month ? colors.green : colors.muted }]}>{name.slice(0, 3)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.storageNote, { color: colors.muted }]}>Los datos se guardan en tu hoja de Google</Text>
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
                  {setupStatus}
                </Text>
              </View>
            </View>
            <View style={styles.topActions}>
              <TouchableOpacity style={[styles.headerBtn, compact && styles.headerBtnOutlined, { backgroundColor: compact ? colors.input : colors.card, borderColor: colors.border }]} onPress={() => setTheme(theme === "dark" ? "light" : "dark")}>
                <MaterialCommunityIcons name={theme === "dark" ? "weather-sunny" : "weather-night"} size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.headerBtn, compact && styles.headerBtnOutlined, { backgroundColor: compact ? colors.input : colors.card, borderColor: colors.border }]} onPress={() => setSearchVisible(true)}>
                <MaterialCommunityIcons name="magnify" size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.headerBtn, compact && styles.headerBtnOutlined, { backgroundColor: compact ? colors.input : colors.card, borderColor: colors.border }]} onPress={() => setExportVisible(true)}>
                <MaterialCommunityIcons name="file-export" size={20} color={colors.text} />
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
        onClose={() => setMenuVisible(false)}
      />
    </SafeAreaView>
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

function MobileMenu({ visible, colors, tab, setTab, month, setMonth, onClose }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity activeOpacity={1} style={styles.drawerOverlay} onPress={onClose}>
        <View style={[styles.drawer, { backgroundColor: colors.sidebar, borderColor: colors.border }]}>
          <View style={styles.brandRow}>
            <View style={[styles.logo, { backgroundColor: colors.greenSoft }]}>
              <MaterialCommunityIcons name="sack" size={28} color={colors.green} />
            </View>
            <View>
              <Text style={[styles.brandTitle, { color: colors.text }]}>Bucks Manager</Text>
              <Text style={[styles.brandSub, { color: colors.muted }]}>Control de gastos</Text>
            </View>
          </View>
          <View style={styles.navBlock}>
            <NavButton label="Tabla de Gastos" icon="table" active={tab === "expenses"} onPress={() => { setTab("expenses"); onClose(); }} colors={colors} />
            <NavButton label="Análisis" icon="chart-bar" active={tab === "summary"} onPress={() => { setTab("summary"); onClose(); }} colors={colors} />
          </View>
          <View style={styles.quickGrid}>
            {MONTH_NAMES.map((name, idx) => (
              <TouchableOpacity key={name} onPress={() => { setMonth(idx); onClose(); }} style={[styles.monthChip, { borderColor: colors.border }, idx === month && { backgroundColor: colors.greenSoft, borderColor: colors.green }]}>
                <Text style={[styles.monthChipText, { color: idx === month ? colors.green : colors.muted }]}>{name.slice(0, 3)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.storageNote, { color: colors.muted }]}>Los datos se guardan en tu hoja de Google.</Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function ExpensesView({ colors, summary, transactions, searchActive, compact, onEditFreq, onExitSearch, onOpenDetail, onEdit, onDelete }: any) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={[styles.statsGrid, compact && styles.statsGridMobile]}>
        <StatCard title="Ing. Frec." value={formatMoney(summary.freqIncome)} tone="income" icon="cash" colors={colors} action={onEditFreq} />
        <StatCard title="Ing. No Frec." value={formatMoney(summary.nonFreqIncome)} tone="income" icon="trending-up" colors={colors} />
        <StatCard title="Gasto Frec." value={formatMoney(summary.freqExpense)} tone="expense" icon="credit-card" colors={colors} />
        <StatCard title="Gasto No Frec." value={formatMoney(summary.nonFreqExpense)} tone="warn" icon="cart" colors={colors} />
        <StatCard title="Gasto Total" value={formatMoney(summary.totalExpense)} tone="expense" icon="basket" colors={colors} />
        <StatCard title="Balance" value={formatMoney(summary.netMonthly)} tone={summary.netMonthly >= 0 ? "income" : "expense"} icon="wallet" colors={colors} />
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
              <Text style={[styles.th, { color: colors.muted, flex: 0.8 }]}>FECHA</Text>
              <Text style={[styles.th, { color: colors.muted, flex: 0.9 }]}>MONTO</Text>
              <Text style={[styles.th, { color: colors.muted, flex: 1.4 }]}>DETALLE</Text>
              <Text style={[styles.th, { color: colors.muted, flex: 1.1 }]}>TIPO</Text>
            </View>
            {transactions.map((tx: Transaction) => (
              <TouchableOpacity key={`${tx.rowId}-${tx.createdAt}`} onPress={() => onOpenDetail(tx)} style={[styles.tr, compact && styles.trMobile, { borderColor: colors.border }]}>
                <Text style={[styles.td, compact && styles.tdMobile, { color: colors.text, flex: 0.8 }]}>{tx.date}</Text>
                <Text style={[styles.tdAmount, compact && styles.tdMobile, { color: tx.amount >= 0 ? colors.green : colors.red, flex: 0.9 }]}>{formatMoney(tx.amount)}</Text>
                <Text numberOfLines={1} style={[styles.td, compact && styles.tdMobile, { color: colors.text, flex: 1.4 }]}>{tx.detail}</Text>
                <Text numberOfLines={1} style={[styles.td, compact && styles.tdMobile, { color: colors.muted, flex: 1.1 }]}>{abbrev(tx.type)}</Text>
                <View style={styles.rowActions}>
                  <TouchableOpacity onPress={() => onEdit(tx)}>
                    <MaterialCommunityIcons name="pencil" size={18} color={colors.blue} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onDelete(tx)}>
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
  const append = (value: string) => setDraft({ ...draft, amount: `${draft.amount}${value}` });
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <ModalHeader title={editing ? "Editar movimiento" : "Nuevo movimiento"} icon="calculator" colors={colors} onClose={onClose} />
          <Field label="Fecha" value={draft.date} onChangeText={(date: string) => setDraft({ ...draft, date })} colors={colors} placeholder="YYYY-MM-DD" />
          <Text style={[styles.label, { color: colors.muted }]}>Tipo</Text>
          <View style={styles.typeGrid}>
            {TRANSACTION_TYPES.map((type) => (
              <TouchableOpacity key={type} onPress={() => setDraft({ ...draft, type })} style={[styles.typeChip, { borderColor: draft.type === type ? colors.green : colors.border, backgroundColor: draft.type === type ? colors.greenSoft : colors.input }]}>
                <Text style={{ color: draft.type === type ? colors.green : colors.text, fontWeight: "800", fontSize: 11 }}>{abbrev(type)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Field label="Monto" value={draft.amount} onChangeText={(amount: string) => setDraft({ ...draft, amount })} colors={colors} placeholder="Ej: (100+50)*2" />
          <View style={styles.calcGrid}>
            {["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "C", "+"].map((key) => (
              <TouchableOpacity key={key} onPress={() => (key === "C" ? setDraft({ ...draft, amount: "" }) : append(key))} style={[styles.calcKey, { backgroundColor: colors.input }]}>
                <Text style={{ color: colors.text, fontWeight: "900" }}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Field label="Detalle" value={draft.detail} onChangeText={(detail: string) => setDraft({ ...draft, detail })} colors={colors} placeholder="Ej: Compra en supermercado" />
          <ActionRow colors={colors} onCancel={onClose} onSubmit={onSubmit} submitLabel={editing ? "Guardar" : "Agregar"} />
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
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <ModalHeader title="Detalle del gasto" icon="receipt" colors={colors} onClose={onClose} />
          {tx && (
            <View style={styles.detailGrid}>
              <Detail label="Fecha" value={tx.date} colors={colors} />
              <Detail label="Hora de creación" value={formatCreatedTime(tx.createdAt)} colors={colors} />
              <Detail label="Monto" value={formatMoney(tx.amount)} colors={colors} />
              <Detail label="Tipo" value={tx.type} colors={colors} />
              <Detail label="Detalle" value={tx.detail} colors={colors} wide />
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

function Field({ label, value, onChangeText, colors, placeholder = "" }: any) {
  return (
    <View style={{ flex: 1, marginBottom: 12 }}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} />
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
  const color = tone === "income" ? colors.green : tone === "warn" ? colors.yellow : colors.red;
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}22` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
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

function Detail({ label, value, colors, wide }: any) {
  return (
    <View style={[styles.detailItem, wide && { width: "100%" }, { backgroundColor: colors.input }]}>
      <Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text>
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
    <TouchableOpacity onPress={onPress} style={[styles.navBtn, active && { backgroundColor: colors.greenSoft }]}>
      <MaterialCommunityIcons name={icon} size={18} color={active ? colors.green : colors.muted} />
      <Text style={[styles.navText, { color: active ? colors.green : colors.text }]}>{label}</Text>
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

function formatCreatedTime(createdAt?: string) {
  if (!createdAt) return "-";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

type Palette = typeof dark;

const dark = {
  bg: "#080c0a",
  sidebar: "#0d1410",
  card: "#101812",
  input: "#162119",
  border: "#27362d",
  text: "#f5f7f2",
  muted: "#91a198",
  green: "#24d46b",
  greenSoft: "rgba(36,212,107,0.14)",
  red: "#ff4d57",
  yellow: "#ffc145",
  blue: "#42a5f5",
  disabled: "#405047",
};

const light = {
  bg: "#edf4ec",
  sidebar: "#f8fbf4",
  card: "#ffffff",
  input: "#f2f6f0",
  border: "#d7e1d4",
  text: "#101510",
  muted: "#607066",
  green: "#0fa958",
  greenSoft: "rgba(15,169,88,0.12)",
  red: "#d63b45",
  yellow: "#d99a18",
  blue: "#2274b8",
  disabled: "#c9d2cb",
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  shell: { flex: 1, flexDirection: "row", padding: 12, gap: 12 },
  shellCompact: { flexDirection: "column", padding: 0, gap: 0 },
  sidebar: { width: 245, borderWidth: 1, borderRadius: 8, padding: 16 },
  sidebarCompact: { display: "none" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  logo: { width: 46, height: 46, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  brandTitle: { fontSize: 20, fontWeight: "900" },
  brandSub: { fontSize: 12, fontWeight: "700" },
  kicker: { fontSize: 11, fontWeight: "900", marginBottom: 10 },
  periodBox: { marginBottom: 20 },
  yearRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  yearChip: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  yearText: { fontSize: 12, fontWeight: "900" },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  monthLabel: { fontSize: 16, fontWeight: "900" },
  iconBtn: { width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  navBlock: { gap: 8, marginBottom: 18 },
  navBtn: { flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 8 },
  navText: { fontWeight: "900" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthChip: { width: 48, paddingVertical: 9, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  monthChipText: { fontSize: 12, fontWeight: "900" },
  storageNote: { marginTop: "auto", fontSize: 12, fontWeight: "700" },
  content: { flex: 1 },
  loginScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 26 },
  loginMark: { width: 78, height: 78, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  loginTitle: { fontSize: 30, fontWeight: "900", textAlign: "center" },
  loginSubtitle: { maxWidth: 310, marginTop: 9, marginBottom: 24, fontSize: 14, fontWeight: "700", lineHeight: 20, textAlign: "center" },
  googleLoginBtn: { minWidth: 232, minHeight: 50, marginTop: 22, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleLoginText: { color: "#061108", fontSize: 15, fontWeight: "900" },
  loginStatus: { marginTop: 14, fontSize: 12, fontWeight: "700", textAlign: "center" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  topBarMobile: { marginBottom: 0, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  headerLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  pageTitle: { fontSize: 28, fontWeight: "900" },
  pageTitleMobile: { fontSize: 20 },
  pageSub: { fontSize: 13, fontWeight: "700" },
  pageSubMobile: { fontSize: 14 },
  topActions: { flexDirection: "row", gap: 8 },
  headerBtn: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  headerBtnOutlined: { borderWidth: 1 },
  mobileControls: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  mobileYearRail: { gap: 8, paddingRight: 2 },
  mobileYearChip: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  mobileYearText: { fontSize: 13, fontWeight: "900" },
  monthNavMobile: { flex: 1, minWidth: 128, height: 39, borderWidth: 1, borderRadius: 8, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthArrowMobile: { width: 31, height: 31, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  monthNavTextMobile: { flex: 1, textAlign: "center", fontSize: 14, fontWeight: "900" },
  todayBtnMobile: { width: 39, height: 39, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  connectCard: { borderWidth: 1, borderRadius: 8, padding: 14, flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 12 },
  connectTitle: { fontSize: 16, fontWeight: "900" },
  connectText: { fontSize: 12, fontWeight: "700", lineHeight: 18 },
  connectBtn: { borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14 },
  connectBtnText: { color: "#061108", fontWeight: "900" },
  loadingBar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  statsGridMobile: { padding: 14, gap: 8, marginBottom: 0 },
  statCard: { width: "32%", minWidth: 136, borderWidth: 1, borderRadius: 8, padding: 12, position: "relative" },
  statIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  statLabel: { fontSize: 12, fontWeight: "800" },
  statValue: { fontSize: 18, fontWeight: "900", marginTop: 4 },
  editStat: { position: "absolute", right: 10, top: 10 },
  searchBanner: { borderRadius: 8, padding: 12, flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  tableCard: { borderWidth: 1, borderRadius: 8, overflow: "hidden", marginBottom: 18 },
  tableCardMobile: { marginHorizontal: 14, borderRadius: 18 },
  tableWide: { width: "100%" },
  mobileTableWide: { width: 640 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: 10 },
  th: { fontSize: 11, fontWeight: "900" },
  tr: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingVertical: 13, paddingHorizontal: 10 },
  trMobile: { paddingVertical: 12 },
  td: { fontSize: 13, fontWeight: "700" },
  tdMobile: { fontSize: 15 },
  tdAmount: { fontSize: 13, fontWeight: "900" },
  rowActions: { width: 52, flexDirection: "row", justifyContent: "space-between" },
  empty: { padding: 18, textAlign: "center", fontWeight: "700" },
  fab: { position: "absolute", right: 22, bottom: 22, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  undoFab: { position: "absolute", left: 270, bottom: 22, borderRadius: 999, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", gap: 8 },
  drawerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)" },
  drawer: { width: 288, height: "100%", borderRightWidth: 1, padding: 18 },
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
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: "900" },
  label: { fontSize: 12, fontWeight: "900", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 12, fontWeight: "800" },
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
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailItem: { width: "48%", borderRadius: 8, padding: 12 },
  detailLabel: { fontSize: 11, fontWeight: "900" },
  detailValue: { fontSize: 14, fontWeight: "900", marginTop: 5 },
});
