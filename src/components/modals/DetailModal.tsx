import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Animated, BackHandler, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName, Transaction } from "../../types";
import { formatMoney } from "../../domain/bucksLogic";
import { formatCreatedTime, typeLabelFull } from "../../utils/formats";
import { UiCopy } from "../../i18n";
import { useModalTransition } from "../ui/useModalTransition";
import { Text } from "../ui/AppText";

export type DetailModalHandle = { open: (tx: Transaction) => void; close: () => void };

export const DetailModal = forwardRef<DetailModalHandle, { colors: Palette; currencySymbol: string; copy: UiCopy; onEdit: (tx: Transaction) => void; onDelete: (tx: Transaction) => void }>(function DetailModal({ colors, currencySymbol, copy, onEdit, onDelete }, ref) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<Transaction | null>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  const transition = useModalTransition(visible, 12, 0.985, () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  });
  const close = useCallback(() => setVisible(false), []);
  const amount = current?.amount ?? 0;
  const isIncome = amount >= 0;

  useImperativeHandle(ref, () => ({
    open(tx) {
      setCurrent(tx);
      setVisible(true);
    },
    close,
  }), [close]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close, visible]);

  if (!transition.modalVisible) return null;
  return (
      <Animated.View
        pointerEvents={transition.modalVisible ? "auto" : "none"}
        accessibilityViewIsModal={visible}
        importantForAccessibility={transition.modalVisible ? "yes" : "no-hide-descendants"}
        style={[StyleSheet.absoluteFill, styles.modalOverlay, { backgroundColor: colors.overlay, zIndex: 1001, elevation: 1001 }, transition.containerStyle]}
      >
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={close} />
        <Animated.View style={[styles.detailModal, { backgroundColor: colors.card }, transition.panelStyle]}>
          <View style={[styles.recordHeader, { borderBottomWidth: 0 }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="receipt-text" size={20} color={colors.yellow} /> {copy.detailTitle}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input }]} onPress={close}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
              <View style={[styles.detailHero, { backgroundColor: colors.input }]}>
                <View style={[styles.detailHeroIcon, { backgroundColor: isIncome ? colors.incomeSoft : colors.expenseSoft }]}>
                  <MaterialCommunityIcons name={isIncome ? "bank-transfer-in" : "receipt-text-outline"} size={24} color={isIncome ? colors.green : colors.red} />
                </View>
                <View style={styles.detailHeroText}>
                  <Text style={[styles.detailHeroLabel, { color: colors.muted }]}>{current ? typeLabelFull(current.type, copy) : ""}</Text>
                  <Text numberOfLines={1} style={[styles.detailHeroAmount, { color: isIncome ? colors.green : colors.red, fontVariant: ["tabular-nums"] }]}>{current ? formatMoney(amount, currencySymbol) : ""}</Text>
                </View>
              </View>
              <View style={[styles.detailDescription, { backgroundColor: colors.input }]}>
                <Text style={[styles.detailSectionLabel, { color: colors.muted }]}>{copy.detail}</Text>
                <Text selectable style={[styles.detailDescriptionText, { color: colors.text }]}>{current?.detail || ""}</Text>
              </View>
              <View style={styles.detailMetaGrid}>
                <DetailMetaRow icon="calendar" label={copy.date} value={current?.date || ""} tone={colors.blue} colors={colors} />
                <DetailMetaRow icon="clock-outline" label={copy.time} value={current ? formatCreatedTime(current.createdAt) : ""} tone={colors.muted} colors={colors} />
              </View>
              <View style={styles.detailActions}>
                <TouchableOpacity disabled={!current} style={[styles.detailActionBtn, { backgroundColor: colors.input }]} onPress={() => { if (!current) return; pendingAction.current = () => onEdit(current); close(); }}>
                  <MaterialCommunityIcons name="pencil" size={18} color={colors.blue} />
                  <Text style={[styles.detailActionText, { color: colors.blue }]}>{copy.edit}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={!current} style={[styles.detailActionBtn, { backgroundColor: colors.input }]} onPress={() => { if (!current) return; pendingAction.current = () => onDelete(current); close(); }}>
                  <MaterialCommunityIcons name="trash-can" size={18} color={colors.red} />
                  <Text style={[styles.detailActionText, { color: colors.red }]}>{copy.delete}</Text>
                </TouchableOpacity>
              </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>
  );
});

function DetailMetaRow({ icon, label, value, tone, colors }: { icon: MaterialIconName; label: string; value: string; tone: string; colors: Palette }) {
  return (
    <View style={styles.detailMetaItem}>
      <MaterialCommunityIcons name={icon} size={18} color={tone} />
      <View style={styles.detailMetaText}>
        <Text style={[styles.detailMetaLabel, { color: colors.muted }]}>{label}</Text>
        <Text numberOfLines={1} selectable style={[styles.detailMetaValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}
