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
export const maxDuration = 60;

const RequestBodySchema = z.object({
  request: GameGenerationRequestSchema,
  settings: GameSettingsSchema,
  byokApiKey: z.string().optional(),
});

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

  const result = await generateWorld(request, settings, userId, aiConfig);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "World generation failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      gameId: result.gameId,
      ...(result.warnings?.length ? { warnings: result.warnings } : {}),
    },
    { status: 201 },
  );
}
