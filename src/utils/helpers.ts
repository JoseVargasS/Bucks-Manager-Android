import { Transaction, FontPreference } from "../types";
import { ExportConfig } from "../components/modals/ExportModal";
import { MONTH_NAMES } from "../domain/bucksLogic";
import { setAppFontPreference } from "../components/ui/AppText";

export function getLatestTransactionDate(transactions: Transaction[]) {
  const today = new Date();
  return transactions.reduce<Date | null>((latest, tx) => {
    const date = new Date(tx.rawDate);
    if (Number.isNaN(date.getTime()) || date > today) return latest;
    if (!latest || date.getTime() > latest.getTime()) return date;
    return latest;
  }, null);
}

export function parseLocalDateTime(value: string, endOfDay: boolean) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return Number.NaN;
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime();
}

export function parseMonthKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return Number.NaN;
  return year * 12 + (month - 1);
}

export function buildExportFileName(cfg: ExportConfig) {
  const range = cfg.rangeMode === "months"
    ? buildRangeFilePart(cfg.startDate, cfg.endDate, formatMonthFilePart)
    : buildRangeFilePart(cfg.startDate, cfg.endDate);
  return `bucks-manager_${range}`;
}

function buildRangeFilePart(start: string, end: string, formatter?: (value: string) => string) {
  const fmt = formatter || ((v: string) => v);
  if (start && end) return `${fmt(start)}_a_${fmt(end)}`;
  if (start) return `desde_${fmt(start)}`;
  if (end) return `hasta_${fmt(end)}`;
  return "todo";
}

function formatMonthFilePart(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "mes";
  return `${slugify(MONTH_NAMES[month - 1] || "mes")}-${year}`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getPeriodRange(transactions: Transaction[]) {
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

export function getAvailableMonthsForYear(year: number, transactions: Transaction[]) {
  const range = getPeriodRange(transactions);
  if (year < range.minYear || year > range.maxYear) return [];
  const start = year === range.minYear ? range.minMonth : 0;
  const end = year === range.maxYear ? range.maxMonth : 11;
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export function detectDeviceLanguage(): "es" | "en" {
  return (Intl.DateTimeFormat().resolvedOptions().locale || "es").toLowerCase().startsWith("es") ? "es" : "en";
}

export function detectDeviceCurrencySymbol() {
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

export function applyDefaultFont(fontPreference: FontPreference) {
  setAppFontPreference(fontPreference);
}
