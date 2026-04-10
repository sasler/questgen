import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({
      github: { connected: false },
      copilot: { available: false },
    });
  }

  const githubStatus = {
    connected: true,
    username: session.user.name ?? session.user.email ?? "Unknown",
    avatar: session.user.image ?? null,
  };

  let copilotAvailable = false;
  let copilotError: string | null = null;

  if (session.accessToken) {
    try {
      const { getAIProvider } = await import("@/providers");
      const provider = getAIProvider();
      const models = await provider.listModels({
        mode: "copilot",
        githubToken: session.accessToken,
      });
      copilotAvailable = models.length > 0;
    } catch (err) {
      copilotError = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return NextResponse.json({
    github: githubStatus,
    copilot: {
      available: copilotAvailable,
      error: copilotError,
    },
  });
}
