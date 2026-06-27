import { useRef, useState } from "react";
import { Animated, Modal, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { PIN_RESET_MS } from "../../theme/constants";
import { UiCopy } from "../../i18n";
import { PinScreen } from "../screens/PinScreen";
import { useModalTransition } from "../ui/useModalTransition";
import { Text } from "../ui/AppText";

export function PinSetupModal({ visible, colors, copy, onClose, onSave }: {
  visible: boolean;
  colors: Palette;
  copy: UiCopy;
  onClose: () => void;
  onSave: (pin: string) => void;
}) {
  const [firstPin, setFirstPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const pendingPin = useRef<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transition = useModalTransition(visible, 12, 0.985, () => {
    const pin = pendingPin.current;
    pendingPin.current = null;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setFirstPin("");
    setWrong(false);
    if (pin) onSave(pin);
  });

  function resetForm() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
    setFirstPin("");
    setWrong(false);
  }

  function handleFill(pin: string) {
    if (firstPin === "") {
      setFirstPin(pin);
      setWrong(false);
      return;
    }
    if (pin === firstPin) {
      pendingPin.current = pin;
      onClose();
    } else {
      setWrong(true);
      resetTimer.current = setTimeout(resetForm, PIN_RESET_MS);
    }
  }

  const inFirstPhase = firstPin === "";

  if (!transition.modalVisible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.modalOverlay, { backgroundColor: colors.overlay }, transition.containerStyle]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.recordModal, { backgroundColor: colors.card }, transition.panelStyle]}>
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="shield-lock" size={19} color={colors.primary} />{" "}
              {copy.pinSetupTitle}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input }]} onPress={onClose}>
              <MaterialCommunityIcons name="close-thick" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ height: 400 }}>
            <PinScreen
              key={inFirstPhase ? "enter" : "confirm"}
              colors={colors}
              copy={copy}
              subtitle={inFirstPhase ? copy.pinEnterNew : copy.pinConfirm}
              wrong={wrong}
              bgColor={colors.card}
              onFill={handleFill}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

