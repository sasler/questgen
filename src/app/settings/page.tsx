"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PanelFrame } from "@/components/PanelFrame";
import type { AIModelInfo } from "@/providers/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoredSettings {
  provider: "copilot" | "byok";
  byokType?: "openai" | "azure" | "anthropic";
  byokBaseUrl?: string;
  byokApiKey?: string;
  generationModel: string;
  gameplayModel: string;
  responseLength: "brief" | "moderate" | "detailed";
}

const STORAGE_KEY = "questgen-settings";

const DEFAULT_SETTINGS: StoredSettings = {
  provider: "copilot",
  generationModel: "",
  gameplayModel: "",
  responseLength: "moderate",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt data */
  }
  return { ...DEFAULT_SETTINGS };
}

const inputClass =
  "w-full bg-[#0a0a0a] border border-[#1a3a1a] text-[#00ff41] font-mono text-sm px-3 py-2 " +
  "focus:outline-none focus:border-[#00ff41] focus:ring-1 focus:ring-[#00ff41] placeholder:text-[#4a6741]";

const selectClass =
  "w-full bg-[#0a0a0a] border border-[#1a3a1a] text-[#00ff41] font-mono text-sm px-3 py-2 " +
  "focus:outline-none focus:border-[#00ff41] focus:ring-1 focus:ring-[#00ff41]";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_SETTINGS);
  const [models, setModels] = useState<AIModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
    setMounted(true);
  }, []);

  // Fetch models when provider config changes
  const fetchModels = useCallback(async (s: StoredSettings) => {
    setModelsLoading(true);
    try {
      const params = new URLSearchParams({ provider: s.provider });
      if (s.provider === "byok" && s.byokType) {
        params.set("byokType", s.byokType);
      }
      const res = await fetch(`/api/models?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch models");
      const data = await res.json();
      const fetched: AIModelInfo[] = data.models ?? [];
      setModels(fetched);

      // Auto-select recommended models if current selections are empty or missing
      const genRec = fetched.find((m: AIModelInfo) => m.recommended === "generation");
      const gameRec = fetched.find((m: AIModelInfo) => m.recommended === "gameplay");

      setSettings((prev) => {
        const genExists = fetched.some((m: AIModelInfo) => m.id === prev.generationModel);
        const gameExists = fetched.some((m: AIModelInfo) => m.id === prev.gameplayModel);
        return {
          ...prev,
          generationModel: genExists ? prev.generationModel : (genRec?.id ?? fetched[0]?.id ?? ""),
          gameplayModel: gameExists ? prev.gameplayModel : (gameRec?.id ?? fetched[0]?.id ?? ""),
        };
      });
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetchModels(settings);
    // Only re-fetch when provider-related fields change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, settings.provider, settings.byokType, fetchModels]);

  // Convenience updater
  const update = <K extends keyof StoredSettings>(key: K, value: StoredSettings[K]) => {
    setSaved(false);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Model option label with recommended badge
  const modelLabel = (m: AIModelInfo) => {
    if (m.recommended === "generation") return `${m.name} ★ Recommended for Generation`;
    if (m.recommended === "gameplay") return `${m.name} ★ Recommended for Gameplay`;
    return m.name;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#00ff41] font-mono p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold glow-text">⚙ SETTINGS</h1>
          <Link
            href="/dashboard"
            className="text-[#ffb000] hover:text-[#00ff41] text-sm underline"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* ── Provider Selection ─────────────────────────────────────── */}
        <PanelFrame title="AI Provider">
          <fieldset className="space-y-3">
            <legend className="text-[#ffb000] text-sm mb-2">
              Choose how QuestGen connects to AI models
            </legend>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="copilot"
                checked={settings.provider === "copilot"}
                onChange={() => update("provider", "copilot")}
                className="accent-[#00ff41]"
              />
              <span>GitHub Copilot</span>
            </label>

            {settings.provider === "copilot" && (
              <p className="text-[#4a6741] text-xs ml-6">
                Uses your GitHub Copilot subscription.{" "}
                <a
                  href="https://github.com/features/copilot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ffb000] underline"
                >
                  Sign up for Copilot →
                </a>
              </p>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="byok"
                checked={settings.provider === "byok"}
                onChange={() =>
                  update("provider", "byok")
                }
                className="accent-[#00ff41]"
              />
              <span>Bring Your Own Key (BYOK)</span>
            </label>
          </fieldset>

          {/* BYOK sub-form */}
          {settings.provider === "byok" && (
            <div className="mt-4 ml-6 space-y-3 border-l border-[#1a3a1a] pl-4">
              <fieldset className="space-y-2">
                <legend className="text-[#ffb000] text-xs mb-1">Provider Type</legend>
                {(["openai", "anthropic", "azure"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="byokType"
                      value={t}
                      checked={settings.byokType === t}
                      onChange={() => update("byokType", t)}
                      className="accent-[#00ff41]"
                    />
                    <span className="capitalize">{t === "openai" ? "OpenAI" : t === "anthropic" ? "Anthropic" : "Azure"}</span>
                  </label>
                ))}
              </fieldset>

              <div>
                <label htmlFor="byok-base-url" className="block text-xs text-[#ffb000] mb-1">
                  Base URL
                </label>
                <input
                  id="byok-base-url"
                  type="text"
                  value={settings.byokBaseUrl ?? ""}
                  onChange={(e) => update("byokBaseUrl", e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="byok-api-key" className="block text-xs text-[#ffb000] mb-1">
                  API Key
                </label>
                <input
                  id="byok-api-key"
                  type="password"
                  value={settings.byokApiKey ?? ""}
                  onChange={(e) => update("byokApiKey", e.target.value)}
                  placeholder="sk-..."
                  className={inputClass}
                />
                <p className="text-[#4a6741] text-xs mt-1">
                  Stored locally in your browser only — never sent to our servers.
                </p>
              </div>
            </div>
          )}
        </PanelFrame>

        {/* ── Model Selection ───────────────────────────────────────── */}
        <PanelFrame title="Model Selection">
          {modelsLoading ? (
            <p className="text-[#4a6741] animate-pulse">Loading models…</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="generation-model" className="block text-xs text-[#ffb000] mb-1">
                  World Generation Model
                </label>
                <select
                  id="generation-model"
                  value={settings.generationModel}
                  onChange={(e) => update("generationModel", e.target.value)}
                  className={selectClass}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {modelLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="gameplay-model" className="block text-xs text-[#ffb000] mb-1">
                  Gameplay Model
                </label>
                <select
                  id="gameplay-model"
                  value={settings.gameplayModel}
                  onChange={(e) => update("gameplayModel", e.target.value)}
                  className={selectClass}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {modelLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </PanelFrame>

        {/* ── Response Length ────────────────────────────────────────── */}
        <PanelFrame title="Response Length">
          <fieldset className="space-y-3">
            <legend className="text-[#ffb000] text-sm mb-2">
              How much detail should the AI include?
            </legend>

            {([
              {
                value: "brief" as const,
                label: "Brief",
                desc: "Hemingway would approve. 1-2 sentences.",
              },
              {
                value: "moderate" as const,
                label: "Moderate",
                desc: "A comfortable middle ground. 3-5 sentences.",
              },
              {
                value: "detailed" as const,
                label: "Detailed",
                desc: "For the verbose adventurer. Full paragraphs.",
              },
            ]).map((opt) => (
              <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="responseLength"
                  value={opt.value}
                  checked={settings.responseLength === opt.value}
                  onChange={() => update("responseLength", opt.value)}
                  className="accent-[#00ff41] mt-1"
                />
                <span>
                  <span className="font-bold">{opt.label}</span>
                  <span className="text-[#4a6741] text-xs block">{opt.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </PanelFrame>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            className={
              "px-6 py-2 font-bold text-sm border cursor-pointer " +
              "bg-[#0a0a0a] border-[#00ff41] text-[#00ff41] " +
              "hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
            }
          >
            {saved ? "✓ Saved!" : "[ SAVE SETTINGS ]"}
          </button>

          <Link
            href="/dashboard"
            className="text-[#4a6741] hover:text-[#00ff41] text-sm underline"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
