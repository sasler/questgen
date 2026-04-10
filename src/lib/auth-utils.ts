import { auth } from "./auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

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
