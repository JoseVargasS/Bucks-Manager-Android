import { useEffect, useRef, useState } from "react";
import { Animated, TouchableOpacity, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Palette } from "../../theme/colors";
import { PIN_LENGTH } from "../../theme/constants";
import { UiCopy } from "../../i18n";
import { Text } from "../ui/AppText";

const KEY_W = 68;
const KEY_H = 52;
const DOT_SIZE = 18;
const DOT_GAP = 14;

export function PinScreen({ colors, copy, title, subtitle, wrong, bgColor, onFill }: {
  colors: Palette;
  copy: UiCopy;
  title?: string;
  subtitle?: string;
  wrong: boolean;
  bgColor?: string;
  onFill: (pin: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>([]);
  const [showingError, setShowingError] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const filled = digits.length === PIN_LENGTH;

  useEffect(() => {
    if (filled) onFill(digits.join(""));
  }, [digits.length]);

  useEffect(() => {
    if (wrong && !showingError) {
      setShowingError(true);
      setDigits([]);
      Animated.sequence([
        Animated.timing(shake, { toValue: 12, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -12, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 8, duration: 40, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -8, duration: 40, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 30, useNativeDriver: true }),
      ]).start(() => setShowingError(false));
    }
  }, [wrong]);

  function pressDigit(d: string) {
    if (filled || showingError) return;
    setDigits((prev) => [...prev, d]);
  }

  function pressBackspace() {
    if (showingError) return;
    setDigits((prev) => prev.slice(0, -1));
  }

  const keyStyle = { width: KEY_W, height: KEY_H, borderRadius: 14, backgroundColor: colors.input, alignItems: "center" as const, justifyContent: "center" as const };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28, backgroundColor: bgColor }}>
      {title ? (
        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 8, textAlign: "center" }}>{title}</Text>
      ) : null}
      {subtitle ? (
        <Text style={{ fontSize: 14, fontWeight: "500", color: colors.textSub, marginBottom: 28, textAlign: "center", paddingHorizontal: 12 }}>{subtitle}</Text>
      ) : (
        <View style={{ marginBottom: 28 }} />
      )}

      <Animated.View style={{ flexDirection: "row", gap: DOT_GAP, marginBottom: 36, transform: [{ translateX: shake }] }}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => i).map((i) => {
          const dot = digits.length > i;
          return (
            <View
              key={i}
              style={{
                width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2,
                backgroundColor: dot ? (showingError ? colors.red : colors.primary) : "transparent",
                borderWidth: dot ? 0 : 2,
                borderColor: colors.borderStrong,
              }}
            />
          );
        })}
      </Animated.View>

      {showingError && (
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.red, marginBottom: 16 }}>{copy.pinIncorrect}</Text>
      )}

      <View style={{ gap: 10, alignItems: "center" }}>
        {[["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]].map((row, rowIndex) => (
          <View key={rowIndex} style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
            {row.map((d) => (
              <TouchableOpacity key={d} activeOpacity={0.6} onPress={() => pressDigit(d)} style={keyStyle}>
                <Text style={{ fontSize: 22, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] }}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
          <TouchableOpacity activeOpacity={0.6} onPress={pressBackspace} style={keyStyle}>
            <MaterialCommunityIcons name="backspace-outline" size={22} color={colors.text} />
          </TouchableOpacity>
<TouchableOpacity activeOpacity={0.6} onPress={() => pressDigit("0")} style={keyStyle}>
            <Text style={{ fontSize: 22, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] }}>0</Text>
          </TouchableOpacity>
          <View style={{ width: KEY_W, height: KEY_H }} />
        </View>
      </View>
    </View>
  );
}

