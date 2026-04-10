import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAvailableModels, getRecommendedModels } from "@/lib/models";
import type { AIProviderConfig } from "@/providers/types";

export const runtime = "nodejs";

const VALID_PROVIDERS = new Set(["copilot", "byok"]);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const provider = searchParams.get("provider");

  if (!provider || !VALID_PROVIDERS.has(provider)) {
    return NextResponse.json(
      { error: "Missing or invalid provider parameter. Must be 'copilot' or 'byok'." },
      { status: 400 },
    );
  }

  const config: AIProviderConfig = { mode: provider as AIProviderConfig["mode"] };

  if (provider === "copilot") {
    config.githubToken = session.accessToken;
  } else {
    config.byokType = (searchParams.get("byokType") ?? undefined) as AIProviderConfig["byokType"];
    config.byokBaseUrl = searchParams.get("byokBaseUrl") ?? undefined;
    config.byokApiKey =
      searchParams.get("byokApiKey") ??
      request.headers.get("x-byok-api-key") ??
      undefined;
  }

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
