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
};

export type TransactionDraft = {
  date: string;
  amount: string;
  detail: string;
  type: TransactionType;
  createdAt?: string;
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
export type ExportRangeMode = "dates" | "months";
