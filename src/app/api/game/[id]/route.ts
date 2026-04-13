import { NextRequest, NextResponse } from "next/server";
import { getSessionOwnerIds, resolveRequestSession, sessionOwnsUserId } from "@/lib/auth-utils";
import { formatStorageError, getStorage } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  const session = await resolveRequestSession(request);
  if (!session?.user || getSessionOwnerIds(session).length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const storage = getStorage();
    const metadata = await storage.getMetadata(id);

    if (!metadata) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (!sessionOwnsUserId(session, metadata.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [world, player, history, settings] = await Promise.all([
      storage.getWorld(id),
      storage.getPlayerState(id),
      storage.getHistory(id),
      storage.getSettings(id),
    ]);

    return NextResponse.json({ metadata, world, player, history, settings });
  } catch (error) {
    return NextResponse.json({ error: formatStorageError(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
) {
  const session = await resolveRequestSession(request);
  if (!session?.user || getSessionOwnerIds(session).length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const storage = getStorage();
    const metadata = await storage.getMetadata(id);

    if (!metadata) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (!sessionOwnsUserId(session, metadata.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await storage.deleteGame(id, metadata.userId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: formatStorageError(error) }, { status: 500 });
  }
}
