import { formatDateToISO } from "../domain/bucksLogic";
import { UI_COPY, UiCopy } from "../i18n";
import { TransactionType } from "../types";

export function formatCreatedTime(createdAt?: string): string {
  if (!createdAt) return "-";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function formatDateGroupLabel(rawDate: string, copy: UiCopy = UI_COPY.es): string {
  const date = new Date(rawDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const locale = copy.languageCode === "en" ? "en-US" : "es-PE";
  const shortDate = date.toLocaleDateString(locale, { month: "short", day: "2-digit" }).toUpperCase();

  if (formatDateToISO(date) === formatDateToISO(today)) return `${copy.today} - ${shortDate}`;
  if (formatDateToISO(date) === formatDateToISO(yesterday)) return `${copy.yesterday} - ${shortDate}`;
  return date.toLocaleDateString(locale, { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
}

export function typeColor(type: string, colors: Record<string, string>): string {
  if (type === "INGRESO NO FRECUENTE" || type === "INGRESO FRECUENTE") return colors.green;
  if (type === "GASTO FRECUENTE") return colors.red;
  return colors.yellow;
}

export function typeFill(type: string, colors: Record<string, string>): string {
  if (type === "INGRESO NO FRECUENTE" || type === "INGRESO FRECUENTE") return colors.incomeSoft;
  if (type === "GASTO FRECUENTE") return colors.expenseSoft;
  return colors.warnSoft;
}

export function typeLabel(type: TransactionType | string, copy: UiCopy) {
  if (type === "INGRESO FRECUENTE") return copy.freqIncome;
  if (type === "INGRESO NO FRECUENTE") return copy.nonFreqIncome;
  if (type === "GASTO FRECUENTE") return copy.freqExpense;
  return copy.nonFreqExpense;
}

export function typeLabelFull(type: TransactionType | string, copy: UiCopy) {
  if (type === "INGRESO FRECUENTE") return copy.freqIncomeFull;
  if (type === "INGRESO NO FRECUENTE") return copy.nonFreqIncomeFull;
  if (type === "GASTO FRECUENTE") return copy.freqExpenseFull;
  return copy.nonFreqExpenseFull;
}
