"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { renderEntityTables, renderFullMap } from "@/lib/progression";
import { loadSettings } from "@/lib/settings";
import type {
  GameState,
  GameWorld,
  PlayerState,
  TurnEntry,
  Item,
} from "@/types";

const WELCOME_MESSAGE = `     QUESTGEN - AI TEXT ADVENTURE     

  "Don't Panic."                      

  Type commands to interact.          
  Try: look, go north, take key,     
       use key on door, talk to Bob  
       /hint`;

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
  const [streamingText, setStreamingText] = useState("");
  const introRequestedRef = useRef(false);

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

  useEffect(() => {
    if (initialLoading || !world || !player || history.length > 0 || introRequestedRef.current) {
      return;
    }

    introRequestedRef.current = true;
    let cancelled = false;

    async function loadOpeningNarration() {
      setIsLoading(true);
      setStreamingText("");

      try {
        const settings = loadSettings();
        const body: { byokApiKey?: string } = {};
        if (settings.provider === "byok") {
          body.byokApiKey = settings.byokApiKey;
        }

        const res = await fetch(`/api/game/${gameId}/intro`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Opening narration failed");
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Streaming response body missing");
        }

        const readIntroEntry = async (): Promise<TurnEntry | null> => {
          const decoder = new TextDecoder();
          let buffered = "";
          let streamedNarrative = "";
          let introEntry: TurnEntry | null = null;

          const handleLine = (line: string) => {
            if (!line.trim()) return;

            const message = JSON.parse(line) as
              | { type: "chunk"; chunk: string }
              | { type: "final"; entry: TurnEntry | null }
              | { type: "error"; error: string };

            if (message.type === "chunk") {
              streamedNarrative += message.chunk;
              if (!cancelled) {
                setStreamingText(streamedNarrative);
              }
              return;
            }

            if (message.type === "error") {
              throw new Error(message.error);
            }

            introEntry = message.entry;
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffered += decoder.decode(value, { stream: true });
            const lines = buffered.split("\n");
            buffered = lines.pop() ?? "";

            for (const line of lines) {
              handleLine(line);
            }
          }

          buffered += decoder.decode();
          if (buffered.trim()) {
            handleLine(buffered);
          }

          return introEntry;
        };

        const finalIntroEntry = await readIntroEntry();
        if (!cancelled && finalIntroEntry) {
          setHistory((prev) => (prev.length === 0 ? [finalIntroEntry] : prev));
        }
      } catch (err) {
        if (!cancelled) {
          const errMsg =
            err instanceof Error ? err.message : "Opening narration failed";
          setHistory((prev) => [
            ...prev,
            {
              turnId: `intro-error-${gameId}`,
              role: "narrator",
              text: `[Error: ${errMsg}]`,
              timestamp: Date.now(),
            },
          ]);
        }
      } finally {
        if (!cancelled) {
          setStreamingText("");
          setIsLoading(false);
        }
      }
    }

    void loadOpeningNarration();

    return () => {
      cancelled = true;
    };
  }, [gameId, history.length, initialLoading, player, world]);

  // Handle player command submission
  const handleCommand = useCallback(
    async (input: string) => {
      if (!world || !player || isLoading || gameWon) return;

      const turnId = crypto.randomUUID();
      const appendNarratorEntry = (text: string, suffix: string) => {
        const narratorEntry: TurnEntry = {
          turnId: `${turnId}-${suffix}`,
          role: "narrator",
          text,
          timestamp: Date.now(),
        };
        setHistory((prev) => [...prev, narratorEntry]);
      };

      // Add player entry to terminal
      const playerEntry: TurnEntry = {
        turnId,
        role: "player",
        text: input,
        timestamp: Date.now(),
      };
      setHistory((prev) => [...prev, playerEntry]);
      setCommandHistory((prev) => [...prev, input]);

      const slashCommand = input.trim().toLowerCase();
      if (slashCommand.startsWith("/")) {
        if (slashCommand === "/showfullmap") {
          appendNarratorEntry(renderFullMap(world, player), "fullmap");
          return;
        }

        if (slashCommand === "/showentitytables") {
          appendNarratorEntry(renderEntityTables(world, player), "entitytables");
          return;
        }

        if (slashCommand === "/hint") {
          setIsLoading(true);
          setStreamingText("");

          try {
            const settings = loadSettings();
            const body: { byokApiKey?: string } = {};
            if (settings.provider === "byok") {
              body.byokApiKey = settings.byokApiKey;
            }

            const res = await fetch(`/api/game/${gameId}/hint`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });

            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || "Hint request failed");
            }

            const data = await res.json();
            appendNarratorEntry(
              data.hint ?? "The hint system has misplaced its confidence.",
              "hint",
            );
          } catch (err) {
            appendNarratorEntry(
              `[Error: ${err instanceof Error ? err.message : "Hint request failed"}]`,
              "hint-error",
            );
          } finally {
            setIsLoading(false);
          }

          return;
        }

        if (slashCommand.startsWith("/admin")) {
          const question = input.trim().slice("/admin".length).trim();
          if (!question) {
            appendNarratorEntry(
              "Usage: /admin <question>",
              "admin-usage",
            );
            return;
          }

          setIsLoading(true);
          setStreamingText("");

          try {
            const settings = loadSettings();
            const body: { question: string; byokApiKey?: string } = { question };
            if (settings.provider === "byok") {
              body.byokApiKey = settings.byokApiKey;
            }

            const res = await fetch(`/api/game/${gameId}/admin`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });

            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || "Admin request failed");
            }

            const data = await res.json();
            appendNarratorEntry(
              data.response ?? "The admin console stared into the void and received no paperwork in return.",
              "admin",
            );
          } catch (err) {
            appendNarratorEntry(
              `[Error: ${err instanceof Error ? err.message : "Admin request failed"}]`,
              "admin-error",
            );
          } finally {
            setIsLoading(false);
          }

          return;
        }

        appendNarratorEntry("Unknown slash command.", "slash-error");
        return;
      }

      setIsLoading(true);
      setStreamingText("");

      try {
        const settings = loadSettings();
        const byokApiKey = settings.provider === "byok" ? settings.byokApiKey : undefined;

        const res = await fetch(`/api/game/${gameId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, turnId, byokApiKey, stream: true }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Turn processing failed");
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Streaming response body missing");
        }

        type StreamedTurnResult = TurnResult & {
          recoveredWorld?: GameState["world"];
        };

        const readTurnResult = async (): Promise<StreamedTurnResult> => {
          const decoder = new TextDecoder();
          let buffered = "";
          let streamedNarrative = "";
          let finalResult: TurnResult | null = null;

          const handleLine = (line: string) => {
            if (!line.trim()) return;

            const message = JSON.parse(line) as
              | { type: "chunk"; chunk: string }
              | { type: "final"; result: TurnResult }
              | { type: "error"; error: string };

            if (message.type === "chunk") {
              streamedNarrative += message.chunk;
              setStreamingText(streamedNarrative);
              return;
            }

            if (message.type === "error") {
              throw new Error(message.error);
            }

            finalResult = message.result;
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffered += decoder.decode(value, { stream: true });
            const lines = buffered.split("\n");
            buffered = lines.pop() ?? "";

            for (const line of lines) {
              handleLine(line);
            }
          }

          buffered += decoder.decode();
          if (buffered.trim()) {
            handleLine(buffered);
          }

          if (!finalResult) {
            if (!streamedNarrative.trim()) {
              throw new Error("Turn stream finished without a final result");
            }

            const recoveryRes = await fetch(`/api/game/${gameId}`);
            if (!recoveryRes.ok) {
              throw new Error("Turn stream finished without a final result");
            }

            const recoveredState = (await recoveryRes.json()) as GameState;
            return {
              success: true,
              narrative: streamedNarrative.trim(),
              actionResults: [],
              newPlayerState: recoveredState.player,
              worldChanged: true,
              gameWon: recoveredState.metadata.completed,
              recoveredWorld: recoveredState.world,
            };
          }

          return finalResult;
        };

        const finalResult = await readTurnResult();

        setStreamingText("");

        // Add narrator entry
        appendNarratorEntry(finalResult.narrative, "narrator");

        // Update player state
        setPlayer(finalResult.newPlayerState);

        if (finalResult.recoveredWorld) {
          setWorld(finalResult.recoveredWorld);
        }

        // Refetch world if it changed
        if (finalResult.worldChanged && !finalResult.recoveredWorld) {
          const worldRes = await fetch(`/api/game/${gameId}`);
          if (worldRes.ok) {
            const fullState = await worldRes.json();
            setWorld(fullState.world);
          }
        }

        // Check win
        if (finalResult.gameWon) {
          setGameWon(true);
          appendNarratorEntry(
            "🎉 VICTORY! Congratulations, you have completed the adventure!",
            "victory",
          );
        }
      } catch (err) {
        setStreamingText("");
        appendNarratorEntry(
          `[Error: ${err instanceof Error ? err.message : "Something went wrong"}]`,
          "error",
        );
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

  const roomInteractables =
    currentRoom && world
      ? Object.values(world.interactables).filter(
          (interactable) => interactable.roomId === currentRoom.id,
        )
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
          interactables={roomInteractables}
          npcs={roomNPCs}
          exits={exits}
        />
      }
    >
      <Terminal
        entries={history}
        isLoading={isLoading}
        streamingText={streamingText}
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
