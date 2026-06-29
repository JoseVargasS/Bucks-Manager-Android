import { memo, useSyncExternalStore } from "react";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  TextInputProps,
  TextProps,
} from "react-native";
import { FontPreference } from "../../types";

let fontFamily = "DMSans";
let fontPreference: FontPreference = "dmsans";
const listeners = new Set<() => void>();

const FONT_SIZE_SCALE: Partial<Record<FontPreference, number>> = {
  sansi: 1.35,
  sfscribbledsans: 1.3,
  proggysquare: 1.4,
  comicsansms: 1.2,
};
const FONT_FAMILIES: Record<FontPreference, string> = {
  dmsans: "DMSans",
  serif: "serif",
  mono: "monospace",
  condensed: "sans-serif-condensed",
  light: "sans-serif-light",
  casual: "casual",
  cursive: "cursive",
  smallcaps: "sans-serif-smallcaps",
  inter: "Inter",
  fredoka: "Fredoka",
  jetbrainsmono: "JetBrainsMono",
  spacemono: "SpaceMono",
  orbitron: "Orbitron",
  playfair: "PlayfairDisplay",
  bebasneue: "BebasNeue",
  comicneue: "ComicNeue",
  sora: "Sora",
  patrickhand: "PatrickHand",
  plusjakartasans: "PlusJakartaSans",
  intervariable: "InterVariable",
  comicsansms: "ComicSansMS",
  proggysquare: "ProggySquare",
  redstarbold: "RedstarBold",
  sansi: "SANSI",
  sfscribbledsans: "SFScribbledSans",
};

export function setAppFontPreference(preference: FontPreference) {
  const next = getAppFontFamily(preference);
  if (next === fontFamily && preference === fontPreference) return;
  fontFamily = next;
  fontPreference = preference;
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

function useAppFontPreference() {
  return useSyncExternalStore(
    subscribe,
    () => fontPreference,
    () => fontPreference,
  );
}

function TextImpl({ style, ...props }: TextProps) {
  const family = useAppFontFamily();
  const preference = useAppFontPreference();
  const scale = FONT_SIZE_SCALE[preference] || 1;
  if (scale !== 1) {
    const flat = StyleSheet.flatten(style);
    const baseSize = typeof flat?.fontSize === "number" ? flat.fontSize : 16;
    const adjustedSize = Math.round(baseSize * scale);
    return (
      <NativeText
        {...props}
        style={[{ fontFamily: family }, style, { fontSize: adjustedSize }]}
      />
    );
  }
  return <NativeText {...props} style={[{ fontFamily: family }, style]} />;
}

function TextInputImpl({ style, ...props }: TextInputProps) {
  const family = useAppFontFamily();
  const preference = useAppFontPreference();
  const scale = FONT_SIZE_SCALE[preference] || 1;
  if (scale !== 1) {
    const flat = StyleSheet.flatten(style);
    const baseSize = typeof flat?.fontSize === "number" ? flat.fontSize : 16;
    const adjustedSize = Math.round(baseSize * scale);
    return (
      <NativeTextInput
        {...props}
        style={[{ fontFamily: family }, style, { fontSize: adjustedSize }]}
      />
    );
  }
  return <NativeTextInput {...props} style={[{ fontFamily: family }, style]} />;
}

export const Text = memo(TextImpl);
export const TextInput = memo(TextInputImpl);
