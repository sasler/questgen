import { NextRequest, NextResponse } from "next/server";
import { getSessionOwnerIds, resolveRequestSession } from "@/lib/auth-utils";
import { formatStorageError, getStorage } from "@/lib/storage";
import type { GameMetadata } from "@/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await resolveRequestSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIds = getSessionOwnerIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
  } catch (error) {
    return NextResponse.json({ error: formatStorageError(error) }, { status: 500 });
  }
}
