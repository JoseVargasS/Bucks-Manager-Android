import { Modal, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { Transaction } from "../../types";
import { formatMoney } from "../../domain/bucksLogic";
import { typeLabel } from "../../utils/formats";
import { UiCopy } from "../../i18n";

export type ConfirmKind = "delete" | "deleteSelected";

export interface ConfirmConfig {
  kind: ConfirmKind;
  tx?: Transaction;
  count?: number;
}

export function ConfirmModal({ config, colors, currencySymbol, copy, onClose, onConfirm }: {
  config: ConfirmConfig | null;
  colors: Palette;
  currencySymbol: string;
  copy: UiCopy;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!config) return null;
  const title = config.kind === "delete" ? copy.confirmDeleteTitle : copy.confirmDeleteSelectedTitle;
  const message = config.kind === "delete" ? copy.confirmDeleteMsg : copy.confirmDeleteSelectedMsg;
  const accent = colors.red;
  const accentSoft = colors.expenseSoft;
  const icon = "trash-can";

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.recordModal, { backgroundColor: colors.card }]}>
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name={icon} size={19} color={accent} /> {title}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 16, gap: 14 }}>
            {config.tx && (
              <View style={{ backgroundColor: colors.input, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: accentSoft, alignItems: "center", justifyContent: "center" }}>
                  <MaterialCommunityIcons
                    name={config.tx.amount >= 0 ? "bank-transfer-in" : "receipt-text-outline"}
                    size={22}
                    color={config.tx.amount >= 0 ? colors.green : colors.red}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase" }}>
                    {typeLabel(config.tx.type, copy)}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 20, fontWeight: "700", color: config.tx.amount >= 0 ? colors.green : colors.red, fontVariant: ["tabular-nums"] }}>
                    {formatMoney(config.tx.amount, currencySymbol)}
                  </Text>
                  {!!config.tx.detail && (
                    <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, fontWeight: "500", color: colors.text }}>
                      {config.tx.detail}
                    </Text>
                  )}
                </View>
              </View>
            )}

            <Text style={{ fontSize: 14, fontWeight: "500", color: colors.muted, lineHeight: 20 }}>
              {message}
            </Text>

            <View style={styles.recordActions}>
              <TouchableOpacity
                style={[styles.recordCancel, { backgroundColor: colors.input, borderColor: colors.border }]}
                onPress={onClose}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
                <Text style={[styles.recordCancelText, { color: colors.text }]}>{copy.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.recordSubmit, { backgroundColor: accent }]}
                onPress={onConfirm}
              >
                <MaterialCommunityIcons name="check" size={20} color="#fff" />
                <Text style={[styles.recordSubmitText, { color: "#fff" }]}>{copy.confirm}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
