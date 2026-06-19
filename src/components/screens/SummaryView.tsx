import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { calculateSummaries, formatMoney } from "../../domain/bucksLogic";
import { styles } from "../../styles/globalStyles";
import { Kpi } from "../ui/Kpi";
import { PieCard } from "../ui/PieCard";
import { BarChart } from "../ui/BarChart";
import { Select } from "../ui/Select";
import { Palette } from "../../theme/colors";
import { SummaryRow, Transaction } from "../../types";
import { UiCopy } from "../../i18n";

export function SummaryView({ colors, copy, summaries, transactions, freqIncome, availableYears, topInset, currencySymbol }: {
  colors: Palette; copy: UiCopy; summaries: SummaryRow[]; transactions: Transaction[]; freqIncome: Record<string, number>;
  availableYears: number[]; topInset?: number; currencySymbol: string;
}) {
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const computed = summaries.length ? summaries : calculateSummaries(transactions, freqIncome);
  const filtered = filterYear ? computed.filter((r) => r.monthYear.endsWith(String(filterYear))) : computed;
  const totals = filtered.reduce(
    (acc, row) => ({
      income: acc.income + row.totalIncome,
      expense: acc.expense + Math.abs(row.totalExpense),
      net: acc.net + row.netMonthly,
    }),
    { income: 0, expense: 0, net: 0 },
  );
  const savings = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : 0;
  const netNoFreq = filtered.reduce((acc, row) => acc + row.netNoFreq, 0);
  const fm = (value: number) => formatMoney(value, currencySymbol, 0).replace("+ ", "");
  const incomeTypes = [
    { label: copy.freqIncome, value: computed.reduce((a, r) => a + r.freqIncome, 0), color: colors.green },
    { label: copy.nonFreqIncome, value: computed.reduce((a, r) => a + r.nonFreqIncome, 0), color: colors.blue },
  ];
  const expenseTypes = [
    { label: copy.freqExpense, value: computed.reduce((a, r) => a + Math.abs(r.freqExpense), 0), color: colors.red },
    { label: copy.nonFreqExpense, value: computed.reduce((a, r) => a + Math.abs(r.nonFreqExpense), 0), color: colors.yellow },
  ];
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, styles.pageScrollMobile, topInset !== undefined && { paddingTop: topInset }]}>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
        <Select
          value={filterYear ? String(filterYear) : ""}
          options={[{ label: copy.allYears, value: "" }, ...availableYears.map((y) => ({ label: String(y), value: String(y) }))]}
          onSelect={(v: string) => { setFilterYear(v ? Number(v) : null); }}
          colors={colors}
          placeholder={copy.selectYear}
          style={{ flex: 1 }}
        />
      </View>
      <View style={[styles.kpiGridMobile, { gap: 8, marginBottom: 12 }]}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Kpi title={copy.income} value={fm(totals.income)} icon="trending-up" color={colors.green} colors={colors} />
          <Kpi title={copy.expensesLabel} value={fm(totals.expense)} icon="trending-down" color={colors.red} colors={colors} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Kpi title={copy.netBalance} value={formatMoney(totals.net, currencySymbol, 0)} icon="wallet" color={totals.net >= 0 ? colors.blue : colors.red} colors={colors} />
          <Kpi title={copy.savingsRate} value={`${savings}%`} icon="piggy-bank" color={colors.blue} colors={colors} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Kpi title={copy.noFreqIncomeNet} value={formatMoney(netNoFreq, currencySymbol, 0)} icon="cash-remove" color={colors.yellow} colors={colors} />
        </View>
      </View>
      <View style={[styles.chartCard, { backgroundColor: colors.card, alignItems: "stretch" }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{copy.monthlyEvolution}</Text>
        <BarChart rows={filtered} colors={colors} />
      </View>
      <View style={[styles.chartRow, styles.chartRowMobile]}>
        <PieCard title={copy.income} values={incomeTypes.map((t) => t.value)} colors={colors} labels={incomeTypes.map((t) => t.label)} tints={incomeTypes.map((t) => t.color)} currencySymbol={currencySymbol} />
        <PieCard title={copy.expensesLabel} values={expenseTypes.map((t) => t.value)} colors={colors} labels={expenseTypes.map((t) => t.label)} tints={expenseTypes.map((t) => t.color)} currencySymbol={currencySymbol} danger />
      </View>
      <View style={[styles.tableCard, styles.summaryTableMobile, { backgroundColor: colors.card }]}>
        <View style={[styles.gasTableHeader, { backgroundColor: colors.input }]}>
          <Text style={[styles.gasTableHeadCell, { color: colors.muted, flex: 1.35 }]}>MES</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.green }]}>ING.</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.red }]}>{copy.expensesLabel.toUpperCase().slice(0, 5)}</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.blue }]}>NETO</Text>
          <Text style={[styles.gasTableHeadCell, { color: colors.muted }]}>{copy.savingsRate.toUpperCase().slice(0, 6)}</Text>
        </View>
        {filtered.map((row) => {
          const rowSavings = row.totalIncome > 0 ? Math.round((row.netMonthly / row.totalIncome) * 100) : 0;
          const [monthName, rowYear] = row.monthYear.split(" ");
          const monthLabel = `${monthName.slice(0, 3).toUpperCase()} ${rowYear?.slice(-2) || ""}`.trim();
          return (
            <View key={row.monthYear} style={[styles.gasTableRow, { borderColor: colors.border }]}>
              <Text numberOfLines={1} style={[styles.gasTableCell, { color: colors.text, flex: 1.35, fontWeight: "600" }]}>{monthLabel}</Text>
              <Text numberOfLines={1} style={[styles.gasTableCell, { color: colors.green }]}>{fm(row.totalIncome)}</Text>
              <Text numberOfLines={1} style={[styles.gasTableCell, { color: colors.red }]}>{fm(row.totalExpense)}</Text>
              <Text numberOfLines={1} style={[styles.gasTableCell, { color: row.netMonthly >= 0 ? colors.green : colors.red, fontWeight: "700" }]}>{formatMoney(row.netMonthly, currencySymbol, 0)}</Text>
              <Text numberOfLines={1} style={[styles.gasTableCell, { color: rowSavings >= 0 ? colors.blue : colors.red }]}>{rowSavings}%</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
