import { useState } from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TRANSACTION_TYPES } from "../../domain/bucksLogic";
import { styles } from "../../styles/globalStyles";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { CalendarPicker } from "../ui/CalendarPicker";
import { Palette } from "../../theme/colors";
import { TransactionDraft, TransactionType } from "../../types";
import { titleCaseType } from "../../utils/formats";
import { PickerConfig } from "./OptionSheet";

export function TransactionModal({ visible, colors, draft, setDraft, editing, openPicker, onClose, onSubmit }: {
  visible: boolean; colors: Palette; draft: TransactionDraft; setDraft: (d: TransactionDraft) => void;
  editing: boolean; openPicker: (config: PickerConfig) => void; onClose: () => void; onSubmit: () => void;
}) {
  const [calVisible, setCalVisible] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.recordModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="calculator-variant" size={19} color={colors.blue} /> {editing ? "Editar Registro" : "Nuevo Registro"}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.recordScroll} contentContainerStyle={styles.recordBody} showsVerticalScrollIndicator={false}>
            <Text style={[styles.label, { color: colors.text }]}>Fecha</Text>
            <TouchableOpacity
              style={[{ backgroundColor: colors.input, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, marginBottom: 12 }]}
              onPress={() => setCalVisible(true)}
            >
              <MaterialCommunityIcons name="calendar" size={20} color={colors.blue} />
              <Text style={[{ color: colors.text, fontWeight: "900", flex: 1 }]}>{draft.date || "Seleccionar fecha"}</Text>
            </TouchableOpacity>
            <CalendarPicker visible={calVisible} value={draft.date} onSelect={(v: string) => setDraft({ ...draft, date: v })} onClose={() => setCalVisible(false)} colors={colors} />
            <Text style={[styles.label, { color: colors.text }]}>Tipo</Text>
            <Select
              value={draft.type}
              options={TRANSACTION_TYPES.map((type) => ({ label: titleCaseType(type), value: type }))}
              onSelect={(type: string) => setDraft({ ...draft, type: type as TransactionType })}
              colors={colors}
              placeholder="Seleccionar tipo"
              style={{ marginBottom: 18 }}
            />
            <Text style={[styles.label, { color: colors.text }]}>
              Monto <Text style={{ color: colors.muted, fontSize: 13 }}>(puedes hacer operaciones: + - * /)</Text>
            </Text>
            <View style={[styles.moneyInputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Text style={[styles.moneyPrefix, { color: colors.text }]}>S/</Text>
              <TextInput
                value={draft.amount}
                onChangeText={(amount: string) => setDraft({ ...draft, amount })}
                placeholder="Ej: (100+50)*25-10/2"
                placeholderTextColor={colors.muted}
                style={[styles.moneyInput, { color: colors.text }]}
              />
            </View>
            <Field label="Detalle" value={draft.detail} onChangeText={(detail: string) => setDraft({ ...draft, detail })} colors={colors} placeholder="Ej: Compra en supermercado" />
            <View style={styles.recordActions}>
              <TouchableOpacity style={[styles.recordCancel, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
                <Text style={[styles.recordCancelText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.recordSubmit, { backgroundColor: colors.primary }]} onPress={onSubmit}>
                <MaterialCommunityIcons name="plus" size={20} color={colors.onPrimary} />
                <Text style={[styles.recordSubmitText, { color: colors.onPrimary }]}>{editing ? "Guardar" : "Agregar"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
