import type { SearchFilters, SummaryRow, Transaction, TransactionDraft, TransactionType } from "../types";

export const SHEET_NAMES = {
  transactions: "INGRESOS Y GASTOS",
  summary: "RESUMEN POR MES",
};

// Sheets locale controls formula names/separators; app language and currency are device-detected separately.
export const DEFAULT_SPREADSHEET_LOCALE = "es_PE";

export const TRANSACTION_TYPES: TransactionType[] = [
  "INGRESO FRECUENTE",
  "INGRESO NO FRECUENTE",
  "GASTO FRECUENTE",
  "GASTO NO FRECUENTE",
];

export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Formatea un valor numérico como moneda con signo explícito: "+ S/ 100.00" o "- S/ 50.00" */
export function formatMoney(value: number, symbol = "S/", decimals = 2): string {
  const n = Number(value) || 0;
  const sign = n >= 0 ? "+ " : "- ";
  return `${sign}${symbol} ${Math.abs(n).toFixed(decimals)}`;
}

/** Convierte un Date o string ISO a formato YYYY-MM-DD */
export function formatDateToISO(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Convierte Date al formato usado en Sheets: DD-mes-AA (ej: 15-jun-26) */
export function formatDateForSheet(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}-${SHORT_MONTHS[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
}

/** Parsea fecha en español "15-jun-26" → Date | null */
export function parseSpanishDate(value: string): Date | null {
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const month = SHORT_MONTHS.indexOf(parts[1].toLowerCase());
  if (month < 0) return null;
  const day = Number(parts[0]);
  let year = Number(parts[2]);
  if (!Number.isInteger(day) || !Number.isInteger(year) || day < 1) return null;
  if (year >= 0 && year < 100) year += 2000;
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
}

/** Devuelve "Mes Año" para un Date dado (ej: "Enero 2026") */
export function getMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Evalúa una expresión matemática (+, -, *, /, paréntesis) con sanitización previa */
export function calculateExpression(expression: string): number {
  const clean = expression.replace(/[^0-9+\-*/().\s]/g, "");
  if (!clean.trim()) return 0;
  try {
    const result = Function(`"use strict"; return (${clean})`)();
    return Number.isFinite(Number(result)) ? Number(result) : 0;
  } catch {
    return 0;
  }
}

/** Elimina el prefijo "=" de una expresión de monto */
export function normalizeAmountExpression(value: string): string {
  return value.trim().replace(/^=/, "").trim();
}

/** Detecta si el valor es una fórmula que debe ser evaluada */
function isMathExpression(value: string): boolean {
  const expression = normalizeAmountExpression(value);
  return value.trim().startsWith("=") || /[+*/()]/.test(expression) || /.\s*-/.test(expression);
}

/** Aplica signo al monto según tipo: gastos → negativo, ingresos → positivo */
export function normalizeDraftAmount(draft: TransactionDraft): number {
  const calculated = getDraftAmountValue(draft);
  if (draft.type.startsWith("GASTO")) return -Math.abs(calculated);
  return Math.abs(calculated);
}

export function isValidTransactionDraft(draft: TransactionDraft): boolean {
  const amount = getDraftAmountValue(draft);
  return Boolean(
    draft.date
      && isValidDraftDate(draft.date)
      && draft.detail.trim()
      && Math.abs(amount) > 0
      && (draft.type.startsWith("INGRESO") ? amount > 0 : amount < 0),
  );
}

function getDraftAmountValue(draft: TransactionDraft): number {
  return Number(calculateExpression(normalizeAmountExpression(draft.amount)));
}

function isValidDraftDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(`${value}T00:00:00`);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Convierte createdAt en ms desde medianoche (para formato HH:MM:SS) o desde epoch (para ISO) */
export function parseCreatedAtMs(createdAt?: string): number {
  if (!createdAt) return 0;
  const timeMatch = createdAt.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    const s = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    return h * 3600000 + m * 60000 + s * 1000;
  }
  return Date.parse(createdAt) || 0;
}

/** Construye un Transaction completo a partir de un borrador y un rowId */
export function buildTransactionFromDraft(draft: TransactionDraft, rowId: number): Transaction {
  if (!isValidTransactionDraft(draft)) throw new Error("Invalid transaction draft");
  const date = new Date(`${draft.date}T00:00:00`);
  const amount = normalizeDraftAmount(draft);
  const createdAt = draft.createdAt || new Date().toISOString();
  return {
    rowId,
    date: formatDateForSheet(date),
    rawDate: date.toISOString(),
    rawDateMs: date.getTime(),
    createdAtMs: parseCreatedAtMs(createdAt),
    amount,
    formula: isMathExpression(draft.amount) ? normalizeAmountExpression(draft.amount) : "",
    detail: draft.detail.trim(),
    type: draft.type,
    createdAt,
    tags: draft.type.startsWith("GASTO") ? draft.tags : [],
  };
}

/** Inserta una transacci�n en orden cronol�gico y renumera todos los rowId */
export function insertChronologically(transactions: Transaction[], tx: Transaction): Transaction[] {
  const next = [...transactions];
  const targetMs = tx.rawDateMs ?? Date.parse(tx.rawDate);
  const targetDate = targetMs - (targetMs % 86400000);
  const targetTime = tx.createdAtMs ?? 0;
  const index = next.findIndex((item) => {
    const itemMs = item.rawDateMs ?? Date.parse(item.rawDate);
    const itemDate = itemMs - (itemMs % 86400000);
    if (itemDate > targetDate) return true;
    if (itemDate === targetDate) {
      const itemTime = item.createdAtMs ?? 0;
      if (itemTime !== targetTime) return itemTime > targetTime;
      return item.rowId > (tx.rowId || 0);
    }
    return false;
  });
  if (index === -1) next.push(tx);
  else next.splice(index, 0, tx);
  return next.map((item, idx) => ({ ...item, rowId: idx + 2 }));
}
export function applySearch(
  transactions: Transaction[],
  filters: SearchFilters,
  tagLabelsById: Record<string, string> = {},
): Transaction[] {
  const text = filters.text.toLowerCase().trim();
  const tag = (filters.tag || "").trim();
  const min = filters.minAmount ? Number(filters.minAmount) : null;
  const max = filters.maxAmount ? Number(filters.maxAmount) : null;
  const start = filters.startDate ? Date.parse(`${filters.startDate}T00:00:00`) : null;
  const end = filters.endDate ? Date.parse(`${filters.endDate}T23:59:59`) : null;

  return transactions
    .filter((tx) => {
      const abs = Math.abs(Number(tx.amount) || 0);
      const date = tx.rawDateMs ?? Date.parse(tx.rawDate);
      const tagLabels = (tx.tags || [])
        .map((id) => tagLabelsById[id] ?? id)
        .join(" ");
      const haystack = `${tx.detail} ${tx.type} ${tagLabels}`.toLowerCase();
      if (text && !haystack.includes(text)) return false;
      if (tag && !(tx.tags || []).includes(tag)) return false;
      if (min !== null && abs < min) return false;
      if (max !== null && abs > max) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    })
    .sort((a, b) => (b.rawDateMs ?? Date.parse(b.rawDate)) - (a.rawDateMs ?? Date.parse(a.rawDate)) || (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
    .slice(0, 150);
}

/** Calcula el resumen de UN mes a partir de las transacciones de ese mes y el freqIncome persistido. */
export function calculateMonthSummary(
  transactions: Transaction[],
  freqIncomeByMonth: Record<string, number>,
  monthKey: string,
): SummaryRow {
  const row: SummaryRow = {
    monthYear: monthKey,
    freqIncome: 0,
    nonFreqIncome: 0,
    totalIncome: 0,
    freqExpense: 0,
    nonFreqExpense: 0,
    totalExpense: 0,
    netMonthly: 0,
    netNoFreq: 0,
  };
  transactions.forEach((tx) => {
    if (tx.type === "INGRESO FRECUENTE") row.freqIncome += Number(tx.amount) || 0;
    if (tx.type === "INGRESO NO FRECUENTE") row.nonFreqIncome += Number(tx.amount) || 0;
    if (tx.type === "GASTO FRECUENTE") row.freqExpense += Number(tx.amount) || 0;
    if (tx.type === "GASTO NO FRECUENTE") row.nonFreqExpense += Number(tx.amount) || 0;
  });
  if (row.freqIncome === 0) {
    row.freqIncome = freqIncomeByMonth[monthKey] || 0;
  }
  row.totalIncome = row.freqIncome + row.nonFreqIncome;
  row.totalExpense = row.freqExpense + row.nonFreqExpense;
  row.netMonthly = row.totalIncome + row.totalExpense;
  row.netNoFreq = row.totalIncome + row.totalExpense - row.freqIncome;
  return row;
}

/** Devuelve el monthKey ("Marzo 2026") para una transacción */
export function getTransactionMonthKey(tx: Transaction): string {
  const date = tx.rawDateMs != null ? new Date(tx.rawDateMs) : parseLocalDate(tx.rawDate);
  return getMonthYear(date);
}

/** Parsea una fecha ISO o YYYY-MM-DD como local midnight (evita corrimientos por zona UTC) */
function parseLocalDate(rawDate: string): Date {
  if (!rawDate) return new Date(NaN);
  const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    return new Date(year, month, day);
  }
  return new Date(rawDate);
}

/** Recalcula solo los summaries de los meses indicados, preservando el resto de un array previo */
export function recalculateSummariesForMonths(
  transactions: Transaction[],
  freqIncomeByMonth: Record<string, number>,
  monthKeys: string[],
  existingSummaries: SummaryRow[],
): SummaryRow[] {
  if (monthKeys.length === 0) return existingSummaries;
  const monthSet = new Set(monthKeys);
  const byMonth = new Map<string, Transaction[]>();
  transactions.forEach((tx) => {
    const key = getTransactionMonthKey(tx);
    if (!monthSet.has(key)) return;
    const list = byMonth.get(key);
    if (list) list.push(tx);
    else byMonth.set(key, [tx]);
  });
  const updated = existingSummaries.map((row) =>
    monthSet.has(row.monthYear)
      ? calculateMonthSummary(byMonth.get(row.monthYear) || [], freqIncomeByMonth, row.monthYear)
      : row,
  );
  monthKeys.forEach((key) => {
    if (!updated.some((row) => row.monthYear === key)) {
      updated.push(calculateMonthSummary(byMonth.get(key) || [], freqIncomeByMonth, key));
    }
  });
  updated.sort((a, b) => monthYearToDate(a.monthYear).getTime() - monthYearToDate(b.monthYear).getTime());
  return updated;
}

/** Devuelve el conjunto único de monthKeys para un grupo de transacciones */
export function uniqueMonthKeys(transactions: Transaction[]): string[] {
  const set = new Set<string>();
  transactions.forEach((tx) => set.add(getTransactionMonthKey(tx)));
  return Array.from(set);
}

/** Agrupa transacciones por mes y calcula totales para la vista RESUMEN POR MES */
export function calculateSummaries(transactions: Transaction[], freqIncomeByMonth: Record<string, number>): SummaryRow[] {
  const byMonth = new Map<string, Transaction[]>();
  transactions.forEach((tx) => {
    const key = getTransactionMonthKey(tx);
    const list = byMonth.get(key);
    if (list) list.push(tx);
    else byMonth.set(key, [tx]);
  });

  const monthKeys = new Set<string>(byMonth.keys());
  Object.keys(freqIncomeByMonth).forEach((key) => monthKeys.add(key));

  const rows = Array.from(monthKeys).map((monthKey) =>
    calculateMonthSummary(byMonth.get(monthKey) || [], freqIncomeByMonth, monthKey),
  );
  rows.sort((a, b) => monthYearToDate(a.monthYear).getTime() - monthYearToDate(b.monthYear).getTime());
  return rows;
}

/** Convierte "Enero 2026" → Date del primer día de ese mes */
function monthYearToDate(monthYear: string): Date {
  const [monthName, year] = monthYear.split(" ");
  const month = MONTH_NAMES.findIndex((name) => name.toLowerCase() === monthName.toLowerCase());
  return new Date(Number(year), Math.max(0, month), 1);
}
