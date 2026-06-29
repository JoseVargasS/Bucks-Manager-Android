export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function isAuthError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);
  return (
    message.includes("401") ||
    message.includes("403") ||
    message.toLowerCase().includes("permiso")
  );
}

export function shouldRescanForSheetError(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  return (
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("unable to parse range") ||
    message.includes("no se encontro") ||
    message.includes("no se encontró")
  );
}
