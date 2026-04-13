import { auth } from "./auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

type SessionWithUser = Pick<Session, "user">;
const E2E_AUTH_COOKIE = "questgen-e2e-auth";

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

export function getE2EBypassSession(request: Request): Session | null {
  if (!isE2EAuthBypassEnabled()) {
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
    return session;
  }

  return request ? getE2EBypassSession(request) : null;
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
  const ids = [session.user?.id, session.user?.email].filter(
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
