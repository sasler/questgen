"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PanelFrame } from "@/components/PanelFrame";
import type { AIModelInfo } from "@/providers/types";
import {
  type UserSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "@/lib/settings";

const inputClass =
  "w-full bg-[#0a0a0a] border border-[#1a3a1a] text-[#00ff41] font-mono text-sm px-3 py-2 " +
  "focus:outline-none focus:border-[#00ff41] focus:ring-1 focus:ring-[#00ff41] placeholder:text-[#4a6741]";

const selectClass =
  "w-full bg-[#0a0a0a] border border-[#1a3a1a] text-[#00ff41] font-mono text-sm px-3 py-2 " +
  "focus:outline-none focus:border-[#00ff41] focus:ring-1 focus:ring-[#00ff41]";

interface ConnectionStatus {
  authConfigured: boolean;
  github: { connected: boolean; username?: string; avatar?: string | null };
  copilot: { available: boolean; error?: string | null };
}

function classifyCopilotError(error: string | null): "runtime" | "account" | "unknown" {
  const normalized = error?.toLowerCase() ?? "";

  if (
    normalized.includes("could not find @github/copilot package") ||
    normalized.includes("could not resolve the @github/copilot cli path") ||
    normalized.includes("copilot_cli_path") ||
    normalized.includes("path to copilot cli is required") ||
    normalized.includes("copilot cli not found")
  ) {
    return "runtime";
  }

  if (
    normalized.includes("copilot not enabled") ||
    normalized.includes("not available for this account")
  ) {
    return "account";
  }

  return "unknown";
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [models, setModels] = useState<AIModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    const stored = loadSettings();
    setSettings(stored);
    setMounted(true);
  }, []);

  const fetchConnectionStatus = useCallback(async () => {
    setConnectionLoading(true);
    setConnectionError(false);
    try {
      const res = await fetch("/api/copilot/status");
      if (!res.ok) {
        throw new Error("Status unavailable");
      }
      const data: ConnectionStatus = await res.json();
      setConnectionStatus(data);
    } catch {
      setConnectionError(true);
    } finally {
      setConnectionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetchConnectionStatus();
  }, [mounted, fetchConnectionStatus]);

  const fetchModels = useCallback(async (s: UserSettings) => {
    setModelsLoading(true);
    setModelsError(null);
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
      setModelsError(typeof data.error === "string" ? data.error : null);

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
      setModelsError("QuestGen couldn't load models right now.");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetchModels(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, settings.provider, settings.byokType, fetchModels]);

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSaved(false);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const modelLabel = (m: AIModelInfo) => {
    if (m.recommended === "generation") return `${m.name} ★ Recommended for Generation`;
    if (m.recommended === "gameplay") return `${m.name} ★ Recommended for Gameplay`;
    return m.name;
  };

  const copilotSignInHref = "/api/auth/signin?callbackUrl=%2Fsettings";
  const copilotSignOutHref = "/api/auth/signout?callbackUrl=%2Fsettings";
  const copilotIssueType =
    settings.provider === "copilot" ? classifyCopilotError(modelsError) : "unknown";
  const showCopilotRuntimeIssue =
    settings.provider === "copilot" &&
    Boolean(modelsError) &&
    connectionStatus?.copilot.available === true &&
    Boolean(connectionStatus?.github.connected);

  const renderConnectionPanel = () => {
    if (connectionLoading && !connectionStatus) {
      return <p className="text-[#4a6741] animate-pulse text-xs">Checking connection...</p>;
    }

    if (connectionError && !connectionStatus) {
      return (
        <>
          <p className="text-sm text-[#ffb000] font-bold">
            We couldn&apos;t check GitHub Copilot status right now.
          </p>
          <p className="text-xs text-[#4a6741] leading-relaxed">
            Try refreshing the status. This does not necessarily mean the deployment is
            misconfigured.
          </p>
          <button
            onClick={fetchConnectionStatus}
            disabled={connectionLoading}
            className="w-fit px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors disabled:opacity-50"
          >
            {connectionLoading ? "Refreshing..." : "Refresh status"}
          </button>
        </>
      );
    }

    if (!connectionStatus) {
      return null;
    }

    const staleWarning =
      connectionError && connectionStatus ? (
        <p className="text-xs text-[#ffb000] leading-relaxed">
          We couldn&apos;t refresh the latest GitHub Copilot status. The details below may be stale.
        </p>
      ) : null;

    if (!connectionStatus.authConfigured) {
      return (
        <>
          {staleWarning}
          <p className="text-sm text-[#ffb000] font-bold">
            GitHub Copilot sign-in isn&apos;t enabled on this deployment.
          </p>
          <p className="text-xs text-[#4a6741] leading-relaxed">
            Regular players should only ever see a connect button. This means whoever deployed
            this copy still needs to finish the one-time owner setup.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/setup"
              className="px-3 py-1 text-xs border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
            >
              Owner Setup
            </Link>
            <Link
              href="/guide"
              className="px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors"
            >
              Copilot Signup Guide
            </Link>
          </div>
        </>
      );
    }

    if (!connectionStatus.github.connected) {
      return (
        <>
          {staleWarning}
          <p className="text-sm text-[#00ff41] font-bold">Recommended: GitHub Copilot</p>
          <p className="text-xs text-[#4a6741] leading-relaxed">
            Sign in with your GitHub account and QuestGen will use your own Copilot subscription.
            No API key needed.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={copilotSignInHref}
              className="px-3 py-1 text-xs border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
            >
              Connect GitHub Copilot
            </Link>
            <Link
              href="/guide"
              className="px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors"
            >
              Need a free Copilot account?
            </Link>
          </div>
        </>
      );
    }

    if (showCopilotRuntimeIssue) {
      return (
        <>
          {staleWarning}
          <div className="flex items-center gap-2 text-sm">
            <span
              data-testid="copilot-status-dot"
              className="inline-block w-2 h-2 rounded-full bg-[#ff4444]"
            />
            <p>
              Connected as{" "}
              <span className="text-[#ffb000] font-bold">{connectionStatus.github.username}</span>,
              but QuestGen couldn&apos;t load Copilot models.
            </p>
          </div>
          {modelsError && <p className="text-[#ff4444] text-xs">{modelsError}</p>}
          <p className="text-xs text-[#4a6741] leading-relaxed">
            {copilotIssueType === "runtime"
              ? "Your GitHub sign-in succeeded, but this deployment couldn't start the Copilot runtime. Try reloading models or reconnecting GitHub."
              : copilotIssueType === "account"
                ? "Your GitHub sign-in succeeded, but this account still needs Copilot access. You can reconnect, switch to BYOK, or follow the signup guide."
                : "Your GitHub sign-in succeeded, but QuestGen couldn't verify Copilot model access right now. Try again before switching providers."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={copilotSignInHref}
              className="px-3 py-1 text-xs border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
            >
              Reconnect GitHub Copilot
            </Link>
            <Link
              href={copilotSignOutHref}
              className="px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors"
            >
              Disconnect GitHub
            </Link>
            <button
              onClick={() => void fetchModels(settings)}
              disabled={modelsLoading}
              className="px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors disabled:opacity-50"
            >
              {modelsLoading ? "Retrying..." : "Retry model loading"}
            </button>
            <button
              onClick={fetchConnectionStatus}
              disabled={connectionLoading}
              className="px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors disabled:opacity-50"
            >
              {connectionLoading ? "Refreshing..." : "Refresh status"}
            </button>
            {copilotIssueType === "account" && (
              <Link
                href="/guide"
                className="px-3 py-1 text-xs border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
              >
                How to get Copilot
              </Link>
            )}
          </div>
        </>
      );
    }

    if (connectionStatus.copilot.available) {
      return (
        <>
          {staleWarning}
          <div className="flex items-center gap-2 text-sm">
            <span
              data-testid="github-status-dot"
              className="inline-block w-2 h-2 rounded-full bg-[#00ff41]"
            />
            <p>
              Connected as{" "}
              <span className="text-[#ffb000] font-bold">{connectionStatus.github.username}</span>
            </p>
          </div>
          <p className="text-xs text-[#4a6741] leading-relaxed">
            GitHub sign-in is ready. QuestGen will use the player&apos;s own subscription, not the
            site owner&apos;s.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={copilotSignOutHref}
              className="px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors"
            >
              Disconnect GitHub
            </Link>
            <button
              onClick={fetchConnectionStatus}
              disabled={connectionLoading}
              className="px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors disabled:opacity-50"
            >
              {connectionLoading ? "Refreshing..." : "Refresh status"}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        {staleWarning}
        <div className="flex items-center gap-2 text-sm">
          <span
            data-testid="copilot-status-dot"
            className="inline-block w-2 h-2 rounded-full bg-[#ffb000]"
          />
          <p>
            Connected as{" "}
            <span className="text-[#ffb000] font-bold">{connectionStatus.github.username}</span>,
            but this GitHub session needs to be refreshed.
          </p>
        </div>
        <p className="text-xs text-[#4a6741] leading-relaxed">
          QuestGen can see your GitHub session, but it is missing the token needed to load
          Copilot models. Reconnect GitHub, then refresh status.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={copilotSignInHref}
            className="px-3 py-1 text-xs border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
          >
            Reconnect GitHub Copilot
          </Link>
          <Link
            href={copilotSignOutHref}
            className="px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors"
          >
            Disconnect GitHub
          </Link>
          <button
            onClick={fetchConnectionStatus}
            disabled={connectionLoading}
            className="px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors disabled:opacity-50"
          >
            {connectionLoading ? "Refreshing..." : "Refresh status"}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#00ff41] font-mono p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold glow-text">⚙ SETTINGS</h1>
          <Link
            href="/dashboard"
            className="text-[#ffb000] hover:text-[#00ff41] text-sm underline"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <PanelFrame title="GitHub Copilot">
          <div className="space-y-3">
            {renderConnectionPanel()}
          </div>
        </PanelFrame>

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
              <p className="text-[#4a6741] text-xs ml-6 leading-relaxed">
                Recommended. Each player uses their own GitHub Copilot subscription after
                clicking Connect GitHub Copilot above.
              </p>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="byok"
                checked={settings.provider === "byok"}
                onChange={() => update("provider", "byok")}
                className="accent-[#00ff41]"
              />
              <span>Bring Your Own Key (BYOK)</span>
            </label>
          </fieldset>

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
                    <span className="capitalize">
                      {t === "openai" ? "OpenAI" : t === "anthropic" ? "Anthropic" : "Azure"}
                    </span>
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
                  Stored in your browser only. The key is only forwarded when you start or
                  continue a game.
                </p>
              </div>
            </div>
          )}
        </PanelFrame>

        <PanelFrame title="Model Selection">
          {modelsLoading ? (
            <p className="text-[#4a6741] animate-pulse">Loading models…</p>
          ) : models.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-[#ffb000] font-bold">No models available yet.</p>
              <p className="text-xs text-[#4a6741] leading-relaxed">
                {modelsError ??
                  (settings.provider === "copilot"
                    ? "Connect GitHub Copilot above, then retry loading models."
                    : "Finish your BYOK configuration, then retry loading models.")}
              </p>
              <button
                onClick={() => void fetchModels(settings)}
                disabled={modelsLoading}
                className="w-fit px-3 py-1 text-xs border border-[#1a3a1a] text-[#4a6741] hover:border-[#00ff41] hover:text-[#00ff41] transition-colors disabled:opacity-50"
              >
                Retry model load
              </button>
            </div>
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
