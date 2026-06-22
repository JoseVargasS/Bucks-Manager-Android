import { useSyncExternalStore } from "react";
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  TextInputProps,
  TextProps,
} from "react-native";
import { FontPreference } from "../../types";

let fontFamily = "DMSans";
const listeners = new Set<() => void>();
const FONT_FAMILIES: Record<FontPreference, string> = {
  dmsans: "DMSans",
  serif: "serif",
  mono: "monospace",
  condensed: "sans-serif-condensed",
  light: "sans-serif-light",
  casual: "casual",
  cursive: "cursive",
  smallcaps: "sans-serif-smallcaps",
};

export function setAppFontPreference(preference: FontPreference) {
  const next = getAppFontFamily(preference);
  if (next === fontFamily) return;
  fontFamily = next;
  listeners.forEach((listener) => listener());
}

export function getAppFontFamily(preference: FontPreference) {
  return FONT_FAMILIES[preference];
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppFontFamily() {
  return useSyncExternalStore(
    subscribe,
    () => fontFamily,
    () => fontFamily,
  );
}

export function Text({ style, ...props }: TextProps) {
  const family = useAppFontFamily();
  return <NativeText {...props} style={[{ fontFamily: family }, style]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  const family = useAppFontFamily();
  return <NativeTextInput {...props} style={[{ fontFamily: family }, style]} />;
}
