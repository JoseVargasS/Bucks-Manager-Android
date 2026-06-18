import { useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { PinScreen } from "../screens/PinScreen";

export function PinSetupModal({ visible, colors, copy, onClose, onSave }: {
  visible: boolean;
  colors: Palette;
  copy: { pinSetupTitle: string; pinEnterNew: string; pinConfirm: string; cancel: string };
  onClose: () => void;
  onSave: (pin: string) => void;
}) {
  const [phase, setPhase] = useState<"enter" | "confirm">("enter");
  const [firstPin, setFirstPin] = useState("");
  const [enteredPin, setEnteredPin] = useState("");
  const [wrong, setWrong] = useState(false);

  function handleClose() {
    setPhase("enter");
    setFirstPin("");
    setEnteredPin("");
    setWrong(false);
    onClose();
  }

  function handleFirstPhase(value: string) {
    setFirstPin(value);
    setEnteredPin("");
    setPhase("confirm");
    setWrong(false);
  }

  function handleConfirmPhase(value: string) {
    setEnteredPin(value);
  }

  function handleConfirm() {
    if (enteredPin === firstPin) {
      onSave(enteredPin);
      setPhase("enter");
      setFirstPin("");
      setEnteredPin("");
      setWrong(false);
    } else {
      setWrong(true);
      setTimeout(() => {
        setPhase("enter");
        setFirstPin("");
        setEnteredPin("");
        setWrong(false);
      }, 1200);
    }
  }

  const inFirstPhase = phase === "enter";

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={handleClose} />
        <View style={[styles.recordModal, { backgroundColor: colors.card }]}>
          <View style={[styles.recordHeader, { borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.text }]}>
              <MaterialCommunityIcons name="shield-lock" size={19} color={colors.primary} />{" "}
              {copy.pinSetupTitle}
            </Text>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.input }]} onPress={handleClose}>
              <MaterialCommunityIcons name="close-thick" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ height: 400 }}>
            <PinScreen
              key={phase}
              colors={colors}
              subtitle={inFirstPhase ? copy.pinEnterNew : copy.pinConfirm}
              wrong={wrong}
              bgColor={colors.card}
              onFill={inFirstPhase ? handleFirstPhase : handleConfirmPhase}
              confirmPhase={!inFirstPhase}
              onConfirm={!inFirstPhase ? handleConfirm : undefined}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
