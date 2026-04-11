import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSessionOwnerIds } from "@/lib/auth-utils";
import { getStorage } from "@/lib/storage";
import type { GameMetadata } from "@/types";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIds = getSessionOwnerIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storage = getStorage();
  const gameIds = [
    ...new Set((await Promise.all(userIds.map((userId) => storage.getUserGames(userId)))).flat()),
  ];

  const metadataResults = await Promise.all(
    gameIds.map((id) => storage.getMetadata(id))
  );

  const games: GameMetadata[] = metadataResults
    .filter((m): m is GameMetadata => m !== null)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);

  return NextResponse.json({ games });
}
