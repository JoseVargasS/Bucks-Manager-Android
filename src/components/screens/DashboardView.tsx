import { memo, useMemo, useCallback } from "react";
import { Pressable, ScrollView, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { formatMoney, MONTH_NAMES, calculateMonthSummary } from "@/domain/bucksLogic";
import { base } from "@/styles/baseStyles";
import { dashboardStyles } from "@/components/screens/DashboardView.styles";
import { expensesStyles } from "@/components/screens/ExpensesView.styles";

const styles = { ...base, ...dashboardStyles, ...expensesStyles };
import { type Palette } from "@/theme/colors";
import { type MaterialIconName, type SummaryRow, type Tag, type Transaction } from "@/types";
import { type UiCopy } from "@/i18n";
import { labelForTagId, tagTextColor } from "@/utils/tags";
import { StatCard } from "@/components/ui/StatCard";
import { PieChart, type PieSlice } from "@/components/ui/PieChart";
import { Text } from "@/components/ui/AppText";

function currentMonthKey(): string {
  const now = new Date();
  return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
}

function isCurrentMonth(tx: Transaction): boolean {
  const d = tx.rawDateMs != null ? new Date(tx.rawDateMs) : new Date(tx.rawDate);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` === currentMonthKey();
}

function typeIcon(tx: Transaction): MaterialIconName {
  if (tx.amount >= 0) return "bank-transfer-in";
  return tx.type === "GASTO FRECUENTE" ? "credit-card-outline" : "basket-outline";
}

function typeIconColor(tx: Transaction, colors: Palette): string {
  return tx.amount >= 0 ? colors.green : colors.red;
}

function typeIconBg(tx: Transaction, colors: Palette): string {
  return tx.amount >= 0 ? colors.incomeSoft : colors.expenseSoft;
}

export const DashboardView = memo(function DashboardView({
  colors,
  copy,
  currencySymbol,
  allTransactions,
  tagsList,
  onOpenDetail,
  topInset,
}: {
  colors: Palette;
  copy: UiCopy;
  currencySymbol: string;
  allTransactions: Transaction[];
  tagsList: Tag[];
  onOpenDetail: (tx: Transaction) => void;
  topInset?: number;
}) {
  const tagColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    tagsList.forEach((t) => { map[t.id] = t.color; });
    return map;
  }, [tagsList]);

  const monthKey = currentMonthKey();
  const monthTransactions = useMemo(
    () => allTransactions.filter(isCurrentMonth),
    [allTransactions],
  );

  const summary = useMemo<SummaryRow>(
    () => {
      const emptyFreq: Record<string, number> = {};
      return calculateMonthSummary(monthTransactions, emptyFreq, monthKey);
    },
    [monthTransactions, monthKey],
  );

  const pieData = useMemo<PieSlice[]>(() => {
    const expenseTransactions = monthTransactions.filter(
      (tx) => tx.amount < 0 && tx.type.startsWith("GASTO"),
    );
    const tagTotals: Record<string, number> = {};
    let untaggedTotal = 0;
    let totalExpense = 0;
    expenseTransactions.forEach((tx) => {
      const absVal = Math.abs(tx.amount);
      totalExpense += absVal;
      if (tx.tags && tx.tags.length > 0) {
        tx.tags.forEach((tagId) => {
          tagTotals[tagId] = (tagTotals[tagId] || 0) + absVal / (tx.tags!.length);
        });
      } else {
        untaggedTotal += absVal;
      }
    });
    if (totalExpense === 0) return [];

    const slices: { label: string; value: number; color: string }[] = [];
    const tagEntries = Object.entries(tagTotals).sort(([, a], [, b]) => b - a);
    const colorUsed = new Map<string, number>();
    tagEntries.forEach(([id, val]) => {
      const baseColor = tagColorMap[id] || colors.muted;
      const used = colorUsed.get(baseColor) || 0;
      slices.push({
        label: labelForTagId(id, tagsList),
        value: val,
        color: shiftColor(baseColor, used * 12),
      });
      colorUsed.set(baseColor, (colorUsed.get(baseColor) || 0) + 1);
    });
    if (untaggedTotal > 0) {
      slices.push({ label: copy.otherLabel, value: untaggedTotal, color: colors.muted });
    }
    slices.sort((a, b) => b.value - a.value);
    const grandTotal = slices.reduce((s, sl) => s + sl.value, 0) || 1;
    return slices.map((s) => ({
      ...s,
      percentage: (s.value / grandTotal) * 100,
    }));
  }, [monthTransactions, tagColorMap, tagsList, colors, copy.otherLabel]);

  const recentTransactions = useMemo(
    () =>
      [...allTransactions]
        .sort(
          (a, b) =>
            (b.rawDateMs ?? Date.parse(b.rawDate)) -
            (a.rawDateMs ?? Date.parse(a.rawDate)) ||
            (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0),
        )
        .slice(0, 7),
    [allTransactions],
  );

  const handleDetail = useCallback(
    (tx: Transaction) => onOpenDetail(tx),
    [onOpenDetail],
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.pageScroll,
        styles.pageScrollMobile,
        { gap: 16 },
        topInset !== undefined && { paddingTop: topInset },
      ]}
    >
      <View>
        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 10,
          }}
        >
          {copy.dashboardSubtitle}
        </Text>
        <View style={[styles.statsGrid, styles.statsGridMobile, { paddingHorizontal: 0 }]}>
          <StatCard
            title={copy.freqIncome}
            value={formatMoney(summary.freqIncome, currencySymbol)}
            tone="income"
            icon="cash"
            colors={colors}
          />
          <StatCard
            title={copy.nonFreqIncome}
            value={formatMoney(summary.nonFreqIncome, currencySymbol)}
            tone="income"
            icon="trending-up"
            colors={colors}
          />
          <StatCard
            title={copy.freqExpense}
            value={formatMoney(summary.freqExpense, currencySymbol)}
            tone="expense"
            icon="credit-card"
            colors={colors}
          />
          <StatCard
            title={copy.nonFreqExpense}
            value={formatMoney(summary.nonFreqExpense, currencySymbol)}
            tone="expense"
            icon="trending-down"
            colors={colors}
          />
          <StatCard
            title={copy.totalExpense}
            value={formatMoney(summary.totalExpense, currencySymbol)}
            tone="warn"
            icon="basket"
            colors={colors}
          />
          <StatCard
            title={copy.balance}
            value={formatMoney(summary.netMonthly, currencySymbol)}
            tone="balance"
            icon="wallet"
            colors={colors}
          />
        </View>
      </View>

      {tagsList.length > 0 && pieData.length > 0 && (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 14,
            padding: 15,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 16,
              fontWeight: "700",
              marginBottom: 14,
            }}
          >
            {copy.expenseByTags}
          </Text>
          <PieChart
            data={pieData}
            colors={colors}
            currencySymbol={currencySymbol}
            formatValue={(v) => formatMoney(v, currencySymbol, 0).replace(/^\+ /, "")}
            totalLabel={copy.total}
          />
        </View>
      )}

      <View>
        <Text
          style={{
            color: colors.text,
            fontSize: 16,
            fontWeight: "700",
            marginBottom: 10,
          }}
        >
          {copy.recentMovements}
        </Text>
        {recentTransactions.length > 0 ? (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 14,
            }}
          >
            {recentTransactions.map((tx, index) => (
              <Pressable
                key={`${tx.rowId}-${tx.rawDate}-${tx.createdAtMs ?? tx.createdAt ?? ""}`}
                onPress={() => handleDetail(tx)}
                style={[
                  styles.groupedTxRow,
                  {
                    backgroundColor: colors.card,
                  },
                  index > 0 && {
                    borderTopWidth: 0.5,
                    borderColor: colors.border,
                  },
                  index === 0 && styles.sectionCardFirstRow,
                  index === recentTransactions.length - 1 &&
                    styles.sectionCardLastRow,
                  tx.type === "GASTO FRECUENTE" && {
                    backgroundColor: colors.freqExpenseRow,
                  },
                ]}
              >
                <View
                  style={[
                    styles.txIcon,
                    { backgroundColor: typeIconBg(tx, colors) },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={typeIcon(tx)}
                    size={18}
                    color={typeIconColor(tx, colors)}
                  />
                </View>
                <View style={styles.groupedTxMain}>
                  <Text
                    numberOfLines={1}
                    style={[styles.groupedTxTitle, { color: colors.text }]}
                  >
                    {tx.detail}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {parseInt(tx.rawDate.slice(8, 10), 10)}-{MONTH_NAMES[parseInt(tx.rawDate.slice(5, 7), 10) - 1].slice(0, 3).toLowerCase()}
                    </Text>
                    {tx.tags?.map((tagId) => {
                      const tc = tagColorMap[tagId] || colors.muted;
                      return (
                        <View
                          key={tagId}
                          style={{
                            backgroundColor: tc,
                            borderRadius: 4,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                          }}
                        >
                          <Text style={{ fontSize: 9, fontWeight: "600", color: tagTextColor(tc, colors) }}>
                            {labelForTagId(tagId, tagsList)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.groupedTxAmount,
                    {
                      color: tx.amount >= 0 ? colors.green : colors.red,
                    },
                  ]}
                >
                  {formatMoney(tx.amount, currencySymbol)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View
            style={[
              styles.mobileEmptyCard,
              {
                backgroundColor: colors.card,
                alignItems: "center",
                padding: 24,
              },
            ]}
          >
            <Text style={[styles.empty, { color: colors.muted }]}>
              {copy.noMovements}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
});

function shiftColor(hex: string, amount: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const num = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (num & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
