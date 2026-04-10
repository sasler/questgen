// ── Typed error classes ─────────────────────────────────────────────

export class QuestGenError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = "QuestGenError";
  }
}

export class AuthenticationError extends QuestGenError {
  constructor(message = "Authentication required") {
    super(message, "AUTH_REQUIRED", 401);
  }
}

export class AuthorizationError extends QuestGenError {
  constructor(message = "Access denied") {
    super(message, "ACCESS_DENIED", 403);
  }
}

export class NotFoundError extends QuestGenError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends QuestGenError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class AIError extends QuestGenError {
  constructor(message: string) {
    super(message, "AI_ERROR", 502);
  }
}

export class ConcurrencyError extends QuestGenError {
  constructor(message = "State conflict — please retry") {
    super(message, "CONCURRENCY_ERROR", 409);
  }
}

// ── Utility: API error handler ──────────────────────────────────────

export function handleApiError(error: unknown): {
  message: string;
  code: string;
  statusCode: number;
} {
  if (error instanceof QuestGenError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    };
  }
  if (error instanceof Error) {
    return { message: error.message, code: "INTERNAL_ERROR", statusCode: 500 };
  }
  return {
    message: "An unexpected error occurred",
    code: "UNKNOWN_ERROR",
    statusCode: 500,
  };
}

// ── Utility: Retry with back-off ────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 500,
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}
