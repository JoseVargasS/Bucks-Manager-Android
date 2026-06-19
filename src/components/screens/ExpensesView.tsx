import { useState, useMemo, useRef } from "react";
import { Dimensions, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatMoney } from "../../domain/bucksLogic";
import { formatCreatedTime, typeColor, typeFill, typeLabelFull } from "../../utils/formats";
import { abbreviateTag, tagTextColor } from "../../utils/tags";
import { groupTransactionsByDate } from "../../utils/transactions";
import { styles } from "../../styles/globalStyles";
import { StatCard } from "../ui/StatCard";
import { HighlightedText } from "../ui/HighlightedText";
import { Palette } from "../../theme/colors";
import { SummaryRow, Tag, Transaction, MaterialIconName } from "../../types";
import { UiCopy } from "../../i18n";

export function ExpensesView({
  colors,
  summary,
  transactions,
  searchActive,
  searchText,
  selectedRows,
  currencySymbol,
  copy,
  onEditFreq,
  onExitSearch,
  onOpenDetail,
  onEdit,
  onDeleteSelected,
  onMove,
  onToggleSelection,
  onLoadOlder,
  topInset,
  tagsList,
}: {
  colors: Palette;
  summary: SummaryRow;
  transactions: Transaction[];
  searchActive: boolean;
  searchText: string;
  selectedRows: number[];
  currencySymbol: string;
  copy: UiCopy;
  onEditFreq: () => void;
  onExitSearch: () => void;
  onOpenDetail: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onDeleteSelected: () => void;
  onMove: (tx: Transaction) => void;
  onToggleSelection: (tx: Transaction) => void;
  onLoadOlder: () => void;
  topInset?: number;
  tagsList: Tag[];
}) {
  const groups = groupTransactionsByDate(transactions, copy);
  const selectedCount = selectedRows.length;
  const selectedTx = transactions.find((tx) => tx.rowId === selectedRows[0]);
  const [tagBubble, setTagBubble] = useState<{ x: number; y: number; tags: string[] } | null>(null);
  const tagButtonRefs = useRef<Record<number, { measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void } | null>>({});
  const tagColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    tagsList.forEach((t) => { map[t.label] = t.color; });
    return map;
  }, [tagsList]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, topInset !== undefined && { paddingTop: topInset }]}>
      <View style={[styles.statsGrid, styles.statsGridMobile]}>
        <StatCard title={copy.freqIncome} value={formatMoney(summary.freqIncome, currencySymbol)} tone="income" icon="cash" colors={colors} action={onEditFreq} />
        <StatCard title={copy.nonFreqIncome} value={formatMoney(summary.nonFreqIncome, currencySymbol)} tone="income" icon="trending-up" colors={colors} />
        <StatCard title={copy.freqExpense} value={formatMoney(summary.freqExpense, currencySymbol)} tone="expense" icon="credit-card" colors={colors} />
        <StatCard title={copy.nonFreqExpense} value={formatMoney(summary.nonFreqExpense, currencySymbol)} tone="expense" icon="trending-down" colors={colors} />
        <StatCard title={copy.totalExpense} value={formatMoney(summary.totalExpense, currencySymbol)} tone="warn" icon="basket" colors={colors} />
        <StatCard title={copy.balance} value={formatMoney(summary.netMonthly, currencySymbol)} tone="balance" icon="wallet" colors={colors} />
      </View>

      {searchActive && (
        <View style={[styles.searchBanner, styles.searchBannerMobile, { backgroundColor: colors.infoSoft, borderColor: colors.blue }]}>
          <Text style={{ color: colors.blue, fontWeight: "600" }}>{copy.searchResults}</Text>
          <TouchableOpacity onPress={onExitSearch}>
            <Text style={{ color: colors.blue, fontWeight: "700" }}>{copy.exit}</Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedCount > 0 && (
        <View style={[styles.selectionBar, { backgroundColor: colors.card }]}>
          <Text style={[styles.selectionText, { color: colors.text }]}>{selectedCount === 1 ? copy.selectedOne : `${selectedCount} ${copy.selectedMany}`}</Text>
          <View style={styles.selectionActions}>
            {selectedCount === 1 && selectedTx && (
              <TouchableOpacity style={[styles.selectionBtn, { backgroundColor: colors.editBg, borderColor: colors.editBorder }]} onPress={() => onEdit(selectedTx)}>
                <MaterialCommunityIcons name="pencil" size={18} color={colors.blue} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.selectionBtn, { backgroundColor: colors.expenseSoft, borderColor: colors.red }]} onPress={onDeleteSelected}>
              <MaterialCommunityIcons name="trash-can" size={18} color={colors.red} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.groupedList}>
        <Text style={{ paddingHorizontal: 4, marginBottom: -6, fontSize: 16, fontWeight: "700", color: colors.text }}>{copy.movementsTitle}</Text>
        {groups.map((group) => (
          <View key={group.key} style={styles.dateGroup}>
            <Text style={[styles.dateGroupLabel, { color: colors.muted }]}>{group.label}</Text>
            <View style={[styles.txGroupCard, { backgroundColor: colors.card }]}>
              {group.items.map((tx, index) => {
                const selected = selectedRows.includes(tx.rowId);
                const icon = tx.amount >= 0 ? "bank-transfer-in" : tx.type === "GASTO FRECUENTE" ? "credit-card-outline" : "basket-outline";
                const isFreqExpense = tx.type === "GASTO FRECUENTE";
                const showPill = tx.type !== "GASTO NO FRECUENTE";
                return (
                  <TouchableOpacity
                    key={`${tx.rowId}-${tx.createdAt}`}
                    onPress={() => onOpenDetail(tx)}
                    onLongPress={() => (selected ? onMove(tx) : onToggleSelection(tx))}
                    style={[
                      styles.groupedTxRow,
                      index > 0 && { borderTopWidth: 0.5, borderColor: colors.border },
                      isFreqExpense && { backgroundColor: colors.freqExpenseRow },
                      selected && { backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <View style={[styles.txIcon, { backgroundColor: selected ? colors.infoSoft : typeFill(tx.type, colors) }]}>
                      <MaterialCommunityIcons name={selected ? "check" : (icon as MaterialIconName)} size={18} color={selected ? colors.blue : typeColor(tx.type, colors)} />
                    </View>
                    <View style={styles.groupedTxMain}>
                      <HighlightedText
                        text={tx.detail}
                        query={searchActive ? searchText : ""}
                        style={[styles.groupedTxTitle, { color: colors.text }]}
                        highlightStyle={{ color: colors.onPrimary, backgroundColor: colors.primary, borderRadius: 4 }}
                      />
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                        {showPill && (
                          <View style={{
                            paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5,
                            backgroundColor: typeFill(tx.type, colors),
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: typeColor(tx.type, colors) }}>
                              {typeLabelFull(tx.type, copy)}
                            </Text>
                          </View>
                        )}
                        <Text style={[styles.groupedTxMeta, { color: colors.muted }]}>
                          {formatCreatedTime(tx.createdAt).slice(0, 5)}
                        </Text>
                        {tx.tags && tx.tags.length > 0 && (
                          <>
                            {tx.tags.slice(0, 2).map((tag) => {
                              const tc = tagColorMap[tag] || colors.muted;
                              const textColor = tagTextColor(tc);
                              return (
                                <View key={tag} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: tc }}>
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: textColor }}>{abbreviateTag(tag)}</Text>
                                </View>
                              );
                            })}
                            {tx.tags.length > 2 && (
                              <TouchableOpacity
                                ref={(ref) => { tagButtonRefs.current[tx.rowId] = ref; }}
                                onPress={() => {
                                  tagButtonRefs.current[tx.rowId]?.measureInWindow?.((x, y, width) => {
                                    const screen = Dimensions.get("window");
                                    setTagBubble({ x: Math.min(x, screen.width - 176), y: Math.min(y, screen.height - 190), tags: (tx.tags || []).slice(2) });
                                  });
                                }}
                                style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: colors.primary }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.onPrimary }}>+{tx.tags.length - 2}</Text>
                              </TouchableOpacity>
                            )}
                          </>
                        )}
                      </View>
                    </View>
                    <Text numberOfLines={1} style={[styles.groupedTxAmount, { color: tx.amount >= 0 ? colors.green : colors.red }]}>{formatMoney(tx.amount, currencySymbol)}</Text>
                    {selected && <MaterialCommunityIcons name="drag-vertical" size={18} color={colors.muted} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        {!transactions.length && (
          <View style={[styles.mobileEmptyCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.empty, { color: colors.muted }]}>{copy.noMovements}</Text>
          </View>
        )}
        {!searchActive && (
          <TouchableOpacity style={[styles.loadOlderBtn, { backgroundColor: colors.card }]} onPress={onLoadOlder}>
            <Text style={[styles.loadOlderText, { color: colors.text }]}>{copy.loadOlder}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Modal visible={!!tagBubble} transparent animationType="none" onRequestClose={() => setTagBubble(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setTagBubble(null)} style={{ flex: 1 }}>
          <View onStartShouldSetResponder={() => true} style={{ position: "absolute", left: tagBubble?.x || 0, top: tagBubble?.y || 0, maxWidth: 170, borderRadius: 12, padding: 8, backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 12, elevation: 8 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {(tagBubble?.tags || []).map((tag) => {
                const tc = tagColorMap[tag] || colors.muted;
                const textColor = tagTextColor(tc);
                return (
                  <View key={tag} style={{ maxWidth: "100%", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: tc }}>
                    <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "700", color: textColor }}>{tag}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}
