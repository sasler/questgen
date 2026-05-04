import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "./auth";
import {
  resolveRequestSession,
} from "./auth-utils";
import {
  GUEST_ID_HEADER,
  GUEST_ID_STORAGE_KEY,
  getGuestRequestHeaders,
} from "./guest";

const mockAuth = vi.mocked(auth);

describe("guest request ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a guest request header to a synthetic owner session", async () => {
    mockAuth.mockResolvedValue(null as never);
    const request = new Request("http://localhost/api/games", {
      headers: { [GUEST_ID_HEADER]: "550e8400-e29b-41d4-a716-446655440000" },
    });

    const session = await resolveRequestSession(request);

    expect(session?.user?.id).toBe("guest:550e8400-e29b-41d4-a716-446655440000");
    expect(session?.user?.email).toBe("guest:550e8400-e29b-41d4-a716-446655440000");
  });

  it("ignores malformed guest IDs", async () => {
    mockAuth.mockResolvedValue(null as never);
    const request = new Request("http://localhost/api/games", {
      headers: { [GUEST_ID_HEADER]: "../not-valid" },
    });

    await expect(resolveRequestSession(request)).resolves.toBeNull();
  });

  it("preserves guest ownership on an authenticated session", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "github-user", email: "user@example.com" },
      expires: "2999-01-01T00:00:00.000Z",
    } as never);
    const request = new Request("http://localhost/api/games", {
      headers: { [GUEST_ID_HEADER]: "550e8400-e29b-41d4-a716-446655440000" },
    });

    const session = await resolveRequestSession(request);

    expect(session?.user?.id).toBe("github-user");
    expect(session?.guestOwnerId).toBe("guest:550e8400-e29b-41d4-a716-446655440000");
  });

  it("builds browser headers from a persisted guest ID", () => {
    const storage: Record<string, string> = {
      [GUEST_ID_STORAGE_KEY]: "550e8400-e29b-41d4-a716-446655440000",
    };
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value;
      }),
    });

    expect(getGuestRequestHeaders()).toEqual({
      [GUEST_ID_HEADER]: "550e8400-e29b-41d4-a716-446655440000",
    });
  });
});
