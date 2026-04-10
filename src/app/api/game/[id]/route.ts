import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const storage = getStorage();
  const metadata = await storage.getMetadata(id);

  if (!metadata) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (metadata.userId !== session.user.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [world, player, history, settings] = await Promise.all([
    storage.getWorld(id),
    storage.getPlayerState(id),
    storage.getHistory(id),
    storage.getSettings(id),
  ]);

  return NextResponse.json({ metadata, world, player, history, settings });
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.email;
  const storage = getStorage();
  const metadata = await storage.getMetadata(id);

  if (!metadata) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (metadata.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await storage.deleteGame(id, userId);
  return NextResponse.json({ deleted: true });
}
