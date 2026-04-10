"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  GameLayout,
  Terminal,
  CommandInput,
  AsciiMap,
  InventoryPanel,
  RoomInfoPanel,
} from "@/components";
import { getAvailableExits } from "@/engine";
import { loadSettings } from "@/lib/settings";
import type {
  GameWorld,
  PlayerState,
  TurnEntry,
  Item,
} from "@/types";

const WELCOME_MESSAGE = `     QUESTGEN - AI TEXT ADVENTURE     

  "Don't Panic."                      

  Type commands to interact.          
  Try: look, go north, take key,     
       use key on door, talk to Bob`;

interface TurnResult {
  success: boolean;
  narrative: string;
  actionResults: unknown[];
  newPlayerState: PlayerState;
  worldChanged: boolean;
  gameWon: boolean;
  error?: string;
}

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;

  // Core game state
  const [world, setWorld] = useState<GameWorld | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [history, setHistory] = useState<TurnEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [gameWon, setGameWon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load game state on mount
  useEffect(() => {
    let cancelled = false;

    async function loadGame() {
      try {
        const res = await fetch(`/api/game/${gameId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load game (${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;

        setWorld(data.world);
        setPlayer(data.player);
        setHistory(data.history ?? []);
        // Rebuild command history from existing history
        const cmds = (data.history ?? [])
          .filter((e: TurnEntry) => e.role === "player")
          .map((e: TurnEntry) => e.text);
        setCommandHistory(cmds);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load game");
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }

    loadGame();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // Handle player command submission
  const handleCommand = useCallback(
    async (input: string) => {
      if (!world || !player || isLoading || gameWon) return;

      const turnId = crypto.randomUUID();

      // Add player entry to terminal
      const playerEntry: TurnEntry = {
        turnId,
        role: "player",
        text: input,
        timestamp: Date.now(),
      };
      setHistory((prev) => [...prev, playerEntry]);
      setCommandHistory((prev) => [...prev, input]);
      setIsLoading(true);

      try {
        const settings = loadSettings();
        const byokApiKey = settings.provider === "byok" ? settings.byokApiKey : undefined;

        const res = await fetch(`/api/game/${gameId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, turnId, byokApiKey }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Turn processing failed");
        }

        const result: TurnResult = await res.json();

        // Add narrator entry
        const narratorEntry: TurnEntry = {
          turnId: `${turnId}-narrator`,
          role: "narrator",
          text: result.narrative,
          timestamp: Date.now(),
        };
        setHistory((prev) => [...prev, narratorEntry]);

        // Update player state
        setPlayer(result.newPlayerState);

        // Refetch world if it changed
        if (result.worldChanged) {
          const worldRes = await fetch(`/api/game/${gameId}`);
          if (worldRes.ok) {
            const fullState = await worldRes.json();
            setWorld(fullState.world);
          }
        }

        // Check win
        if (result.gameWon) {
          setGameWon(true);
          const victoryEntry: TurnEntry = {
            turnId: `${turnId}-victory`,
            role: "narrator",
            text: "🎉 VICTORY! Congratulations, you have completed the adventure!",
            timestamp: Date.now(),
          };
          setHistory((prev) => [...prev, victoryEntry]);
        }
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Something went wrong";
        const errorEntry: TurnEntry = {
          turnId: `${turnId}-error`,
          role: "narrator",
          text: `[Error: ${errMsg}]`,
          timestamp: Date.now(),
        };
        setHistory((prev) => [...prev, errorEntry]);
      } finally {
        setIsLoading(false);
      }
    },
    [world, player, isLoading, gameWon, gameId],
  );

  // Handle inventory item click → auto-submit examine command
  const handleExamine = useCallback(
    (itemId: string) => {
      if (!world) return;
      const item = world.items[itemId];
      if (item) {
        handleCommand(`examine ${item.name}`);
      }
    },
    [world, handleCommand],
  );

  // ── Derived state ──────────────────────────────────────────────

  const currentRoom = world && player ? world.rooms[player.currentRoomId] ?? null : null;

  const roomItems: Item[] =
    currentRoom && world
      ? currentRoom.itemIds
          .map((id) => world.items[id])
          .filter(Boolean)
      : [];

  const roomNPCs =
    currentRoom && world
      ? currentRoom.npcIds
          .map((id) => world.npcs[id])
          .filter(Boolean)
      : [];

  const inventoryItems: Item[] =
    world && player
      ? player.inventory
          .map((id) => world.items[id])
          .filter(Boolean)
      : [];

  const exits = world && player ? getAvailableExits(world, player) : [];

  const roomsArray = world ? Object.values(world.rooms) : [];

  const welcomeMsg =
    player && player.turnCount === 0 && history.length === 0
      ? WELCOME_MESSAGE
      : undefined;

  // ── Render ─────────────────────────────────────────────────────

  if (initialLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0a0a0a] font-mono text-[#00ff41]">
        <div className="text-center">
          <div className="animate-pulse text-2xl">Loading adventure...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0a0a0a] font-mono text-red-400">
        <div className="text-center">
          <div className="text-xl mb-2">Failed to load game</div>
          <div className="text-sm text-red-500">{error}</div>
        </div>
      </div>
    );
  }

  if (!world || !player) {
    return null;
  }

  return (
    <GameLayout
      mapSlot={
        <AsciiMap
          rooms={roomsArray}
          connections={world.connections}
          visitedRoomIds={player.visitedRooms}
          currentRoomId={player.currentRoomId}
        />
      }
      inventorySlot={
        <InventoryPanel
          items={inventoryItems}
          onItemClick={handleExamine}
        />
      }
      roomInfoSlot={
        <RoomInfoPanel
          room={currentRoom}
          items={roomItems}
          npcs={roomNPCs}
          exits={exits}
        />
      }
    >
      <Terminal
        entries={history}
        isLoading={isLoading}
        welcomeMessage={welcomeMsg}
      />
      <CommandInput
        onSubmit={handleCommand}
        disabled={isLoading || gameWon}
        commandHistory={commandHistory}
      />
    </GameLayout>
  );
}
