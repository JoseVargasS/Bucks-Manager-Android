import { TRANSACTION_TYPES, parseSpanishDate as parseSpanishDateBs } from "../domain/bucksLogic";
import type { Transaction } from "../types";

export function normalizeHeader(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function compactHeader(value: unknown) {
  return normalizeHeader(value).replace(/[^A-Z0-9]/g, "");
}

const HEADER_ALIASES: Record<string, string[]> = {
  FECHA: ["FECHA"],
  MONTO: ["MONTO"],
  DETALLE: ["DETALLE"],
  TIPO: ["TIPO", "TIPO DE GASTO"],
  "HORA DE CREACION": ["HORA DE CREACION", "HORA CREACION"],
  MES: ["MES", "MES Y ANO", "MES Y AÑO"],
  "INGRESO FRECUENTE": ["INGRESO FRECUENTE"],
  "INGRESO NO FRECUENTE": ["INGRESO NO FRECUENTE"],
  "TOTAL INGRESOS": ["TOTAL INGRESOS"],
  "GASTO FRECUENTE": ["GASTO FRECUENTE"],
  "GASTO NO FRECUENTE": ["GASTO NO FRECUENTE"],
  "TOTAL GASTOS": ["TOTAL GASTOS"],
  "NETO MENSUAL": ["NETO MENSUAL"],
  "NETO SIN ING FRECUENTE": [
    "NETO SIN ING FRECUENTE",
    "TOTAL SIN INGRESO FRECUENTE",
    "TOTAL SIN ING FRECUENTE",
  ],
};

export function headerAliases(expected: string) {
  const base = normalizeHeader(expected);
  const compactBase = compactHeader(base);
  if (compactBase.startsWith("HORADECREACI"))
    return ["HORA DE CREACION", "HORA CREACION"];
  return HEADER_ALIASES[base] || [base];
}

export function headerMatches(actual: string, expected: string) {
  const actualCompact = compactHeader(actual);
  const allowed = headerAliases(expected).map(compactHeader);
  return allowed.includes(actualCompact);
}

export function hasHeaders(actual: string[], expected: string[]) {
  const normalized = actual.map(normalizeHeader);
  return expected.every((header, index) =>
    headerMatches(normalized[index], header),
  );
}

export function findHeaderIndex(rows: unknown[][], expected: string[]) {
  return rows.findIndex((row) => hasHeaders(row.map(String), expected));
}

export function parseSheetDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(value));
    return epoch;
  }
  const asString = String(value);
  const spanish = parseSpanishDateBs(asString);
  if (spanish) return spanish;
  const numeric = parseNumericDate(asString);
  if (numeric) return numeric;
  const monthYear = parseMonthYear(asString);
  if (monthYear) return monthYear;
  const date = new Date(`${asString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumericDate(value: string) {
  const match = value
    .trim()
    .match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+.*)?$/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  let year = Number(match[3]);
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(second) ||
    !Number.isFinite(year)
  )
    return null;
  if (year < 100) year += 2000;

  const day = first > 12 ? first : second > 12 ? second : first;
  const month = first > 12 ? second : second > 12 ? first : second;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function parseMonthYear(value: string) {
  const clean = normalizeHeader(value);
  const months = [
    ["ENERO", "ENE"],
    ["FEBRERO", "FEB"],
    ["MARZO", "MAR"],
    ["ABRIL", "ABR"],
    ["MAYO", "MAY"],
    ["JUNIO", "JUN"],
    ["JULIO", "JUL"],
    ["AGOSTO", "AGO"],
    ["SEPTIEMBRE", "SEP", "SET"],
    ["OCTUBRE", "OCT"],
    ["NOVIEMBRE", "NOV"],
    ["DICIEMBRE", "DIC"],
  ];
  const month = months.findIndex((names) =>
    names.some((name) => clean.startsWith(name)),
  );
  const yearMatch = clean.match(/\b(20\d{2}|19\d{2})\b/);
  if (month < 0 || !yearMatch) return null;
  return new Date(Number(yearMatch[1]), month, 1);
}

export function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "")
    .replace(/\s/g, "")
    .replace(/S\/|\$/gi, "")
    .trim();
  const clean = normalizeNumberString(raw);
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function normalizeNumberString(value: string) {
  const hasComma = value.includes(",");
  const hasDot = value.includes(".");
  if (hasComma && hasDot) {
    return value.lastIndexOf(",") > value.lastIndexOf(".")
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, "");
  }
  if (hasComma) {
    const [integer = "", decimal = ""] = value.split(",");
    if (decimal.length > 0 && decimal.length <= 2)
      return `${integer.replace(/\./g, "")}.${decimal}`;
    return value.replace(/,/g, "");
  }
  return value;
}

export function parseCreatedAt(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function normalizeType(value: string): Transaction["type"] | null {
  const upper = value.trim().toUpperCase();
  return TRANSACTION_TYPES.find((type) => type === upper) || null;
}

export function parseTags(value: unknown): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
