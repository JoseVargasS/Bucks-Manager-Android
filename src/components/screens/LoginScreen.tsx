import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { styles } from "../../styles/globalStyles";
import { Palette } from "../../theme/colors";
import { Text } from "../ui/AppText";
import { UiCopy } from "../../i18n";

export function LoginScreen({ colors, copy, loading, canConnect, onSignIn }: { colors: Palette; copy: UiCopy; loading: boolean; canConnect: boolean; onSignIn: () => void }) {
  return (
    <View style={styles.loginScreen}>
      <View style={[styles.loginMark, { backgroundColor: colors.primary }]}>
        <MaterialCommunityIcons name="sack" size={38} color={colors.onPrimary} />
      </View>
      <Text style={[styles.loginTitle, { color: colors.text }]}>Bucks Manager</Text>
      <Text style={{ fontSize: 13, fontWeight: "400", color: colors.muted, marginTop: 6 }}>{copy.loginSubtitle}</Text>
      <TouchableOpacity
        disabled={!canConnect || loading}
        onPress={onSignIn}
        style={[
          styles.googleLoginBtn,
          {
            backgroundColor: canConnect ? colors.primary : colors.disabled,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 2,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <>
            <MaterialCommunityIcons name="google" size={21} color={colors.onPrimary} />
            <Text style={[styles.googleLoginText, { color: colors.onPrimary }]}>{copy.signInWithGoogle}</Text>
          </>
        )}
      </TouchableOpacity>
      {!canConnect && <Text style={[styles.loginStatus, { color: colors.muted }]}>{copy.missingCredentials}</Text>}
    </View>
  );
}
