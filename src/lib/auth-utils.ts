import { auth } from "./auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { GUEST_ID_HEADER } from "./guest";

type SessionWithUser = Pick<Session, "user">;
const E2E_AUTH_COOKIE = "questgen-e2e-auth";
const GUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readCookieValue(request: Request, name: string): string | null {
  const nextRequest = request as Request & {
    cookies?: { get?: (cookieName: string) => { value?: string } | undefined };
  };
  const cookieStoreValue = nextRequest.cookies?.get?.(name)?.value;
  if (typeof cookieStoreValue === "string" && cookieStoreValue.length > 0) {
    return cookieStoreValue;
  }

  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }

  for (const segment of header.split(";")) {
    const [rawName, ...rawValueParts] = segment.trim().split("=");
    if (rawName !== name) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();
    if (rawValue.length === 0) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return null;
    }
  }

  return null;
}

function isE2EAuthBypassEnabled(): boolean {
  return process.env.QUESTGEN_E2E_AUTH_BYPASS === "1";
}

function isLocalE2EBypassRequest(request: Request): boolean {
  try {
    const { hostname } = new URL(request.url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

function buildE2EBypassSession(userId: string): Session {
  return {
    user: {
      id: userId,
      email: `${userId}@e2e.questgen.local`,
      name: "QuestGen E2E Operator",
    },
    accessToken: "questgen-e2e-access-token",
    expires: "2999-01-01T00:00:00.000Z",
  };
}

function buildGuestSession(guestId: string): Session {
  const ownerId = `guest:${guestId}`;
  return {
    guestOwnerId: ownerId,
    user: {
      id: ownerId,
      email: ownerId,
      name: "Guest Adventurer",
    },
    expires: "2999-01-01T00:00:00.000Z",
  };
}

function getGuestOwnerId(request: Request): string | null {
  const guestId = request.headers.get(GUEST_ID_HEADER)?.trim();
  if (!guestId || !GUEST_ID_PATTERN.test(guestId)) {
    return null;
  }

  return `guest:${guestId}`;
}

function getGuestSession(request: Request): Session | null {
  const guestOwnerId = getGuestOwnerId(request);
  if (!guestOwnerId) return null;
  return buildGuestSession(guestOwnerId.replace(/^guest:/, ""));
}

export function getE2EBypassSession(request: Request): Session | null {
  if (!isE2EAuthBypassEnabled()) {
    return null;
  }

  if (!isLocalE2EBypassRequest(request)) {
    return null;
  }

  const userId =
    readCookieValue(request, E2E_AUTH_COOKIE) ??
    process.env.QUESTGEN_E2E_AUTH_USER_ID;
  if (!userId) {
    return null;
  }

  return buildE2EBypassSession(userId);
}

export async function resolveRequestSession(
  request?: Request,
): Promise<Session | null> {
  const session = await auth();
  if (session?.user) {
    const guestOwnerId = request ? getGuestOwnerId(request) : null;
    return guestOwnerId ? { ...session, guestOwnerId } : session;
  }

  if (!request) return null;

  return getE2EBypassSession(request) ?? getGuestSession(request);
}

// Get authenticated session or return null
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  return session;
}

// Middleware-style wrapper for API routes
export function withAuth(
  handler: (req: Request, session: Session) => Promise<Response>,
) {
  return async (req: Request) => {
    const session = await resolveRequestSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req, session);
  };
}

export function getSessionOwnerIds(session: SessionWithUser): string[] {
  const sessionWithGuest = session as SessionWithUser & { guestOwnerId?: string };
  const ids = [session.user?.id, session.user?.email, sessionWithGuest.guestOwnerId].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return [...new Set(ids)];
}

export function getPrimarySessionOwnerId(session: SessionWithUser): string | null {
  return getSessionOwnerIds(session)[0] ?? null;
}

export function sessionOwnsUserId(session: SessionWithUser, userId: string): boolean {
  return getSessionOwnerIds(session).includes(userId);
}
