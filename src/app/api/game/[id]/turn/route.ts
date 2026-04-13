import { NextRequest, NextResponse } from "next/server";
import { getSessionOwnerIds, resolveRequestSession, sessionOwnsUserId } from "@/lib/auth-utils";
import { processTurn } from "@/lib/turn-processor";
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

  let body: { input?: string; turnId?: string; byokApiKey?: string; stream?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.input) {
    return NextResponse.json({ error: "input is required" }, { status: 400 });
  }
  if (!body.turnId) {
    return NextResponse.json(
      { error: "turnId is required" },
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

    if (!body.stream) {
      const result = await processTurn(
        gameId,
        body.input,
        body.turnId,
        aiConfig,
        settings,
        storage,
      );
      return NextResponse.json(result);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        try {
          const result = await processTurn(
            gameId,
            body.input!,
            body.turnId!,
            aiConfig,
            settings,
            storage,
            undefined,
            (chunk) => send({ type: "chunk", chunk }),
          );
          send({ type: "final", result });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Turn processing failed";
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
    const message =
      error instanceof Error ? error.message : "Turn processing failed";
    const normalized =
      message.startsWith("Storage failed:")
        ? message
        : formatStorageError(error).includes("Missing Upstash Redis configuration")
          ? formatStorageError(error)
          : message;
    return NextResponse.json({ error: normalized }, { status: 500 });
  }
}
