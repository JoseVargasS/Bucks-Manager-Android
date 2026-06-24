import { View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName } from "../../types";
import { Text } from "./AppText";

export function Kpi({ title, value, icon, color, colors }: { title: string; value: string; icon: MaterialIconName; color: string; colors: Palette }) {
  return (
    <View style={[styles.kpi, { backgroundColor: colors.card }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text numberOfLines={1} style={[styles.statLabel, { color: colors.muted, flex: 1 }]}>{title}</Text>
        <MaterialCommunityIcons name={icon} size={18} color={color} style={{ opacity: 0.7 }} />
      </View>
      <Text numberOfLines={1} style={[styles.kpiValue, { color, fontVariant: ["tabular-nums"] }]}>{value}</Text>
    </View>
  );
}
