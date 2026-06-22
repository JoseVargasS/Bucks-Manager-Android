import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, Animated, BackHandler, Keyboard, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { calculateExpression, normalizeAmountExpression, TRANSACTION_TYPES } from "../../domain/bucksLogic";
import { styles } from "../../styles/globalStyles";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { CalendarPicker } from "../ui/CalendarPicker";
import { Palette } from "../../theme/colors";
import { Transaction, TransactionDraft, TransactionType, Tag } from "../../types";
import { typeColor, typeFill, typeLabelFull } from "../../utils/formats";
import { UiCopy } from "../../i18n";
import { useModalTransition } from "../ui/useModalTransition";
import { getBlankDraft } from "../../utils/transactions";
import { Text, TextInput } from "../ui/AppText";

export type TransactionModalHandle = {
  open: (draft: TransactionDraft, editingTx?: Transaction | null) => void;
  close: () => void;
};

export const TransactionModal = forwardRef<TransactionModalHandle, {
  colors: Palette;
  copy: UiCopy; currencySymbol: string; tags: Tag[];
  onSubmit: (draft: TransactionDraft, editingTx: Transaction | null) => boolean;
}>(function TransactionModal({ colors, copy, currencySymbol, tags, onSubmit }, ref) {
  const [visible, setVisible] = useState(false);
  const [formDraft, setFormDraft] = useState(getBlankDraft);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [calVisible, setCalVisible] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsFrame, setTagsFrame] = useState({ left: 14, top: 160, width: 320, maxHeight: 200 });
  const scrollRef = useRef<ScrollView>(null);
  const modalRef = useRef<View>(null);
  const tagsRef = useRef<View>(null);
  const detailFocusedRef = useRef(false);
  const submittingRef = useRef(false);
  const pendingSubmit = useRef<{ draft: TransactionDraft; editingTx: Transaction | null } | null>(null);
  const transition = useModalTransition(visible, 14, 0.99, () => {
    const pending = pendingSubmit.current;
    pendingSubmit.current = null;
    if (pending) onSubmit(pending.draft, pending.editingTx);
  });
  const amountState = useMemo(() => {
    const cleanAmount = normalizeAmountExpression(formDraft.amount);
    const openParens = (cleanAmount.match(/\(/g) || []).length;
    const closeParens = (cleanAmount.match(/\)/g) || []).length;
    const complete = Boolean(cleanAmount) && !/[+\-*/.(\s]$/.test(cleanAmount) && openParens === closeParens;
    const preview = cleanAmount ? calculateExpression(cleanAmount) : 0;
    return {
      preview,
      visible: complete && Number.isFinite(preview),
      text: `${preview < 0 ? "- " : ""}${currencySymbol} ${Math.abs(preview).toFixed(2)}`,
    };
  }, [currencySymbol, formDraft.amount]);
  const typeOptions = useMemo(() => TRANSACTION_TYPES.map((type) => ({
    label: typeLabelFull(type, copy), value: type, color: typeColor(type, colors), softBg: typeFill(type, colors),
  })), [colors, copy]);

  const close = useCallback(() => {
    Keyboard.dismiss();
    setVisible(false);
    setCalVisible(false);
    setTagsOpen(false);
  }, []);

  useImperativeHandle(ref, () => ({
    open(nextDraft, nextEditingTx = null) {
      setFormDraft(nextDraft);
      setEditingTx(nextEditingTx);
      setCalVisible(false);
      setTagsOpen(false);
      submittingRef.current = false;
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

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      if (detailFocusedRef.current) scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => subscription.remove();
  }, []);

  const measureTags = useCallback(() => {
    tagsRef.current?.measureInWindow((x, y, width, height) => {
      modalRef.current?.measureInWindow((modalX, modalY, _modalWidth, modalHeight) => {
        const maxHeight = Math.min(220, Math.max(120, modalHeight - 92));
        const below = y - modalY + height + 4;
        const top = below + maxHeight <= modalHeight - 10 ? below : Math.max(70, y - modalY - maxHeight - 4);
        setTagsFrame({ left: x - modalX, top, width, maxHeight: Math.min(maxHeight, modalHeight - top - 8) });
      });
    });
  }, []);

  function toggleTags() {
    Keyboard.dismiss();
    if (tagsOpen) {
      setTagsOpen(false);
      return;
    }
    setTagsOpen(true);
    requestAnimationFrame(measureTags);
  }

  function submit() {
    if (submittingRef.current) return;
    if (!formDraft.date || !formDraft.amount || !formDraft.detail.trim()) {
      Alert.alert(copy.incompleteData, copy.completeRequired);
      return;
    }
    submittingRef.current = true;
    pendingSubmit.current = { draft: { ...formDraft, tags: [...(formDraft.tags || [])] }, editingTx };
    close();
  }

  if (!transition.modalVisible) return null;
  return (
      <Animated.View
        pointerEvents={transition.modalVisible ? "auto" : "none"}
        accessibilityViewIsModal={visible}
        importantForAccessibility={transition.modalVisible ? "yes" : "no-hide-descendants"}
        style={[StyleSheet.absoluteFill, styles.modalOverlay, { backgroundColor: colors.overlay, zIndex: 1000, elevation: 1000 }, transition.containerStyle]}
      >
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={close} />
        <Animated.View ref={modalRef} collapsable={false} style={[styles.recordModal, { backgroundColor: colors.card }, transition.panelStyle]}>
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="calculator-variant" size={19} color={colors.blue} /> {editingTx ? copy.editRecord : copy.newRecord}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input }]} onPress={close}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView ref={scrollRef} style={styles.recordScroll} contentContainerStyle={styles.recordBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" keyboardDismissMode="none" onScrollBeginDrag={() => setTagsOpen(false)}>
            <Text style={[styles.label, { color: colors.text }]}>{copy.date}</Text>
            <TouchableOpacity
              style={[{ backgroundColor: colors.input, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, marginBottom: 12 }]}
              onPress={() => { Keyboard.dismiss(); setTagsOpen(false); setCalVisible(true); }}
            >
              <Text style={[{ color: colors.text, fontWeight: "600", flex: 1 }]}>{formDraft.date || copy.selectDate}</Text>
              <MaterialCommunityIcons name="calendar" size={20} color={colors.blue} />
            </TouchableOpacity>
            <CalendarPicker visible={calVisible} value={formDraft.date} onSelect={(date: string) => setFormDraft((current) => ({ ...current, date }))} onClose={() => setCalVisible(false)} colors={colors} copy={copy} />
            <Text style={[styles.label, { color: colors.text }]}>{copy.type}</Text>
            <Select
              value={formDraft.type}
              options={typeOptions}
              onSelect={(type: string) => {
                setTagsOpen(false);
                setFormDraft((current) => ({ ...current, type: type as TransactionType }));
              }}
              colors={colors}
              placeholder={copy.selectType}
              style={{ marginBottom: 18 }}
            />
            {formDraft.type.startsWith("GASTO") && tags.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[styles.label, { color: colors.text }]}>{copy.tagsTitle}</Text>
                <TouchableOpacity
                  ref={tagsRef}
                  onLayout={measureTags}
                  onPress={toggleTags}
                  style={{ minHeight: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text numberOfLines={1} style={{ flex: 1, color: (formDraft.tags || []).length ? colors.text : colors.muted, fontWeight: "600" }}>
                    {(formDraft.tags || []).length ? (formDraft.tags || []).join(", ") : copy.tagsTitle}
                  </Text>
                  <MaterialCommunityIcons name={tagsOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
            )}
            <Text style={[styles.label, { color: colors.text }]}>
              {copy.amount} <Text style={{ color: colors.muted, fontSize: 13 }}>({copy.amountHelp})</Text>
            </Text>
            <View style={[styles.moneyInputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Text style={[styles.moneyPrefix, { color: colors.text }]}>{currencySymbol}</Text>
              <TextInput
                value={formDraft.amount}
                onChangeText={(amount: string) => setFormDraft((current) => ({ ...current, amount }))}
                placeholder="Ej: (100+50)*25-10/2"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                inputMode="decimal"
                onFocus={() => { detailFocusedRef.current = false; setTagsOpen(false); }}
                style={[styles.moneyInput, { color: colors.text }]}
              />
              {amountState.visible && (
                <Text numberOfLines={1} style={[styles.moneyPreview, { color: amountState.preview < 0 ? colors.red : colors.green, fontSize: 16 }]}>{amountState.text}</Text>
              )}
            </View>
            <View style={styles.calcToolbar}>
              {["+", "-", "*", "/", "(", ")"].map((token) => (
                <TouchableOpacity key={token} style={[styles.calcChip, { backgroundColor: colors.infoSoft }]} onPress={() => setFormDraft((current) => ({ ...current, amount: `${current.amount}${token}` }))}>
                  <Text style={[styles.calcChipText, { color: colors.blue }]}>{token === "*" ? "×" : token}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.calcChip, { backgroundColor: colors.expenseSoft }]} onPress={() => setFormDraft((current) => ({ ...current, amount: current.amount.slice(0, -1) }))}>
                <MaterialCommunityIcons name="backspace-outline" size={17} color={colors.red} />
              </TouchableOpacity>
            </View>
            <Field
              label={copy.detail}
              value={formDraft.detail}
              onChangeText={(detail: string) => setFormDraft((current) => ({ ...current, detail }))}
              onFocus={() => {
                detailFocusedRef.current = true;
                setTagsOpen(false);
                requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
              }}
              onBlur={() => { detailFocusedRef.current = false; }}
              colors={colors}
              placeholder={copy.detailPlaceholder}
            />
            <View style={styles.recordActions}>
              <TouchableOpacity style={[styles.recordCancel, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={close}>
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
                <Text style={[styles.recordCancelText, { color: colors.text }]}>{copy.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.recordSubmit, { backgroundColor: colors.primary }]} onPress={submit}>
                <MaterialCommunityIcons name="plus" size={20} color={colors.onPrimary} />
                <Text style={[styles.recordSubmitText, { color: colors.onPrimary }]}>{editingTx ? copy.save : copy.add}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          {tagsOpen && (
            <View style={[styles.selectMenu, { left: tagsFrame.left, top: tagsFrame.top, width: tagsFrame.width, maxHeight: tagsFrame.maxHeight, backgroundColor: colors.card, borderColor: colors.border, zIndex: 40 }]}>
              <ScrollView contentContainerStyle={styles.selectMenuContent} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
                {tags.map((tag) => {
                  const selected = (formDraft.tags || []).includes(tag.label);
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      style={[styles.selectOptionRow, { backgroundColor: selected ? colors.primarySoft : "transparent" }]}
                      onPress={() => {
                        setFormDraft((currentDraft) => {
                          const current = currentDraft.tags || [];
                          return { ...currentDraft, tags: current.includes(tag.label) ? current.filter((item) => item !== tag.label) : [...current, tag.label] };
                        });
                        setTagsOpen(false);
                      }}
                    >
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tag.color }} />
                      <Text numberOfLines={1} style={[styles.selectOptionLabel, { color: selected ? colors.primary : colors.text }]}>{tag.label}</Text>
                      {selected && <MaterialCommunityIcons name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </Animated.View>
  );
});
