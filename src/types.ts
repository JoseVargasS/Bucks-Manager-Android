import React from "react";

export type TransactionType =
  | "INGRESO FRECUENTE"
  | "INGRESO NO FRECUENTE"
  | "GASTO FRECUENTE"
  | "GASTO NO FRECUENTE";

export type Transaction = {
  rowId: number;
  date: string;
  rawDate: string;
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
export type MaterialIconName = React.ComponentProps<typeof import("@expo/vector-icons/MaterialCommunityIcons").default>["name"];

type HistoryAction = "create" | "edit" | "delete";

export type Tab = "expenses" | "summary" | "settings";
export type ThemeMode = "dark" | "light";
export type LanguageMode = "es" | "en";
export type FontPreference = "dmsans" | "serif" | "mono" | "condensed" | "light" | "casual" | "cursive" | "smallcaps";

export interface HistoryEntry {
  id: string;
  timestamp: string;
  action: HistoryAction;
  transaction: Transaction;
  previousTransaction?: Transaction;
}
