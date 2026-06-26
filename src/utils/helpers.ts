import type { Transaction } from "../types";
import type { ExportConfig } from "../components/modals/ExportModal";
import { MONTH_NAMES } from "../domain/bucksLogic";

export function buildExportFileName(cfg: ExportConfig) {
  const fmtDate = (value: string) => value;
  const fmtMonth = (value: string) => {
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return "mes";
    const name = (MONTH_NAMES[month - 1] || "mes").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `${name}-${year}`;
  };
  const fmt = cfg.rangeMode === "months" ? fmtMonth : fmtDate;
  const start = cfg.startDate ? `desde_${fmt(cfg.startDate)}` : "";
  const end = cfg.endDate ? `hasta_${fmt(cfg.endDate)}` : "";
  const range = cfg.startDate && cfg.endDate ? `${fmt(cfg.startDate)}_a_${fmt(cfg.endDate)}` : start || end || "todo";
  return `bucks-manager_${range}`;
}

export function getPeriodRange(transactions: Transaction[]) {
  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let first: Date | null = null;
  let last: Date | null = null;
  for (const tx of transactions) {
    const date = new Date(tx.rawDate);
    if (Number.isNaN(date.getTime()) || date > today) continue;
    if (!first || date < first) first = date;
    if (!last || date > last) last = date;
  }
  if (!first || !last) {
    return {
      minYear: currentMonthStart.getFullYear(),
      minMonth: currentMonthStart.getMonth(),
      maxYear: currentMonthStart.getFullYear(),
      maxMonth: currentMonthStart.getMonth(),
    };
  }
  return {
    minYear: first.getFullYear(),
    minMonth: first.getMonth(),
    maxYear: last.getFullYear(),
    maxMonth: last.getMonth(),
  };
}

export function getAvailableMonthsForYear(year: number, range: ReturnType<typeof getPeriodRange>) {
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

