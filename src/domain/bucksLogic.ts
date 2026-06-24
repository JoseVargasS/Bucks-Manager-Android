import type { SearchFilters, SummaryRow, Transaction, TransactionDraft, TransactionType } from "../types";

export const SHEET_NAMES = {
  transactions: "INGRESOS Y GASTOS",
  summary: "RESUMEN POR MES",
};

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
  let year = Number(parts[2]);
  if (year < 100) year += 2000;
  const date = new Date(year, month, Number(parts[0]));
  return Number.isNaN(date.getTime()) ? null : date;
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
function normalizeDraftAmount(draft: TransactionDraft): number {
  const calculated = Number(calculateExpression(normalizeAmountExpression(draft.amount)));
  if (draft.type.startsWith("GASTO")) return -Math.abs(calculated);
  return Math.abs(calculated);
}

/** Construye un Transaction completo a partir de un borrador y un rowId */
export function buildTransactionFromDraft(draft: TransactionDraft, rowId: number): Transaction {
  const date = new Date(`${draft.date}T00:00:00`);
  const amount = normalizeDraftAmount(draft);
  return {
    rowId,
    date: formatDateForSheet(date),
    rawDate: date.toISOString(),
    amount,
    formula: isMathExpression(draft.amount) ? normalizeAmountExpression(draft.amount) : "",
    detail: draft.detail.trim(),
    type: draft.type,
    createdAt: draft.createdAt || new Date().toISOString(),
    tags: draft.tags,
  };
}

/** Inserta una transacción en orden cronológico y renumera todos los rowId */
export function insertChronologically(transactions: Transaction[], tx: Transaction): Transaction[] {
  const next = [...transactions];
  const target = new Date(tx.rawDate).setHours(0, 0, 0, 0);
  const index = next.findIndex((item) => new Date(item.rawDate).setHours(0, 0, 0, 0) > target);
  if (index === -1) next.push(tx);
  else next.splice(index, 0, tx);
  return next.map((item, idx) => ({ ...item, rowId: idx + 2 }));
}

/** Aplica filtros de búsqueda avanzada (texto, montos, fechas). Límite 150 resultados. */
export function applySearch(transactions: Transaction[], filters: SearchFilters): Transaction[] {
  const text = filters.text.toLowerCase().trim();
  const tag = (filters.tag || "").trim();
  const min = filters.minAmount ? Number(filters.minAmount) : null;
  const max = filters.maxAmount ? Number(filters.maxAmount) : null;
  const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`) : null;
  const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59`) : null;

  return transactions
    .filter((tx) => {
      const abs = Math.abs(Number(tx.amount) || 0);
      const date = new Date(tx.rawDate);
      const haystack = `${tx.detail} ${tx.type} ${(tx.tags || []).join(" ")}`.toLowerCase();
      if (text && !haystack.includes(text)) return false;
      if (tag && !(tx.tags || []).includes(tag)) return false;
      if (min !== null && abs < min) return false;
      if (max !== null && abs > max) return false;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    })
    .sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime() || b.rowId - a.rowId)
    .slice(0, 150);
}

/** Agrupa transacciones por mes y calcula totales para la vista RESUMEN POR MES */
export function calculateSummaries(transactions: Transaction[], freqIncomeByMonth: Record<string, number>): SummaryRow[] {
  const byMonth = new Map<string, SummaryRow>();
  transactions.forEach((tx) => {
    const date = new Date(tx.rawDate);
    const key = getMonthYear(date);
    const current = byMonth.get(key) || {
      monthYear: key, freqIncome: freqIncomeByMonth[key] || 0, nonFreqIncome: 0,
      totalIncome: 0, freqExpense: 0, nonFreqExpense: 0,
      totalExpense: 0, netMonthly: 0, netNoFreq: 0,
    };
    if (tx.type === "INGRESO NO FRECUENTE") current.nonFreqIncome += Number(tx.amount) || 0;
    if (tx.type === "GASTO FRECUENTE") current.freqExpense += Number(tx.amount) || 0;
    if (tx.type === "GASTO NO FRECUENTE") current.nonFreqExpense += Number(tx.amount) || 0;
    byMonth.set(key, current);
  });

  Object.keys(freqIncomeByMonth).forEach((key) => {
    if (!byMonth.has(key)) {
      byMonth.set(key, {
        monthYear: key, freqIncome: freqIncomeByMonth[key], nonFreqIncome: 0,
        totalIncome: 0, freqExpense: 0, nonFreqExpense: 0,
        totalExpense: 0, netMonthly: 0, netNoFreq: 0,
      });
    }
  });

  return Array.from(byMonth.values())
    .map((row) => {
      const totalIncome = row.freqIncome + row.nonFreqIncome;
      const totalExpense = row.freqExpense + row.nonFreqExpense;
      return { ...row, totalIncome, totalExpense, netMonthly: totalIncome + totalExpense, netNoFreq: totalIncome + totalExpense - row.freqIncome };
    })
    .sort((a, b) => monthYearToDate(a.monthYear).getTime() - monthYearToDate(b.monthYear).getTime());
}

/** Convierte "Enero 2026" → Date del primer día de ese mes */
function monthYearToDate(monthYear: string): Date {
  const [monthName, year] = monthYear.split(" ");
  const month = MONTH_NAMES.findIndex((name) => name.toLowerCase() === monthName.toLowerCase());
  return new Date(Number(year), Math.max(0, month), 1);
}
