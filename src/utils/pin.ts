import * as SecureStore from "expo-secure-store";

const PIN_ENABLED_KEY = "bucks_pin_enabled";
const PIN_HASH_KEY = "bucks_pin";

function hashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(hash);
}

export async function isPinEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(PIN_ENABLED_KEY);
  return value === "1";
}

export async function setPinEnabled(enabled: boolean): Promise<void> {
  if (!enabled) {
    await SecureStore.deleteItemAsync(PIN_HASH_KEY).catch(() => undefined);
  }
  await SecureStore.setItemAsync(PIN_ENABLED_KEY, enabled ? "1" : "0");
}

export async function savePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_HASH_KEY, hashPin(pin));
  await setPinEnabled(true);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_HASH_KEY);
  if (!stored) return false;
  return stored === hashPin(pin);
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY).catch(() => undefined);
  await setPinEnabled(false);
}
