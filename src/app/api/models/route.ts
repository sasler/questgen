import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAvailableModels, getRecommendedModels } from "@/lib/models";
import type { AIProviderConfig } from "@/providers/types";
import { z } from "zod";

export const runtime = "nodejs";

const ByokModelsRequestSchema = z.object({
  provider: z.literal("byok"),
  byokProviderId: z.string().optional(),
  byokType: z.enum(["openai", "azure", "anthropic"]).optional(),
  byokBaseUrl: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const provider = searchParams.get("provider");

  if (provider !== "copilot") {
    return NextResponse.json(
      {
        error:
          "Missing or invalid provider parameter. Use GET for 'copilot' models and POST for BYOK models.",
      },
      { status: 400 },
    );
  }

  const config: AIProviderConfig = {
    mode: "copilot",
    githubToken: session.accessToken,
  };

  try {
    const result = await listAvailableModels(config);
    const recommended = getRecommendedModels(result.models);

    return NextResponse.json({
      models: result.models,
      recommended,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ByokModelsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid BYOK model request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const config: AIProviderConfig = {
    mode: "byok",
    byokProviderId: parsed.data.byokProviderId,
    byokType: parsed.data.byokType,
    byokBaseUrl: parsed.data.byokBaseUrl,
    byokApiKey: request.headers.get("x-byok-api-key") ?? undefined,
  };

  try {
    const result = await listAvailableModels(config);
    const recommended = getRecommendedModels(result.models);

    return NextResponse.json({
      models: result.models,
      recommended,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
