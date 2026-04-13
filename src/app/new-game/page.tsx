"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PanelFrame } from "@/components";
import { loadSettings, toGameSettings } from "@/lib/settings";
import type { GameSize, GameGenerationRequest } from "@/types";

const SIZE_OPTIONS: {
  value: GameSize;
  label: string;
  description: string;
}[] = [
  { value: "small", label: "Small", description: "5-8 rooms. Quick adventure. ~30 min." },
  { value: "medium", label: "Medium", description: "10-15 rooms. A proper quest. ~1-2 hours." },
  { value: "large", label: "Large", description: "20-30 rooms. Epic journey. ~3-5 hours." },
  { value: "epic", label: "Epic", description: "40+ rooms. You may need provisions. Days." },
];

const LOADING_MESSAGES = [
  "Constructing reality...",
  "Placing items in improbable locations...",
  "Teaching NPCs to be unhelpful...",
  "Calibrating puzzle difficulty to 'unfair'...",
  "Consulting the Guide...",
];

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  let text = "";

  try {
    text = (await response.text()).trim();
  } catch {
    // Fall through to the generic message below.
  }

  if (contentType.includes("application/json") && text.length > 0) {
    try {
      const data = JSON.parse(text) as { error?: string };
      if (typeof data.error === "string" && data.error.trim().length > 0) {
        return data.error;
      }
    } catch {
      // Fall through to returning the raw text below.
    }
  }

  if (text.length > 0) {
    return text;
  }

  return "Generation failed";
}

export default function NewGamePage() {
  const router = useRouter();

  const [description, setDescription] = useState("");
  const [size, setSize] = useState<GameSize>("medium");
  const [genre, setGenre] = useState("sci-fi");
  const [validationError, setValidationError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setValidationError("");
      setApiError("");

      if (description.trim().length < 10) {
        setValidationError("Description must be at least 10 characters.");
        return;
      }

      setIsGenerating(true);
      setLoadingMsgIndex(0);

      try {
        const settings = loadSettings();

        const request: GameGenerationRequest = {
          description: description.trim(),
          size,
          genre: genre.trim() || undefined,
        };

        const body: Record<string, unknown> = { request, settings: toGameSettings(settings) };

        if (settings.provider === "byok" && settings.byokApiKey) {
          body.byokApiKey = settings.byokApiKey;
        }

        const res = await fetch("/api/game/new", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(await readErrorMessage(res));
        }

        const { gameId } = await res.json();
        router.push(`/game/${gameId}`);
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setIsGenerating(false);
      }
    },
    [description, size, genre, router],
  );

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-[#00ff41] font-mono flex items-center justify-center p-4">
      <PanelFrame title="NEW GAME" className="w-full max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6 p-2">
          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="description" className="block text-[#ffb000] text-sm font-bold">
              Describe your adventure...
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A derelict space station orbiting a dying star, where nothing is quite as it seems..."
              rows={4}
              className="w-full bg-[#0a0a0a] border border-[#1a3a1a] text-[#00ff41] p-2 text-sm font-mono focus:outline-none focus:border-[#00ff41] placeholder:text-[#4a6741] resize-none"
            />
            {validationError && (
              <p className="text-[#ff4444] text-xs">{validationError}</p>
            )}
          </div>

          {/* Size */}
          <fieldset className="space-y-2">
            <legend className="text-[#ffb000] text-sm font-bold">Game Size</legend>
            <div className="grid grid-cols-2 gap-2">
              {SIZE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`block border p-3 cursor-pointer text-sm transition-colors ${
                    size === opt.value
                      ? "border-[#00ff41] bg-[#0d1a0d]"
                      : "border-[#1a3a1a] hover:border-[#4a6741]"
                  }`}
                >
                  <input
                    type="radio"
                    name="size"
                    value={opt.value}
                    checked={size === opt.value}
                    onChange={() => setSize(opt.value)}
                    className="sr-only"
                    aria-label={opt.label}
                  />
                  <span className="font-bold text-[#ffb000]">{opt.label}</span>
                  <span className="block text-xs text-[#4a6741] mt-1">{opt.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Genre */}
          <div className="space-y-2">
            <label htmlFor="genre" className="block text-[#ffb000] text-sm font-bold">
              Genre (optional)
            </label>
            <input
              id="genre"
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="e.g., sci-fi, mystery, horror, comedy"
              className="w-full bg-[#0a0a0a] border border-[#1a3a1a] text-[#00ff41] p-2 text-sm font-mono focus:outline-none focus:border-[#00ff41] placeholder:text-[#4a6741]"
            />
          </div>

          {/* Error */}
          {apiError && (
            <div className="border border-[#ff4444] bg-[#1a0d0d] p-3 text-sm">
              <p className="text-[#ff4444]">{apiError}</p>
              <button
                type="button"
                onClick={() => setApiError("")}
                className="mt-2 text-[#ffb000] underline text-xs cursor-pointer"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Loading */}
          {isGenerating && (
            <div data-testid="loading-message" className="text-center py-4">
              <p className="text-[#00ff41] animate-pulse">
                {LOADING_MESSAGES[loadingMsgIndex]}
              </p>
              <div className="mt-2 text-xs text-[#4a6741]">
                ████░░░░░░ generating...
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isGenerating}
            className="w-full border border-[#00ff41] text-[#00ff41] py-2 px-4 text-sm font-bold hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Generate World
          </button>
        </form>
      </PanelFrame>
    </div>
  );
}
