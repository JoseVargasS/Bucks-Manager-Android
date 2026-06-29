import type { ComponentProps } from "react";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof requires value import
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export type TransactionType =
  | "INGRESO FRECUENTE"
  | "INGRESO NO FRECUENTE"
  | "GASTO FRECUENTE"
  | "GASTO NO FRECUENTE";

export type Transaction = {
  rowId: number;
  date: string;
  rawDate: string;
  rawDateMs?: number;
  createdAtMs?: number;
  amount: number;
  formula?: string;
  detail: string;
  type: TransactionType;
  createdAt?: string;
  tags?: string[];
};

export type TransactionDraft = {
  date: string;
  amount: string;
  detail: string;
  type: TransactionType;
  createdAt?: string;
  tags?: string[];
};

export type Tag = {
  id: string;
  label: string;
  color: string;
};

export type SummaryRow = {
  monthYear: string;
  freqIncome: number;
  nonFreqIncome: number;
  totalIncome: number;
  freqExpense: number;
  nonFreqExpense: number;
  totalExpense: number;
  netMonthly: number;
  netNoFreq: number;
};

export type SearchFilters = {
  text: string;
  tag: string;
  minAmount: string;
  maxAmount: string;
  startDate: string;
  endDate: string;
};

export type SheetCandidate = {
  id: string;
  name: string;
  modifiedTime?: string;
};

export type ExportFormat = "xlsx" | "pdf";
export type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export type HistoryEntry = {
  id: string;
  timestamp: string;
  action: "delete";
  transaction: Transaction;
};

export type Tab = "dashboard" | "expenses" | "summary" | "settings";
export type ThemeMode = "dark" | "light";
export type LanguageMode = "es" | "en";
export type FontPreference =
  | "dmsans"
  | "serif"
  | "mono"
  | "condensed"
  | "light"
  | "casual"
  | "cursive"
  | "smallcaps"
  | "inter"
  | "fredoka"
  | "jetbrainsmono"
  | "spacemono"
  | "orbitron"
  | "playfair"
  | "bebasneue"
  | "comicneue"
  | "sora"
  | "patrickhand"
  | "plusjakartasans"
  | "intervariable"
  | "comicsansms"
  | "proggysquare"
  | "redstarbold"
  | "sansi"
  | "sfscribbledsans";
