"use client";

import { useEffect, useRef } from "react";
import type { TurnEntry } from "@/types";

interface TerminalProps {
  entries: TurnEntry[];
  isLoading?: boolean;
  streamingText?: string;
  welcomeMessage?: string;
}

function PlayerEntry({ entry }: { entry: TurnEntry }) {
  return (
    <div data-role="player" className="whitespace-pre-wrap" style={{ color: "#ffb000" }}>
      &gt; {entry.text}
    </div>
  );
}

function NarratorEntry({ entry }: { entry: TurnEntry }) {
  return (
    <div data-role="narrator" className="whitespace-pre-wrap" style={{ color: "#00ff41" }}>
      {entry.text}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div data-testid="typing-indicator" style={{ color: "#00ff41" }}>
      <span className="inline-block animate-pulse">█</span>
    </div>
  );
}

function StreamingText({ text }: { text: string }) {
  return (
    <div data-role="narrator" className="whitespace-pre-wrap" style={{ color: "#00ff41" }}>
      {text}
      <span className="inline-block animate-pulse">█</span>
    </div>
  );
}

function WelcomeMessage({ message }: { message: string }) {
  return (
    <div
      className="py-4 text-center whitespace-pre-wrap"
      style={{ color: "#33ff77" }}
    >
      <div className="mb-2" style={{ color: "#00ff41", opacity: 0.6 }}>
        ╔══════════════════════════════════╗
      </div>
      <div>{message}</div>
      <div className="mt-2" style={{ color: "#00ff41", opacity: 0.6 }}>
        ╚══════════════════════════════════╝
      </div>
    </div>
  );
}

export function Terminal({
  entries,
  isLoading = false,
  streamingText,
  welcomeMessage,
}: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, streamingText, isLoading]);

  const showWelcome = welcomeMessage && entries.length === 0 && !streamingText;
  const showTyping = isLoading && !streamingText;

  return (
    <div
      data-testid="terminal"
      className="flex flex-col gap-3 overflow-y-auto p-4 font-mono text-sm"
    >
      {showWelcome && <WelcomeMessage message={welcomeMessage} />}

      {entries.map((entry) => (
        <div key={entry.turnId}>
          {entry.role === "player" ? (
            <PlayerEntry entry={entry} />
          ) : (
            <NarratorEntry entry={entry} />
          )}
        </div>
      ))}

      {streamingText && <StreamingText text={streamingText} />}
      {showTyping && <TypingIndicator />}

      <div ref={bottomRef} />
    </div>
  );
}
