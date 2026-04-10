"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PanelFrame } from "@/components";
import type { GameMetadata } from "@/types";

function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function GameCard({
  game,
  onDelete,
}: {
  game: GameMetadata;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const truncatedDesc =
    game.description.length > 100
      ? game.description.slice(0, 100) + "…"
      : game.description;

  return (
    <div className="border border-[#1a3a1a] bg-[#0d1a0d] p-4 font-mono hover:border-[#00ff41] transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[#00ff41] font-bold text-base truncate">
              {game.title}
            </h3>
            {game.completed && (
              <span className="text-[#ffb000] text-xs border border-[#ffb000] px-1 shrink-0">
                ✓ COMPLETED
              </span>
            )}
            <span className="text-[#4a6741] text-xs border border-[#1a3a1a] px-1 uppercase shrink-0">
              {game.size}
            </span>
          </div>
          <p className="text-[#4a6741] text-sm mt-1">{truncatedDesc}</p>
          <div className="flex gap-4 mt-2 text-xs text-[#4a6741]">
            <span>{game.turnCount} turns</span>
            <span>Last played: {relativeTime(game.lastPlayedAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Link
          href={`/game/${game.id}`}
          className="border border-[#00ff41] text-[#00ff41] px-3 py-1 text-sm hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
        >
          Continue
        </Link>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="border border-[#ff4444] text-[#ff4444] px-3 py-1 text-sm hover:bg-[#ff4444] hover:text-[#0a0a0a] transition-colors"
          >
            Delete
          </button>
        ) : (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-[#ff4444]">Are you sure?</span>
            <button
              onClick={() => onDelete(game.id)}
              className="border border-[#ff4444] text-[#ff4444] px-2 py-0.5 text-xs hover:bg-[#ff4444] hover:text-[#0a0a0a] transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="border border-[#4a6741] text-[#4a6741] px-2 py-0.5 text-xs hover:bg-[#4a6741] hover:text-[#0a0a0a] transition-colors"
            >
              No
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [games, setGames] = useState<GameMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((data) => setGames(data.games ?? []))
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/game/${id}`, { method: "DELETE" });
    if (res.ok) {
      setGames((prev) => prev.filter((g) => g.id !== id));
    }
  }, []);

  const userName = session?.user?.name ?? "Adventurer";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#00ff41] font-mono p-4 md:p-8">
      {/* Header */}
      <header className="text-center mb-8">
        <pre className="text-[#00ff41] text-xs sm:text-sm leading-tight glow-text inline-block">
{`
 ██████  ██    ██ ███████ ███████ ████████  ██████  ███████ ███    ██
██    ██ ██    ██ ██      ██         ██    ██       ██      ████   ██
██    ██ ██    ██ █████   ███████    ██    ██   ███ █████   ██ ██  ██
██ ▄▄ ██ ██    ██ ██           ██    ██    ██    ██ ██      ██  ██ ██
 ██████   ██████  ███████ ███████    ██     ██████  ███████ ██   ████
    ▀▀
`}
        </pre>
        <p className="text-[#4a6741] mt-2">
          Welcome back, <span className="text-[#ffb000]">{userName}</span>
        </p>
      </header>

      {/* Action buttons */}
      <nav className="flex flex-wrap justify-center gap-3 mb-8">
        <Link
          href="/new-game"
          className="border border-[#00ff41] text-[#00ff41] px-4 py-2 text-sm font-bold hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
        >
          [ New Game ]
        </Link>
        <Link
          href="/settings"
          className="border border-[#4a6741] text-[#4a6741] px-4 py-2 text-sm font-bold hover:bg-[#4a6741] hover:text-[#0a0a0a] transition-colors"
        >
          [ Settings ]
        </Link>
        <Link
          href="/guide"
          className="border border-[#ffb000] text-[#ffb000] px-4 py-2 text-sm font-bold hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
        >
          [ How to Get Copilot ]
        </Link>
      </nav>

      {/* Saved Games */}
      <PanelFrame title="SAVED GAMES" className="max-w-4xl mx-auto">
        {loading ? (
          <div className="text-center py-8 text-[#4a6741]">
            <p className="animate-pulse">Loading saved games...</p>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#4a6741] text-lg mb-4">
              No adventures yet. The universe awaits.
            </p>
            <Link
              href="/new-game"
              className="inline-block border border-[#00ff41] text-[#00ff41] px-6 py-2 text-sm font-bold hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
            >
              [ Start New Game ]
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
            {games.map((game) => (
              <GameCard key={game.id} game={game} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </PanelFrame>
    </div>
  );
}
