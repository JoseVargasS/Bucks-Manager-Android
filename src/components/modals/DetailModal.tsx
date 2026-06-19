import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName, Transaction } from "../../types";
import { formatMoney } from "../../domain/bucksLogic";
import { formatCreatedTime, typeLabelFull } from "../../utils/formats";
import { UiCopy } from "../../i18n";

export function DetailModal({ tx, colors, currencySymbol, copy, onClose, onEdit, onDelete }: { tx: Transaction | null; colors: Palette; currencySymbol: string; copy: UiCopy; onClose: () => void; onEdit: (tx: Transaction) => void; onDelete: (tx: Transaction) => void }) {
  return (
    <Modal visible={!!tx} transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.detailModal, { backgroundColor: colors.card }]}>
          <View style={[styles.recordHeader, { borderBottomWidth: 0 }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="receipt-text" size={20} color={colors.yellow} /> {copy.detailTitle}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          {tx && (
            <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
              <View style={[styles.detailHero, { backgroundColor: colors.input }]}>
                <View style={[styles.detailHeroIcon, { backgroundColor: tx.amount >= 0 ? colors.incomeSoft : colors.expenseSoft }]}>
                  <MaterialCommunityIcons name={tx.amount >= 0 ? "bank-transfer-in" : "receipt-text-outline"} size={24} color={tx.amount >= 0 ? colors.green : colors.red} />
                </View>
                <View style={styles.detailHeroText}>
                    <Text style={[styles.detailHeroLabel, { color: colors.muted }]}>{typeLabelFull(tx.type, copy)}</Text>
                  <Text numberOfLines={1} style={[styles.detailHeroAmount, { color: tx.amount >= 0 ? colors.green : colors.red, fontVariant: ["tabular-nums"] }]}>{formatMoney(tx.amount, currencySymbol)}</Text>
                </View>
              </View>
              <View style={[styles.detailDescription, { backgroundColor: colors.input }]}>
                <Text style={[styles.detailSectionLabel, { color: colors.muted }]}>{copy.detail}</Text>
                <Text selectable style={[styles.detailDescriptionText, { color: colors.text }]}>{tx.detail}</Text>
              </View>
              <View style={styles.detailMetaGrid}>
                <DetailMetaRow icon="calendar" label={copy.date} value={tx.date} tone={colors.blue} colors={colors} />
                <DetailMetaRow icon="clock-outline" label={copy.time} value={formatCreatedTime(tx.createdAt)} tone={colors.muted} colors={colors} />
              </View>
              <View style={styles.detailActions}>
                <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.input }]} onPress={() => onEdit(tx)}>
                  <MaterialCommunityIcons name="pencil" size={18} color={colors.blue} />
                  <Text style={[styles.detailActionText, { color: colors.blue }]}>{copy.edit}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.detailActionBtn, { backgroundColor: colors.input }]} onPress={() => onDelete(tx)}>
                  <MaterialCommunityIcons name="trash-can" size={18} color={colors.red} />
                  <Text style={[styles.detailActionText, { color: colors.red }]}>{copy.delete}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

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
