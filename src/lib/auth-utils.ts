import { auth } from "./auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

type SessionWithUser = Pick<Session, "user">;

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
    const session = await requireAuth();
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
