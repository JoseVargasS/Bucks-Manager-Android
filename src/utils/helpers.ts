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
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
    const parts = locale.split("-");
    const region = parts.find((p) => /^[A-Z]{2}$/.test(p));
    if (region) {
      const fmt = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currencyForRegion(region),
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      const symParts = fmt.formatToParts(0);
      const sym = symParts.find((p) => p.type === "currency")?.value;
      if (sym) return sym;
    }
    // ponytail: language-level fallback when locale has no region
    const lang = parts[0]?.toLowerCase();
    if (lang) {
      const fallbackRegion = langFallbackRegion(lang);
      if (fallbackRegion) {
        const fmt = new Intl.NumberFormat(`${lang}-${fallbackRegion}`, {
          style: "currency",
          currency: currencyForRegion(fallbackRegion),
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });
        const symParts = fmt.formatToParts(0);
        const sym = symParts.find((p) => p.type === "currency")?.value;
        if (sym) return sym;
      }
    }
  } catch { /* fallback */ }
  return "$";
}

function langFallbackRegion(lang: string): string | undefined {
  const map: Record<string, string> = { es: "PE", en: "US", pt: "BR", fr: "FR", de: "DE", it: "IT", ja: "JP", ko: "KR", zh: "CN", ru: "RU", hi: "IN", ar: "SA" };
  return map[lang];
}

function currencyForRegion(region: string): string {
  const map: Record<string, string> = {
    PE: "PEN", US: "USD", EC: "USD", PA: "USD", SV: "USD",
    ES: "EUR", FR: "EUR", DE: "EUR", IT: "EUR", PT: "EUR",
    GB: "GBP", JP: "JPY", BR: "BRL", MX: "MXN", CO: "COP",
    CL: "CLP", AR: "ARS", UY: "UYU", BO: "BOB", PY: "PYG",
    CR: "CRC", DO: "DOP", GT: "GTQ", HN: "HNL", NI: "NIO",
    CA: "CAD", AU: "AUD", NZ: "NZD", CN: "CNY", KR: "KRW",
    IN: "INR", RU: "RUB", ZA: "ZAR", TR: "TRY", CH: "CHF",
    VE: "VES", CU: "CUP",
  };
  return map[region] || "USD";
}

