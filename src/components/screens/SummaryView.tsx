import { memo, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { calculateSummaries, formatMoney, MONTH_NAMES } from "../../domain/bucksLogic";
import { UI_MONTH_NAMES, UiCopy } from "../../i18n";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName, SummaryRow, Transaction } from "../../types";
import { BarChart } from "../ui/BarChart";
import { Kpi } from "../ui/Kpi";
import { Select } from "../ui/Select";
import { Text } from "../ui/AppText";

export const SummaryView = memo(function SummaryView({ colors, copy, summaries, transactions, freqIncome, availableYears, topInset, currencySymbol }: {
  colors: Palette; copy: UiCopy; summaries: SummaryRow[]; transactions: Transaction[]; freqIncome: Record<string, number>;
  availableYears: number[]; topInset?: number; currencySymbol: string;
}) {
  const initialYear = availableYears[0] || new Date().getFullYear();
  const [filterYear, setFilterYear] = useState(initialYear);
  const computed = useMemo(
    () => (summaries.length ? summaries : calculateSummaries(transactions, freqIncome)),
    [summaries, transactions, freqIncome],
  );

  useEffect(() => {
    if (!availableYears.includes(filterYear)) setFilterYear(availableYears[0] || new Date().getFullYear());
  }, [availableYears, filterYear]);

  const filtered = useMemo(() => computed
    .filter((row) => Number(row.monthYear.split(" ").pop()) === filterYear)
    .sort((a, b) => monthIndex(a) - monthIndex(b)), [computed, filterYear]);
  const chartRows = useMemo(() => {
    const rowsByMonth = new Map(filtered.map((row) => [monthIndex(row), row]));
    return MONTH_NAMES.map((monthName, index) => rowsByMonth.get(index) || emptySummary(`${monthName} ${filterYear}`));
  }, [filtered, filterYear]);
  const totals = useMemo(() => filtered.reduce(
    (acc, row) => ({
      income: acc.income + row.totalIncome,
      expense: acc.expense + Math.abs(row.totalExpense),
      net: acc.net + row.netMonthly,
    }),
    { income: 0, expense: 0, net: 0 },
  ), [filtered]);
  const savings = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : 0;
  const averageExpense = totals.expense / Math.max(1, filtered.length);
  const positiveMonths = filtered.filter((row) => row.netMonthly >= 0).length;
  const bestMonth = filtered.reduce<SummaryRow | null>((best, row) => !best || row.netMonthly > best.netMonthly ? row : best, null);
  const incomeBreakdown = [
    { label: copy.freqIncomeFull, value: filtered.reduce((sum, row) => sum + row.freqIncome, 0), color: colors.green },
    { label: copy.nonFreqIncomeFull, value: filtered.reduce((sum, row) => sum + row.nonFreqIncome, 0), color: colors.blue },
  ];
  const expenseBreakdown = [
    { label: copy.freqExpenseFull, value: filtered.reduce((sum, row) => sum + Math.abs(row.freqExpense), 0), color: colors.red },
    { label: copy.nonFreqExpenseFull, value: filtered.reduce((sum, row) => sum + Math.abs(row.nonFreqExpense), 0), color: colors.yellow },
  ];
  const fm = (value: number) => formatMoney(value, currencySymbol, 0).replace("+ ", "");

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.pageScroll, styles.pageScrollMobile, { gap: 12 }, topInset !== undefined && { paddingTop: topInset }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>{copy.annualOverview}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "500", marginTop: 2 }}>{filtered.length} {copy.monthsAnalyzed}</Text>
        </View>
        <Select
          value={String(filterYear)}
          options={availableYears.map((year) => ({ label: String(year), value: String(year) }))}
          onSelect={(value) => setFilterYear(Number(value))}
          colors={colors}
          title={copy.selectYear}
          style={{ width: 124 }}
        />
      </View>

      <View style={{ backgroundColor: colors.card, borderRadius: 18, padding: 18, overflow: "hidden" }}>
        <View style={{ position: "absolute", width: 150, height: 150, borderRadius: 75, right: -48, top: -68, backgroundColor: colors.primarySoft }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600", textTransform: "uppercase" }}>{copy.annualBalance}</Text>
          <View style={{ backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{filterYear}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={{ color: totals.net >= 0 ? colors.primary : colors.red, fontSize: 34, fontWeight: "700", marginTop: 10, fontVariant: ["tabular-nums"] }}>
          {formatMoney(totals.net, currencySymbol, 0)}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
          <Insight label={copy.bestMonth} value={bestMonth ? monthLabel(bestMonth, copy.languageCode) : "—"} icon="trophy-outline" color={colors.yellow} colors={colors} />
          <Insight label={copy.monthlyAverage} value={fm(averageExpense)} icon="calendar-month-outline" color={colors.blue} colors={colors} />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Kpi title={copy.income} value={fm(totals.income)} icon="trending-up" color={colors.green} colors={colors} />
          <Kpi title={copy.expensesLabel} value={fm(totals.expense)} icon="trending-down" color={colors.red} colors={colors} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Kpi title={copy.savingsRate} value={`${savings}%`} icon="piggy-bank" color={savings >= 0 ? colors.blue : colors.red} colors={colors} />
          <Kpi title={copy.positiveMonths} value={filtered.length ? `${positiveMonths}/${filtered.length}` : "—"} icon="check-circle-outline" color={colors.yellow} colors={colors} />
        </View>
      </View>

      <View style={[styles.chartCard, { backgroundColor: colors.card, alignItems: "stretch", marginBottom: 0 }]}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 3 }]}>{copy.monthlyActivity}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "500" }}>{copy.incomeVsExpenses}</Text>
          </View>
          <View style={{ gap: 5 }}>
            <Legend color={colors.green} label={copy.income} colors={colors} />
            <Legend color={colors.red} label={copy.expensesLabel} colors={colors} />
          </View>
        </View>
        <BarChart rows={chartRows} colors={colors} language={copy.languageCode === "en" ? "en" : "es"} />
      </View>

      <BreakdownCard title={copy.incomeComposition} items={incomeBreakdown} total={totals.income} colors={colors} format={fm} />
      <BreakdownCard title={copy.expenseComposition} items={expenseBreakdown} total={totals.expense} colors={colors} format={fm} />

      <View style={{ backgroundColor: colors.card, borderRadius: 14, overflow: "hidden" }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>{copy.monthlyDetail}</Text>
        </View>
        {filtered.length ? [...filtered].reverse().map((row, index) => (
          <View key={row.monthYear} style={{ minHeight: 74, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 11, borderTopWidth: index === 0 ? 0 : 0.5, borderColor: colors.border }}>
            <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{monthLabel(row, copy.languageCode).slice(0, 3).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{monthLabel(row, copy.languageCode)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Text numberOfLines={1} style={{ color: colors.green, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"], flexShrink: 1 }}>{fm(row.totalIncome)}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>•</Text>
                <Text numberOfLines={1} style={{ color: colors.red, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"], flexShrink: 1 }}>{fm(Math.abs(row.totalExpense))}</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text numberOfLines={1} style={{ color: row.netMonthly >= 0 ? colors.green : colors.red, fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{formatMoney(row.netMonthly, currencySymbol, 0)}</Text>
              <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "500", marginTop: 3 }}>{row.totalIncome > 0 ? Math.round((row.netMonthly / row.totalIncome) * 100) : 0}%</Text>
            </View>
          </View>
        )) : (
          <Text style={{ color: colors.muted, padding: 18, textAlign: "center", fontWeight: "500" }}>{copy.noAnalysisData}</Text>
        )}
      </View>
    </ScrollView>
  );
});

function Insight({ label, value, icon, color, colors }: { label: string; value: string; icon: MaterialIconName; color: string; colors: Palette }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.input, borderRadius: 13, padding: 12 }}>
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, fontWeight: "600", textTransform: "uppercase", marginTop: 8 }}>{label}</Text>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 3, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function Legend({ color, label, colors }: { color: string; label: string; colors: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function BreakdownCard({ title, items, total, colors, format }: {
  title: string;
  items: { label: string; value: number; color: string }[];
  total: number;
  colors: Palette;
  format: (value: number) => string;
}) {
  const safeTotal = total || 1;
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 15, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{format(total)}</Text>
      </View>
      <View style={{ height: 9, borderRadius: 999, overflow: "hidden", backgroundColor: colors.input, flexDirection: "row" }}>
        {items.map((item) => item.value > 0 && <View key={item.label} style={{ flex: item.value / safeTotal, backgroundColor: item.color }} />)}
      </View>
      <View style={{ gap: 8 }}>
        {items.map((item) => (
          <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: item.color }} />
            <Text numberOfLines={1} style={{ flex: 1, color: colors.muted, fontSize: 13, fontWeight: "500" }}>{item.label}</Text>
            <Text style={{ color: item.color, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{format(item.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function monthIndex(row: SummaryRow) {
  const name = row.monthYear.split(" ")[0];
  return Math.max(0, MONTH_NAMES.findIndex((month) => month.toLowerCase() === name.toLowerCase()));
}

function monthLabel(row: SummaryRow, language: string) {
  return UI_MONTH_NAMES[language === "en" ? "en" : "es"][monthIndex(row)];
}

function emptySummary(monthYear: string): SummaryRow {
  return { monthYear, freqIncome: 0, nonFreqIncome: 0, totalIncome: 0, freqExpense: 0, nonFreqExpense: 0, totalExpense: 0, netMonthly: 0, netNoFreq: 0 };
}
