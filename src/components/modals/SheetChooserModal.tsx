import { Modal, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { ModalHeader } from "../ui/ModalHeader";
import { Palette } from "../../theme/colors";
import { SheetCandidate } from "../../types";

export function SheetChooserModal({ visible, colors, candidates, onClose, onSelect }: { visible: boolean; colors: Palette; candidates: SheetCandidate[]; onClose: () => void; onSelect: (candidate: SheetCandidate) => void }) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.optionBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <ModalHeader title="Selecciona tu hoja" icon="google-spreadsheet" colors={colors} onClose={onClose} />
          <Text style={[styles.connectText, { color: colors.muted, marginBottom: 12 }]}>
            Encontré varias hojas compatibles. Elige la que quieres usar como base de datos.
          </Text>
          {candidates.map((candidate) => (
            <TouchableOpacity key={candidate.id} style={[styles.sheetChoice, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={() => onSelect(candidate)}>
              <MaterialCommunityIcons name="google-spreadsheet" size={22} color={colors.green} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.sheetChoiceTitle, { color: colors.text }]}>{candidate.name}</Text>
                <Text style={[styles.sheetChoiceMeta, { color: colors.muted }]}>{candidate.modifiedTime ? `Modificada: ${new Date(candidate.modifiedTime).toLocaleDateString("es-PE")}` : "Google Sheets"}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}
