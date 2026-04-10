import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import type { GameMetadata } from "@/types";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.email;
  const storage = getStorage();
  const gameIds = await storage.getUserGames(userId);

  const metadataResults = await Promise.all(
    gameIds.map((id) => storage.getMetadata(id))
  );

  const games: GameMetadata[] = metadataResults
    .filter((m): m is GameMetadata => m !== null)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);

  return NextResponse.json({ games });
}
