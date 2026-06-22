import { useLayoutEffect, useRef, useState } from "react";
import { Animated, Modal, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { Transaction } from "../../types";
import { formatMoney } from "../../domain/bucksLogic";
import { typeLabel } from "../../utils/formats";
import { UiCopy } from "../../i18n";
import { MaterialIconName } from "../../types";
import { useModalTransition } from "../ui/useModalTransition";
import { Text } from "../ui/AppText";

type ConfirmKind = "delete" | "deleteSelected" | "disconnect" | "removeAccount";

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
  onConfirm: (config: ConfirmConfig) => void;
}) {
  const [displayConfig, setDisplayConfig] = useState(config);
  const pendingConfirm = useRef<ConfirmConfig | null>(null);
  const transition = useModalTransition(Boolean(config), 12, 0.985, () => {
    const pending = pendingConfirm.current;
    pendingConfirm.current = null;
    if (pending) onConfirm(pending);
  });

  useLayoutEffect(() => {
    if (config) setDisplayConfig(config);
  }, [config]);

  const current = config || displayConfig;
  if (!current || !transition.modalVisible) return null;
  const isAccountAction = current.kind === "disconnect" || current.kind === "removeAccount";
  const title = current.kind === "delete"
    ? copy.confirmDeleteTitle
    : current.kind === "deleteSelected"
      ? copy.confirmDeleteSelectedTitle
      : current.kind === "removeAccount"
        ? copy.removeAccountTitle
        : copy.signOutTitle;
  const message = current.kind === "delete"
    ? copy.confirmDeleteMsg
    : current.kind === "deleteSelected"
      ? copy.confirmDeleteSelectedMsg
      : current.kind === "removeAccount"
        ? copy.removeAccountMessage
        : copy.signOutMessage;
  const accent = colors.red;
  const accentSoft = colors.expenseSoft;
  const icon: MaterialIconName = isAccountAction ? "account-off" : "trash-can";
  const actionLabel = current.kind === "removeAccount" ? copy.removeAccount : current.kind === "disconnect" ? copy.signOut : copy.confirm;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.modalOverlay, { backgroundColor: colors.overlay }, transition.containerStyle]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.recordModal, { backgroundColor: colors.card }, transition.panelStyle]}>
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name={icon} size={19} color={accent} /> {title}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 16, gap: 14 }}>
            {current.tx && (
              <View style={{ backgroundColor: colors.input, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: accentSoft, alignItems: "center", justifyContent: "center" }}>
                  <MaterialCommunityIcons
                    name={current.tx.amount >= 0 ? "bank-transfer-in" : "receipt-text-outline"}
                    size={22}
                    color={current.tx.amount >= 0 ? colors.green : colors.red}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase" }}>
                    {typeLabel(current.tx.type, copy)}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 20, fontWeight: "700", color: current.tx.amount >= 0 ? colors.green : colors.red, fontVariant: ["tabular-nums"] }}>
                    {formatMoney(current.tx.amount, currencySymbol)}
                  </Text>
                  {!!current.tx.detail && (
                    <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, fontWeight: "500", color: colors.text }}>
                      {current.tx.detail}
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
                onPress={() => {
                  pendingConfirm.current = current;
                  onClose();
                }}
              >
                <MaterialCommunityIcons name="check" size={20} color="#fff" />
                <Text style={[styles.recordSubmitText, { color: "#fff" }]}>{actionLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
