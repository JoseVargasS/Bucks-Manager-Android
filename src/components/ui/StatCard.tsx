import { TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName } from "../../types";
import { Text } from "./AppText";

export function StatCard({ title, value, icon, tone, colors, action }: { title: string; value: string; icon: MaterialIconName; tone: "income" | "expense" | "warn" | "balance"; colors: Palette; action?: () => void }) {
  const color = tone === "income" ? colors.green : tone === "warn" ? colors.yellow : tone === "balance" ? colors.blue : colors.red;
  const softBg = tone === "income" ? colors.incomeSoft : tone === "warn" ? colors.warnSoft : tone === "balance" ? colors.infoSoft : colors.expenseSoft;
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card }]}>
      <View style={[styles.statIcon, { backgroundColor: softBg }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <View style={styles.statContent}>
        <Text numberOfLines={1} style={[styles.statLabel, { color: colors.muted }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.statValue, { color, fontVariant: ["tabular-nums"] }]}>{value}</Text>
      </View>
      {action && (
        <TouchableOpacity style={styles.editStat} onPress={action}>
          <MaterialCommunityIcons name="pencil" size={15} color={colors.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}
