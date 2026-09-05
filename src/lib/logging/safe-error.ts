export function logSafeError(message: string, error: unknown) {
  console.error(message, sanitizeError(error));
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redact(error.message),
      stack: error.stack ? redact(error.stack) : undefined,
      cause: sanitizeCause(error.cause),
    };
  }

  return redact(String(error));
}

function sanitizeCause(cause: unknown) {
  if (!cause) {
    return undefined;
  }

  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: redact(cause.message),
    };
  }

  return redact(String(cause));
}

function redact(value: string) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[REDACTED]@")
    .replace(/(DATABASE_URL|DIRECT_URL)=\S+/g, "$1=[REDACTED]")
    .replace(/password=[^&\s]+/gi, "password=[REDACTED]");
}
