import { describe, it, expect, vi } from "vitest";
import {
  QuestGenError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  AIError,
  ConcurrencyError,
  handleApiError,
  withRetry,
} from "./error-handling";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------
describe("Error classes", () => {
  it("QuestGenError has correct code, statusCode, and message", () => {
    const err = new QuestGenError("boom", "CUSTOM", 418);
    expect(err.message).toBe("boom");
    expect(err.code).toBe("CUSTOM");
    expect(err.statusCode).toBe(418);
    expect(err.name).toBe("QuestGenError");
    expect(err).toBeInstanceOf(Error);
  });

  it("AuthenticationError defaults", () => {
    const err = new AuthenticationError();
    expect(err.message).toBe("Authentication required");
    expect(err.code).toBe("AUTH_REQUIRED");
    expect(err.statusCode).toBe(401);
  });

  it("AuthorizationError defaults", () => {
    const err = new AuthorizationError();
    expect(err.message).toBe("Access denied");
    expect(err.code).toBe("ACCESS_DENIED");
    expect(err.statusCode).toBe(403);
  });

  it("NotFoundError defaults", () => {
    const err = new NotFoundError();
    expect(err.message).toBe("Resource not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.statusCode).toBe(404);
  });

  it("ValidationError has correct fields", () => {
    const err = new ValidationError("bad input");
    expect(err.message).toBe("bad input");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.statusCode).toBe(400);
  });

  it("AIError has correct fields", () => {
    const err = new AIError("model timeout");
    expect(err.message).toBe("model timeout");
    expect(err.code).toBe("AI_ERROR");
    expect(err.statusCode).toBe(502);
  });

  it("ConcurrencyError defaults", () => {
    const err = new ConcurrencyError();
    expect(err.message).toBe("State conflict — please retry");
    expect(err.code).toBe("CONCURRENCY_ERROR");
    expect(err.statusCode).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// handleApiError
// ---------------------------------------------------------------------------
describe("handleApiError", () => {
  it("extracts info from QuestGenError", () => {
    const err = new ValidationError("missing name");
    const result = handleApiError(err);
    expect(result).toEqual({
      message: "missing name",
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
  });

  it("handles plain Error", () => {
    const err = new Error("something broke");
    const result = handleApiError(err);
    expect(result).toEqual({
      message: "something broke",
      code: "INTERNAL_ERROR",
      statusCode: 500,
    });
  });

  it("handles non-Error values", () => {
    const result = handleApiError("string error");
    expect(result).toEqual({
      message: "An unexpected error occurred",
      code: "UNKNOWN_ERROR",
      statusCode: 500,
    });
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------
describe("withRetry", () => {
  it("succeeds on first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 2, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(withRetry(fn, 2, 10)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("wraps non-Error throws", async () => {
    const fn = vi.fn().mockRejectedValue("string error");

    await expect(withRetry(fn, 0, 10)).rejects.toThrow("string error");
  });
});
