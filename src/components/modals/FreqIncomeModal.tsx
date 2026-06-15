import { Modal, TouchableOpacity, View } from "react-native";
import { styles } from "../../styles/globalStyles";
import { ModalHeader } from "../ui/ModalHeader";
import { Field } from "../ui/Field";
import { ActionRow } from "../ui/ActionRow";
import { Palette } from "../../theme/colors";

export function FreqIncomeModal({ visible, colors, value, setValue, onClose, onSubmit }: {
  visible: boolean; colors: Palette; value: string; setValue: (v: string) => void; onClose: () => void; onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <ModalHeader title="Ingreso frecuente" icon="cash" colors={colors} onClose={onClose} />
          <Field label="Monto" value={value} onChangeText={setValue} colors={colors} />
          <ActionRow colors={colors} onCancel={onClose} onSubmit={onSubmit} submitLabel="Guardar" />
        </View>
      </View>
    </Modal>
  );
}
