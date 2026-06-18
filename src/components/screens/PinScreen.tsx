import { useEffect, useRef, useState } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Palette } from "../../theme/colors";

const KEY_W = 68;
const KEY_H = 52;
const DOT_SIZE = 18;
const DOT_GAP = 14;

export function PinScreen({ colors, title, subtitle, wrong, bgColor, onFill, confirmPhase, onConfirm }: {
  colors: Palette;
  title?: string;
  subtitle?: string;
  wrong: boolean;
  bgColor?: string;
  onFill: (pin: string) => void;
  confirmPhase?: boolean;
  onConfirm?: () => void;
}) {
  const [digits, setDigits] = useState<string[]>([]);
  const [showingError, setShowingError] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const hasConfirm = confirmPhase && onConfirm;
  const filled = digits.length === 4;

  useEffect(() => {
    if (filled) {
      onFill(digits.join(""));
    }
  }, [digits]);

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
        {[0, 1, 2, 3].map((i) => {
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
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.red, marginBottom: 16 }}>PIN incorrecto</Text>
      )}

      <View style={{ gap: 10, alignItems: "center" }}>
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
          <KeyButton colors={colors} onPress={() => pressDigit("1")}><KeyLabel colors={colors}>1</KeyLabel></KeyButton>
          <KeyButton colors={colors} onPress={() => pressDigit("2")}><KeyLabel colors={colors}>2</KeyLabel></KeyButton>
          <KeyButton colors={colors} onPress={() => pressDigit("3")}><KeyLabel colors={colors}>3</KeyLabel></KeyButton>
        </View>
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
          <KeyButton colors={colors} onPress={() => pressDigit("4")}><KeyLabel colors={colors}>4</KeyLabel></KeyButton>
          <KeyButton colors={colors} onPress={() => pressDigit("5")}><KeyLabel colors={colors}>5</KeyLabel></KeyButton>
          <KeyButton colors={colors} onPress={() => pressDigit("6")}><KeyLabel colors={colors}>6</KeyLabel></KeyButton>
        </View>
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
          <KeyButton colors={colors} onPress={() => pressDigit("7")}><KeyLabel colors={colors}>7</KeyLabel></KeyButton>
          <KeyButton colors={colors} onPress={() => pressDigit("8")}><KeyLabel colors={colors}>8</KeyLabel></KeyButton>
          <KeyButton colors={colors} onPress={() => pressDigit("9")}><KeyLabel colors={colors}>9</KeyLabel></KeyButton>
        </View>
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
          <KeyButton colors={colors} onPress={pressBackspace}>
            <MaterialCommunityIcons name="backspace-outline" size={22} color={colors.text} />
          </KeyButton>
          <KeyButton colors={colors} onPress={() => pressDigit("0")}><KeyLabel colors={colors}>0</KeyLabel></KeyButton>
          {hasConfirm ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={filled ? onConfirm : undefined}
              disabled={!filled}
              style={{
                width: KEY_W, height: KEY_H, borderRadius: 14,
                backgroundColor: filled ? colors.primary : colors.input,
                alignItems: "center", justifyContent: "center",
              }}
            >
              <MaterialCommunityIcons name="check" size={24} color={filled ? colors.onPrimary : colors.muted} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: KEY_W, height: KEY_H }} />
          )}
        </View>
      </View>
    </View>
  );
}

function KeyButton({ colors, onPress, children }: { colors: Palette; onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      style={{ width: KEY_W, height: KEY_H, borderRadius: 14, backgroundColor: colors.input, alignItems: "center", justifyContent: "center" }}
    >
      {children}
    </TouchableOpacity>
  );
}

function KeyLabel({ colors, children }: { colors: Palette; children: string }) {
  return <Text style={{ fontSize: 22, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] }}>{children}</Text>;
}
