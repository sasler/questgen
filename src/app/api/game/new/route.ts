import { NextResponse } from "next/server";
import { getPrimarySessionOwnerId, resolveRequestSession } from "@/lib/auth-utils";
import { generateWorld } from "@/lib/world-gen";
import {
  GameGenerationRequestSchema,
  GameSettingsSchema,
} from "@/types";
import type { AIProviderConfig } from "@/providers/types";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestBodySchema = z.object({
  request: GameGenerationRequestSchema,
  settings: GameSettingsSchema,
  byokApiKey: z.string().optional(),
});

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: Request): Promise<Response> {
  const session = await resolveRequestSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getPrimarySessionOwnerId(session);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { request, settings, byokApiKey } = parsed.data;

  let aiConfig: AIProviderConfig;
  if (settings.provider === "copilot") {
    if (!session.accessToken) {
      return NextResponse.json(
        {
          error:
            "GitHub Copilot access token is missing. Please reconnect GitHub Copilot and try again.",
        },
        { status: 401 },
      );
    }

    aiConfig = {
      mode: "copilot",
      githubToken: session.accessToken,
    };
  } else {
    aiConfig = {
      mode: "byok",
      byokType: settings.byokConfig?.type,
      byokBaseUrl: settings.byokConfig?.baseUrl,
      byokApiKey,
    };
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await generateWorld(
          request,
          settings,
          userId,
          aiConfig,
          undefined,
          undefined,
          (stage, message) => {
            controller.enqueue(sseEvent("progress", { stage, message }));
          },
        );

        if (!result.success) {
          controller.enqueue(
            sseEvent("error", { message: result.error ?? "World generation failed" }),
          );
        } else {
          controller.enqueue(
            sseEvent("complete", {
              gameId: result.gameId,
              ...(result.warnings?.length ? { warnings: result.warnings } : {}),
            }),
          );
        }
      } catch (error) {
        controller.enqueue(
          sseEvent("error", {
            message:
              error instanceof Error
                ? `World generation failed: ${error.message}`
                : "World generation failed",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
