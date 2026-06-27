import * as SecureStore from "expo-secure-store";
import { logError } from "./errorHandler";

const PIN_ENABLED_KEY = "bucks_pin_enabled";
const PIN_KEY = "bucks_pin";

export async function isPinEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(PIN_ENABLED_KEY);
  return value === "1";
}

async function setPinEnabled(enabled: boolean): Promise<void> {
  if (!enabled) {
    await SecureStore.deleteItemAsync(PIN_KEY).catch((e) => logError(e, "pin:clearKey"));
  }
  await SecureStore.setItemAsync(PIN_ENABLED_KEY, enabled ? "1" : "0");
}

export async function savePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
  await setPinEnabled(true);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored === pin;
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY).catch((e) => logError(e, "pin:clearPin"));
  await setPinEnabled(false);
}
