export function logError(error: unknown, context: string) {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (typeof __DEV__ === "undefined" || __DEV__) {
    // eslint-disable-next-line no-console
    console.error(`[${context}]`, message);
  }
}
