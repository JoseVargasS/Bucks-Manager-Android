import { ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { MaterialIconName } from "../../types";
import { UiCopy } from "../../i18n";

export function SettingsView({
  colors, copy, accountInfo, language, currencySymbol, fontPreference, pinEnabled,
  onOpenLanguage, onOpenCurrency, onOpenFont, onOpenPin,
  onRescan, onSwitch, onDisconnect, onOpenExport,
}: {
  colors: Palette; copy: UiCopy;
  language: "es" | "en"; currencySymbol: string; fontPreference: "system" | "serif" | "mono";
  accountInfo: { name?: string; email?: string } | null;
  pinEnabled: boolean;
  onOpenLanguage: () => void; onOpenCurrency: () => void; onOpenFont: () => void;
  onOpenPin: () => void;
  onRescan: () => void; onSwitch: () => void; onDisconnect: () => void; onOpenExport: () => void;
}) {
  const initial = (accountInfo?.email || accountInfo?.name || "B").slice(0, 1).toUpperCase();
  const fontLabel = fontPreference === "serif" ? copy.serif : fontPreference === "mono" ? copy.mono : copy.system;
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.pageScroll, styles.pageScrollMobile]}>
      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: colors.muted }]}>{copy.account}</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card }]}>
          <View style={[styles.settingsRow, { borderBottomWidth: 0.5, borderColor: colors.border }]}>
            <View style={[styles.settingsAvatar, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.accountInitial, { color: colors.primary }]}>{initial}</Text>
            </View>
            <View style={styles.settingsRowText}>
              <Text numberOfLines={1} style={[styles.accountHeroName, { color: colors.text }]}>{accountInfo?.name || copy.connectedAccount}</Text>
              <Text numberOfLines={1} style={[styles.accountHeroEmail, { color: colors.muted }]}>{accountInfo?.email || copy.google}</Text>
            </View>
          </View>
          <SettingsRow colors={colors} icon="google-drive" label={copy.findDriveSheet} onPress={onRescan} />
          <SettingsRow colors={colors} icon="account-switch" label={copy.switchAccount} onPress={onSwitch} last />
        </View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: colors.muted }]}>{copy.preferences}</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card }]}>
          <SettingsRow colors={colors} icon="translate" label={copy.language} value={language === "es" ? copy.spanish : copy.english} onPress={onOpenLanguage} />
          <SettingsRow colors={colors} icon="currency-usd" label={copy.currencySymbol} value={currencySymbol} onPress={onOpenCurrency} />
          <SettingsRow colors={colors} icon="format-font" label={copy.fontStyle} value={fontLabel} onPress={onOpenFont} last />
        </View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: colors.muted }]}>{copy.security}</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card }]}>
          <View style={[styles.settingsRow, { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12 }]}>
            <MaterialCommunityIcons name="shield-lock" size={22} color={colors.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>{copy.pinApp}</Text>
              <Text style={{ fontSize: 11, fontWeight: "500", color: colors.muted, marginTop: 1 }}>{copy.pinAppSub}</Text>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={onOpenPin}
              trackColor={{ false: colors.switchTrack, true: colors.primarySoft }}
              thumbColor={pinEnabled ? colors.primary : colors.disabled}
            />
          </View>
        </View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={[styles.settingsLabel, { color: colors.muted }]}>{copy.export}</Text>
        <View style={[styles.settingsGroup, { backgroundColor: colors.card }]}>
          <SettingsRow colors={colors} icon="file-export" label={copy.exportMovements} onPress={onOpenExport} last />
        </View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={onDisconnect}>
        <Text style={[styles.signOutText, { color: colors.red }]}>{copy.signOut}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SettingsRow({ colors, icon, label, value, onPress, last = false }: {
  colors: Palette; icon: MaterialIconName;
  label: string; value?: string; onPress: () => void; last?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.settingsRow, !last && { borderBottomWidth: 0.5, borderColor: colors.border }]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.blue} />
      <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{label}</Text>
      {value !== undefined && <Text numberOfLines={1} style={[styles.settingsRowValue, { color: colors.muted }]}>{value}</Text>}
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
    </TouchableOpacity>
  );
}
