let _logger: ((message: string, context?: string) => void) | null = null;

export function setErrorLogger(logger: (message: string, context?: string) => void) {
  _logger = logger;
}

export function logError(error: unknown, context: string) {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (_logger) {
    _logger(message, context);
  }
}
