export function logError(error: unknown, context: string) {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, message);
}
