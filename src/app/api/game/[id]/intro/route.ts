import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSessionOwnerIds, sessionOwnsUserId } from "@/lib/auth-utils";
import { generateOpeningNarration } from "@/lib/opening-narration";
import { formatStorageError, getStorage } from "@/lib/storage";
import type { AIProviderConfig } from "@/providers/types";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || getSessionOwnerIds(session).length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { byokApiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
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

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        try {
          const entry = await generateOpeningNarration(
            gameId,
            aiConfig,
            settings,
            storage,
            undefined,
            (chunk) => send({ type: "chunk", chunk }),
          );
          send({ type: "final", entry });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Opening narration failed";
          send({ type: "error", error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: formatStorageError(error) }, { status: 500 });
  }
}
