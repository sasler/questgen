import { NextResponse } from "next/server";
import { auth, isAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const authConfigured = isAuthConfigured();
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({
      authConfigured,
      github: { connected: false },
      copilot: { available: false },
    });
  }

  const githubStatus = {
    connected: true,
    username: session.user.name ?? session.user.email ?? "Unknown",
    avatar: session.user.image ?? null,
  };

  return NextResponse.json({
    authConfigured,
    github: githubStatus,
    copilot: {
      available: Boolean(session.accessToken),
    },
  });
}
