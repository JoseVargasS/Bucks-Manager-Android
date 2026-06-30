import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { formatMoney } from "@/domain/bucksLogic";
import {
  formatCreatedTime,
  typeColor,
  typeFill,
  typeLabelFull,
} from "@/utils/formats";
import { abbreviateTag, tagTextColor } from "@/utils/tags";
import { groupTransactionsByDate } from "@/utils/transactions";
import { withAlpha } from "@/utils/helpers";
import { base } from "@/styles/baseStyles";
import { expensesStyles } from "@/components/screens/ExpensesView.styles";

const styles = { ...base, ...expensesStyles };
import { PeriodControls } from "@/components/layout/PeriodControls";
import { HighlightedText } from "@/components/ui/HighlightedText";
import { dark, type Palette } from "@/theme/colors";
import { type Tag, type Transaction, type MaterialIconName } from "@/types";
import { type UiCopy } from "@/i18n";
import { useModalTransition } from "@/components/ui/useModalTransition";
import { Text } from "@/components/ui/AppText";

type TransactionSection = {
  key: string;
  title: string;
  data: Transaction[];
};

type TagBubble = { x: number; y: number; tags: string[] };

type TagButtonRef = {
  measureInWindow?: (
    cb: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

type TransactionRowProps = {
  tx: Transaction;
  index: number;
  sectionLength: number;
  selected: boolean;
  colors: Palette;
  currencySymbol: string;
  copy: UiCopy;
  searchActive: boolean;
  searchText: string;
  tagColorMap: Record<string, string>;
  tagLabelMap: Record<string, string>;
  onOpenDetail: (tx: Transaction) => void;
  onMove: (tx: Transaction) => void;
  onToggleSelection: (tx: Transaction) => void;
  setTagBubble: (bubble: TagBubble | null) => void;
  tagButtonRefs: { current: Record<number, TagButtonRef | null> };
};

const TransactionRow = memo(function TransactionRow({
  tx,
  index,
  sectionLength,
  selected,
  colors,
  currencySymbol,
  copy,
  searchActive,
  searchText,
  tagColorMap,
  tagLabelMap,
  onOpenDetail,
  onMove,
  onToggleSelection,
  setTagBubble,
  tagButtonRefs,
}: TransactionRowProps) {
  const icon =
    tx.amount >= 0
      ? "bank-transfer-in"
      : tx.type === "GASTO FRECUENTE"
        ? "credit-card-outline"
        : "basket-outline";
  const isFreqExpense = tx.type === "GASTO FRECUENTE";
  const showPill = tx.type !== "GASTO NO FRECUENTE";
  const tags = (tx.tags || []).filter((t) => tagColorMap[t] || tagLabelMap[t]);
  const visibleTags = tags.slice(0, 2);
  const hiddenTagCount = Math.max(0, tags.length - visibleTags.length);

  const handlePress = useCallback(() => onOpenDetail(tx), [onOpenDetail, tx]);
  const handleLongPress = useCallback(
    () => (selected ? onMove(tx) : onToggleSelection(tx)),
    [onMove, onToggleSelection, selected, tx],
  );
  const handleTagRef = useCallback(
    (ref: TagButtonRef | null) => {
      if (ref) tagButtonRefs.current[tx.rowId] = ref;
      else delete tagButtonRefs.current[tx.rowId];
    },
    [tagButtonRefs, tx.rowId],
  );
  const handleHiddenTagsPress = useCallback(() => {
    const allTags = (tx.tags || []).filter((t) => tagColorMap[t] || tagLabelMap[t]);
    const hiddenTags = allTags.slice(2);
    if (!hiddenTags.length) return;
    tagButtonRefs.current[tx.rowId]?.measureInWindow?.((x, y) => {
      const screen = Dimensions.get("window");
      setTagBubble({
        x: Math.min(x, screen.width - 176),
        y: Math.min(y, screen.height - 190),
        tags: hiddenTags,
      });
    });
  }, [setTagBubble, tagButtonRefs, tagColorMap, tagLabelMap, tx.rowId, tx.tags]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={[
        styles.groupedTxRow,
        styles.sectionCardRow,
        { backgroundColor: colors.card },
        index > 0 && { borderTopWidth: 0.5, borderColor: colors.border },
        index === 0 && styles.sectionCardFirstRow,
        index === sectionLength - 1 && styles.sectionCardLastRow,
        isFreqExpense && { backgroundColor: colors.freqExpenseRow },
        selected && { backgroundColor: colors.primarySoft },
      ]}
    >
      <View
        style={[
          styles.txIcon,
          {
            backgroundColor: selected
              ? colors.infoSoft
              : typeFill(tx.type, colors),
          },
        ]}
      >
        <MaterialCommunityIcons
          name={selected ? "check" : (icon as MaterialIconName)}
          size={18}
          color={selected ? colors.blue : typeColor(tx.type, colors)}
        />
      </View>
      <View style={styles.groupedTxMain}>
        <HighlightedText
          text={tx.detail}
          query={searchActive ? searchText : ""}
          style={[styles.groupedTxTitle, { color: colors.text }]}
          highlightStyle={{
            color: colors.onPrimary,
            backgroundColor: colors.primary,
            borderRadius: 4,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 3,
          }}
        >
          {showPill && (
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 5,
                backgroundColor: typeFill(tx.type, colors),
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: typeColor(tx.type, colors),
                }}
              >
                {typeLabelFull(tx.type, copy)}
              </Text>
            </View>
          )}
          <Text style={[styles.groupedTxMeta, { color: colors.muted }]}>
            {formatCreatedTime(tx.createdAt).slice(0, 5)}
          </Text>
          {visibleTags.map((tag) => {
            const tagColor = tagColorMap[tag] || colors.muted;
            const tagLabel = tagLabelMap[tag] || tag;
            return (
              <View
                key={tag}
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 5,
                  backgroundColor: tagColor,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: tagTextColor(tagColor, colors),
                  }}
                >
                  {abbreviateTag(tagLabel)}
                </Text>
              </View>
            );
          })}
          {hiddenTagCount > 0 && (
            <TouchableOpacity
              ref={handleTagRef}
              onPress={handleHiddenTagsPress}
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 5,
                backgroundColor: colors.primary,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: colors.onPrimary,
                }}
              >
                +{hiddenTagCount}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.groupedTxAmount,
          { color: tx.amount >= 0 ? colors.green : colors.red },
        ]}
      >
        {formatMoney(tx.amount, currencySymbol)}
      </Text>
      {selected && (
        <MaterialCommunityIcons
          name="drag-vertical"
          size={18}
          color={colors.muted}
        />
      )}
    </Pressable>
  );
});

export const ExpensesView = memo(function ExpensesView({
  colors,
  transactions,
  searchActive,
  searchText,
  selectedRows,
  currencySymbol,
  copy,
  onExitSearch,
  onOpenDetail,
  onEdit,
  onDeleteSelected,
  onMove,
  onToggleSelection,
  onLoadOlder,
  topInset,
  tagsList,
  month,
  year,
  availableYears,
  availableMonths,
  onSelectPeriod,
  goToday,
  goPrevMonth,
  goNextMonth,
}: {
  colors: Palette;
  transactions: Transaction[];
  searchActive: boolean;
  searchText: string;
  selectedRows: number[];
  currencySymbol: string;
  copy: UiCopy;
  onExitSearch: () => void;
  onOpenDetail: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onDeleteSelected: () => void;
  onMove: (tx: Transaction) => void;
  onToggleSelection: (tx: Transaction) => void;
  onLoadOlder: () => void;
  topInset?: number;
  tagsList: Tag[];
  month: number;
  year: number;
  availableYears: number[];
  availableMonths: number[];
  onSelectPeriod: (month: number, year: number) => void;
  goToday: () => void;
  goPrevMonth: () => void;
  goNextMonth: () => void;
}) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [scrolled, setScrolled] = useState(false);
  const groups = useMemo(
    () => groupTransactionsByDate(transactions, copy),
    [transactions, copy],
  );
  const sections = useMemo<TransactionSection[]>(
    () =>
      groups.map((group) => ({
        key: group.key,
        title: group.label,
        data: group.items,
      })),
    [groups],
  );
  const selectedRowSet = useMemo(() => new Set(selectedRows), [selectedRows]);
  const selectedCount = selectedRows.length;
  const firstSelectedRow = selectedRows[0];
  const selectedTx = useMemo(
    () => transactions.find((tx) => tx.rowId === firstSelectedRow),
    [transactions, firstSelectedRow],
  );
  const [tagBubble, setTagBubble] = useState<TagBubble | null>(null);
  const [displayTagBubble, setDisplayTagBubble] = useState<TagBubble | null>(
    null,
  );
  const tagBubbleTransition = useModalTransition(Boolean(tagBubble), 6, 0.99);
  const tagButtonRefs = useRef<Record<number, TagButtonRef | null>>({});
  const tagColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    tagsList.forEach((t) => {
      map[t.id] = t.color;
    });
    return map;
  }, [tagsList]);
  const tagLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    tagsList.forEach((t) => {
      map[t.id] = t.label;
    });
    return map;
  }, [tagsList]);
  // ponytail: stable id from rowId+date+created time. Avoids remounting rows when
  // the Sheet normalizes the amount or detail string back into a slightly different value.
  const keyExtractor = useCallback(
    (tx: Transaction) =>
      `${tx.rowId}-${tx.rawDate}-${tx.createdAtMs ?? tx.createdAt ?? ""}`,
    [],
  );

  const closeTagBubble = useCallback(() => setTagBubble(null), []);
  const currentTagBubble = tagBubble || displayTagBubble;

  useLayoutEffect(() => {
    if (tagBubble) setDisplayTagBubble(tagBubble);
  }, [tagBubble]);

  const renderListHeader = useCallback(
    () => (
      <>
        <Animated.View style={{ opacity: scrollY.interpolate({ inputRange: [0, 5], outputRange: [1, 0], extrapolate: "clamp" }) }}>
          <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
            <PeriodControls
              colors={colors}
              copy={copy}
              year={year}
              month={month}
              availableYears={availableYears}
              availableMonths={availableMonths}
              onSelectPeriod={onSelectPeriod}
              goToday={goToday}
              goPrevMonth={goPrevMonth}
              goNextMonth={goNextMonth}
            />
          </View>
        </Animated.View>

        {searchActive && (
          <View
            style={[
              styles.searchBanner,
              styles.searchBannerMobile,
              { backgroundColor: colors.infoSoft, borderColor: colors.blue },
            ]}
          >
            <Text style={{ color: colors.blue, fontWeight: "600" }}>
              {copy.searchResults}
            </Text>
            <TouchableOpacity onPress={onExitSearch}>
              <Text style={{ color: colors.blue, fontWeight: "700" }}>
                {copy.exit}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <Text
          style={{
            paddingHorizontal: 18,
            paddingTop: 2,
            fontSize: 16,
            fontWeight: "700",
            color: colors.text,
          }}
        >
          {copy.movementsTitle}
        </Text>
      </>
    ),
    [
      colors,
      copy,
      searchActive,
      onExitSearch,
      scrollY,
      year,
      month,
      availableYears,
      availableMonths,
      onSelectPeriod,
      goToday,
      goPrevMonth,
      goNextMonth,
    ],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: TransactionSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={[styles.dateGroupLabel, { color: colors.muted }]}>
          {section.title}
        </Text>
      </View>
    ),
    [colors.muted],
  );

  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: Transaction;
      index: number;
      section: TransactionSection;
    }) => (
      <TransactionRow
        tx={item}
        index={index}
        sectionLength={section.data.length}
        selected={selectedRowSet.has(item.rowId)}
        colors={colors}
        currencySymbol={currencySymbol}
        copy={copy}
        searchActive={searchActive}
        searchText={searchText}
        tagColorMap={tagColorMap}
        tagLabelMap={tagLabelMap}
        onOpenDetail={onOpenDetail}
        onMove={onMove}
        onToggleSelection={onToggleSelection}
        setTagBubble={setTagBubble}
        tagButtonRefs={tagButtonRefs}
      />
    ),
    [
      colors,
      copy,
      currencySymbol,
      onMove,
      onOpenDetail,
      onToggleSelection,
      searchActive,
      searchText,
      selectedRowSet,
      tagColorMap,
      tagLabelMap,
    ],
  );

  const renderListEmpty = useCallback(
    () => (
      <View
        style={[
          styles.mobileEmptyCard,
          { backgroundColor: colors.card, marginHorizontal: 14, marginTop: 12 },
        ]}
      >
        <Text style={[styles.empty, { color: colors.muted }]}>
          {copy.noMovements}
        </Text>
      </View>
    ),
    [colors.card, colors.muted, copy.noMovements],
  );

  const renderListFooter = useCallback(() => {
    if (searchActive) return null;
    return (
      <TouchableOpacity
        style={[
          styles.loadOlderBtn,
          {
            backgroundColor: colors.card,
            marginHorizontal: 14,
            marginTop: sections.length ? 18 : 12,
          },
        ]}
        onPress={onLoadOlder}
      >
        <Text style={[styles.loadOlderText, { color: colors.text }]}>
          {copy.loadOlder}
        </Text>
      </TouchableOpacity>
    );
  }, [
    colors.card,
    colors.text,
    copy.loadOlder,
    onLoadOlder,
    searchActive,
    sections.length,
  ]);

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderListEmpty}
        ListFooterComponent={renderListFooter}
        contentContainerStyle={[
          styles.pageScroll,
          topInset !== undefined && { paddingTop: topInset },
          selectedCount > 0 && { paddingBottom: 100 },
        ]}
        extraData={selectedRowSet}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        onScrollBeginDrag={closeTagBubble}
        onMomentumScrollBegin={closeTagBubble}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false, listener: (e) => setScrolled(e.nativeEvent.contentOffset.y > 2) },
        )}
      />

      {topInset !== undefined && (
        <Animated.View
          pointerEvents={scrolled ? "box-none" : "none"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            paddingTop: topInset,
            opacity: scrollY.interpolate({
              inputRange: [0, 5],
              outputRange: [0, 1],
              extrapolate: "clamp",
            }),
          }}
        >
          <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
            <PeriodControls
              colors={colors}
              copy={copy}
              year={year}
              month={month}
              availableYears={availableYears}
              availableMonths={availableMonths}
              onSelectPeriod={onSelectPeriod}
              goToday={goToday}
              goPrevMonth={goPrevMonth}
              goNextMonth={goNextMonth}
            />
          </View>
        </Animated.View>
      )}

      {selectedCount > 0 && (
        <View
          style={[
            styles.selectionBar,
            {
              position: "absolute",
              left: 14,
              right: 14,
              bottom: 92,
              overflow: "hidden",
              borderWidth: 0.5,
              borderColor: withAlpha(colors.borderStrong, colors.bg === dark.bg ? 0.26 : 0.54),
              shadowColor: colors.shadow,
              shadowOpacity: 0.25,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: -3 },
              elevation: 10,
            },
          ]}
        >
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: withAlpha(colors.card, colors.bg === dark.bg ? 0.85 : 0.82),
              },
            ]}
          />
          <Text style={[styles.selectionText, { color: colors.text, zIndex: 1 }]}>
            {selectedCount === 1
              ? copy.selectedOne
              : `${selectedCount} ${copy.selectedMany}`}
          </Text>
          <View style={[styles.selectionActions, { zIndex: 1 }]}>
            {selectedCount === 1 && selectedTx && (
              <TouchableOpacity
                style={[
                  styles.selectionBtn,
                  {
                    backgroundColor: withAlpha(colors.editBg, 0.85),
                    borderColor: colors.editBorder,
                  },
                ]}
                onPress={() => onEdit(selectedTx)}
              >
                <MaterialCommunityIcons
                  name="pencil"
                  size={18}
                  color={colors.blue}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.selectionBtn,
                {
                  backgroundColor: withAlpha(colors.expenseSoft, 0.85),
                  borderColor: colors.red,
                },
              ]}
              onPress={onDeleteSelected}
            >
              <MaterialCommunityIcons
                name="trash-can"
                size={18}
                color={colors.red}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {currentTagBubble && tagBubbleTransition.modalVisible && (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={closeTagBubble}
        >
          <Animated.View
            style={[{ flex: 1 }, tagBubbleTransition.containerStyle]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={closeTagBubble}
              style={{ flex: 1 }}
            >
              <Animated.View
                onStartShouldSetResponder={() => true}
                style={[
                  {
                    position: "absolute",
                    left: currentTagBubble.x,
                    top: currentTagBubble.y,
                    maxWidth: 170,
                    borderRadius: 12,
                    padding: 8,
                    backgroundColor: colors.card,
                    shadowColor: colors.shadow,
                    shadowOpacity: 0.22,
                    shadowRadius: 12,
                    elevation: 8,
                  },
                  tagBubbleTransition.panelStyle,
                ]}
              >
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
                  {currentTagBubble.tags.map((tag) => {
                    const tc = tagColorMap[tag] || colors.muted;
                    const textColor = tagTextColor(tc, colors);
                    const tagLabel = tagLabelMap[tag] || tag;
                    return (
                      <View
                        key={tag}
                        style={{
                          maxWidth: "100%",
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 7,
                          backgroundColor: tc,
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: textColor,
                          }}
                        >
                          {tagLabel}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>
        </Modal>
      )}
    </View>
  );
});
