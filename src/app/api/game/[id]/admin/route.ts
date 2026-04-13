import { NextRequest, NextResponse } from "next/server";
import { getSessionOwnerIds, resolveRequestSession, sessionOwnsUserId } from "@/lib/auth-utils";
import { generateAdminDebugResponse } from "@/lib/admin-debug";
import { formatStorageError, getStorage } from "@/lib/storage";
import type { AIProviderConfig } from "@/providers/types";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await resolveRequestSession(request);
  if (!session?.user || getSessionOwnerIds(session).length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { question?: string; byokApiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json(
      { error: "question is required" },
      { status: 400 },
    );
  }

  const { id: gameId } = await params;

  try {
    const storage = getStorage();
    const metadata = await storage.getMetadata(gameId);
    if (!metadata) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (!sessionOwnsUserId(session, metadata.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const settings = await storage.getSettings(gameId);
    if (!settings) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const aiConfig: AIProviderConfig =
      settings.provider === "copilot"
        ? { mode: "copilot", githubToken: session.accessToken }
        : {
            mode: "byok",
            byokType: settings.byokConfig?.type,
            byokBaseUrl: settings.byokConfig?.baseUrl,
            byokApiKey: body.byokApiKey,
          };

    const response = await generateAdminDebugResponse(
      gameId,
      question,
      aiConfig,
      settings,
      storage,
    );

    return NextResponse.json({ response });
  } catch (error) {
    return NextResponse.json(
      { error: formatStorageError(error) },
      { status: 500 },
    );
  }
}
