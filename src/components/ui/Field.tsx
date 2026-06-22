import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName } from "../../types";
import { Text, TextInput } from "./AppText";

export function Field({ label, value, onChangeText, onFocus, onBlur, colors, placeholder = "", rightIcon }: { label: string; value: string; onChangeText: (v: string) => void; onFocus?: () => void; onBlur?: () => void; colors: Palette; placeholder?: string; rightIcon?: MaterialIconName }) {
  return (
    <View style={{ flex: 1, marginBottom: 12 }}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={{ position: "relative" }}>
        <TextInput value={value} onChangeText={onChangeText} onFocus={onFocus} onBlur={onBlur} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, rightIcon && { paddingRight: 46 }, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]} />
        {rightIcon && <MaterialCommunityIcons pointerEvents="none" name={rightIcon} size={22} color={colors.text} style={styles.inputIcon} />}
      </View>
    </View>
  );
}
