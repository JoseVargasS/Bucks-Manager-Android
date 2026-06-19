import { Dispatch, SetStateAction, useRef, useState } from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { calculateExpression, normalizeAmountExpression, TRANSACTION_TYPES } from "../../domain/bucksLogic";
import { styles } from "../../styles/globalStyles";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { CalendarPicker } from "../ui/CalendarPicker";
import { Palette } from "../../theme/colors";
import { TransactionDraft, TransactionType, Tag } from "../../types";
import { typeColor, typeFill, typeLabelFull } from "../../utils/formats";
import { tagTextColor } from "../../utils/tags";
import { PickerConfig } from "./OptionSheet";
import { UiCopy } from "../../i18n";

export function TransactionModal({ visible, colors, copy, currencySymbol, draft, setDraft, tags, editing, openPicker, onClose, onSubmit }: {
  visible: boolean; colors: Palette; draft: TransactionDraft; setDraft: Dispatch<SetStateAction<TransactionDraft>>;
  copy: UiCopy; currencySymbol: string; tags: Tag[];
  editing: boolean; openPicker: (config: PickerConfig) => void; onClose: () => void; onSubmit: () => void;
}) {
  const [calVisible, setCalVisible] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsFrame, setTagsFrame] = useState({ left: 14, top: 120, width: 320 });
  const tagsRef = useRef<View>(null);
  const windowSize = useWindowDimensions();
  const cleanAmount = normalizeAmountExpression(draft.amount);
  const openParens = (cleanAmount.match(/\(/g) || []).length;
  const closeParens = (cleanAmount.match(/\)/g) || []).length;
  const amountLooksComplete = Boolean(cleanAmount) && !/[+\-*/.(\s]$/.test(cleanAmount) && openParens === closeParens;
  const amountPreview = cleanAmount ? calculateExpression(cleanAmount) : 0;
  const hasAmountPreview = amountLooksComplete && Number.isFinite(amountPreview);
  const amountPreviewText = `${amountPreview < 0 ? "- " : ""}${currencySymbol} ${Math.abs(amountPreview).toFixed(2)}`;
  const appendAmountToken = (token: string) => setDraft({ ...draft, amount: `${draft.amount}${token}` });
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.recordModal, { backgroundColor: colors.card }]}>
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="calculator-variant" size={19} color={colors.blue} /> {editing ? copy.editRecord : copy.newRecord}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.recordScroll} contentContainerStyle={styles.recordBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.text }]}>{copy.date}</Text>
            <TouchableOpacity
              style={[{ backgroundColor: colors.input, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, marginBottom: 12 }]}
              onPress={() => setCalVisible(true)}
            >
              <Text style={[{ color: colors.text, fontWeight: "600", flex: 1 }]}>{draft.date || copy.selectDate}</Text>
              <MaterialCommunityIcons name="calendar" size={20} color={colors.blue} />
            </TouchableOpacity>
            <CalendarPicker visible={calVisible} value={draft.date} onSelect={(v: string) => setDraft({ ...draft, date: v })} onClose={() => setCalVisible(false)} colors={colors} copy={copy} />
            <Text style={[styles.label, { color: colors.text }]}>{copy.type}</Text>
            <Select
              value={draft.type}
              options={TRANSACTION_TYPES.map((type) => ({ label: typeLabelFull(type, copy), value: type, color: typeColor(type, colors), softBg: typeFill(type, colors) }))}
              onSelect={(type: string) => {
                if (!type.startsWith("GASTO")) setTagsOpen(false);
                setDraft({ ...draft, type: type as TransactionType });
              }}
              colors={colors}
              placeholder={copy.selectType}
              style={{ marginBottom: 18 }}
            />
            {draft.type.startsWith("GASTO") && tags.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[styles.label, { color: colors.text }]}>{copy.tagsTitle}</Text>
                <TouchableOpacity
                  ref={tagsRef}
                  onPress={() => {
                    tagsRef.current?.measureInWindow((x, y, width, height) => {
                      const dropdownHeight = 148;
                      setTagsFrame({ left: x, top: Math.min(y + height + 4, windowSize.height - dropdownHeight - 12), width });
                      setTagsOpen(true);
                    });
                  }}
                  style={{ minHeight: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text numberOfLines={1} style={{ flex: 1, color: (draft.tags || []).length ? colors.text : colors.muted, fontWeight: "600" }}>
                    {(draft.tags || []).length ? (draft.tags || []).join(", ") : copy.tagsTitle}
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
                value={draft.amount}
                onChangeText={(amount: string) => setDraft({ ...draft, amount })}
                placeholder="Ej: (100+50)*25-10/2"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                inputMode="decimal"
                style={[styles.moneyInput, { color: colors.text }]}
              />
              {hasAmountPreview && (
                <Text numberOfLines={1} style={[styles.moneyPreview, { color: amountPreview < 0 ? colors.red : colors.green, fontSize: 16 }]}>{amountPreviewText}</Text>
              )}
            </View>
            <View style={styles.calcToolbar}>
              {["+", "-", "*", "/", "(", ")"].map((token) => (
                <TouchableOpacity key={token} style={[styles.calcChip, { backgroundColor: colors.infoSoft }]} onPress={() => appendAmountToken(token)}>
                  <Text style={[styles.calcChipText, { color: colors.blue }]}>{token === "*" ? "×" : token}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.calcChip, { backgroundColor: colors.expenseSoft }]} onPress={() => setDraft({ ...draft, amount: draft.amount.slice(0, -1) })}>
                <MaterialCommunityIcons name="backspace-outline" size={17} color={colors.red} />
              </TouchableOpacity>
            </View>
            <Field label={copy.detail} value={draft.detail} onChangeText={(detail: string) => setDraft({ ...draft, detail })} colors={colors} placeholder={copy.detailPlaceholder} />
            <View style={styles.recordActions}>
              <TouchableOpacity style={[styles.recordCancel, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
                <Text style={[styles.recordCancelText, { color: colors.text }]}>{copy.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.recordSubmit, { backgroundColor: colors.primary }]} onPress={onSubmit}>
                <MaterialCommunityIcons name="plus" size={20} color={colors.onPrimary} />
                <Text style={[styles.recordSubmitText, { color: colors.onPrimary }]}>{editing ? copy.save : copy.add}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          <Modal visible={tagsOpen} transparent animationType="none" onRequestClose={() => setTagsOpen(false)}>
            <TouchableOpacity activeOpacity={1} onPress={() => setTagsOpen(false)} style={{ flex: 1 }}>
              <View onStartShouldSetResponder={() => true} style={{ position: "absolute", left: tagsFrame.left, top: tagsFrame.top, width: tagsFrame.width, maxHeight: 148, padding: 8, borderRadius: 12, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, flexDirection: "row", flexWrap: "wrap", gap: 6, elevation: 12 }}>
                {tags.map((tag) => {
                  const selected = (draft.tags || []).includes(tag.label);
                  const textColor = tagTextColor(tag.color);
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      onPress={() => setDraft((currentDraft) => {
                        const current = currentDraft.tags || [];
                        return { ...currentDraft, tags: current.includes(tag.label) ? current.filter((t) => t !== tag.label) : [...current, tag.label] };
                      })}
                      style={{ maxWidth: "48%", height: 32, paddingHorizontal: 9, borderRadius: 8, borderWidth: 2, borderColor: selected ? colors.text : "transparent", backgroundColor: tag.color, opacity: selected ? 1 : 0.72, flexDirection: "row", alignItems: "center" }}
                    >
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: textColor, flexShrink: 1 }}>{tag.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableOpacity>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}
