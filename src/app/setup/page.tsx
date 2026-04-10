"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PanelFrame } from "@/components/PanelFrame";

interface SetupStatus {
  auth: boolean;
  secret: boolean;
  redis: boolean;
  redisConnected: boolean;
  allConfigured: boolean;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="text-[#00ff41]">✓</span>
  ) : (
    <span className="text-[#ff4444]">✗</span>
  );
}

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export default function SetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/check");
      const data = await res.json();
      setStatus(data);
    } catch {
      // keep status null on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const oauthUrl = `https://github.com/settings/applications/new?oauth_application[name]=QuestGen&oauth_application[url]=${encodeURIComponent(origin)}&oauth_application[callback_url]=${encodeURIComponent(origin + "/api/auth/callback/github")}`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#00ff41] font-mono p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-[#ffb000] tracking-wider">
            ╔══════════════════════════════╗
          </h1>
          <h1 className="text-2xl md:text-3xl font-bold text-[#ffb000] tracking-wider">
            ║ SYSTEM INITIALIZATION ║
          </h1>
          <h1 className="text-2xl md:text-3xl font-bold text-[#ffb000] tracking-wider">
            ╚══════════════════════════════╝
          </h1>
          <p className="text-[#00ff41] mt-2 text-sm opacity-70">
            Configure environment variables to activate QuestGen
          </p>
        </div>

        {loading && !status && (
          <div className="text-center text-[#ffb000] animate-pulse">
            &gt; Checking system configuration...
          </div>
        )}

        {status?.allConfigured && (
          <PanelFrame title="STATUS">
            <div className="text-center py-4 space-y-3">
              <p className="text-2xl">🎉</p>
              <p className="text-[#00ff41] text-lg font-bold">
                All systems go!
              </p>
              <Link
                href="/"
                className="inline-block mt-2 px-4 py-2 border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
              >
                Continue to QuestGen →
              </Link>
            </div>
          </PanelFrame>
        )}

        {/* Step 1: AUTH_SECRET */}
        <PanelFrame title="STEP 1 — AUTH_SECRET">
          <div className="space-y-2">
            <p>
              <StatusIcon ok={!!status?.secret} />{" "}
              <span className="text-[#ffb000]">AUTH_SECRET</span>{" "}
              {status?.secret ? (
                <span className="text-[#00ff41]">configured</span>
              ) : (
                <span className="text-[#ff4444]">missing</span>
              )}
            </p>
            <p className="text-xs opacity-70">Generate a random secret:</p>
            <code className="block bg-[#0a0a0a] border border-[#1a3a1a] px-2 py-1 text-xs">
              openssl rand -base64 32
            </code>
            <button
              onClick={() => setGeneratedSecret(generateSecret())}
              className="mt-1 px-3 py-1 text-xs border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
            >
              Generate
            </button>
            {generatedSecret && (
              <code
                data-testid="generated-secret"
                className="block bg-[#0a0a0a] border border-[#00ff41] px-2 py-1 text-xs break-all text-[#00ff41]"
              >
                {generatedSecret}
              </code>
            )}
            <p className="text-xs opacity-70">
              Add to <code>.env.local</code> or Vercel environment variables.
            </p>
          </div>
        </PanelFrame>

        {/* Step 2: GitHub OAuth */}
        <PanelFrame title="STEP 2 — GitHub OAuth App">
          <div className="space-y-2">
            <p>
              <StatusIcon ok={!!status?.auth} />{" "}
              <span className="text-[#ffb000]">GITHUB_ID</span> &amp;{" "}
              <span className="text-[#ffb000]">GITHUB_SECRET</span>{" "}
              {status?.auth ? (
                <span className="text-[#00ff41]">configured</span>
              ) : (
                <span className="text-[#ff4444]">missing</span>
              )}
            </p>
            <a
              href={oauthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1 text-xs border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
            >
              Create OAuth App
            </a>
            <p className="text-xs opacity-70">After creating the app:</p>
            <ul className="text-xs opacity-70 list-disc list-inside space-y-1">
              <li>
                Copy <strong>Client ID</strong> →{" "}
                <code>GITHUB_ID</code>
              </li>
              <li>
                Copy <strong>Client Secret</strong> →{" "}
                <code>GITHUB_SECRET</code>
              </li>
            </ul>
            <p className="text-xs opacity-70">
              Add to <code>.env.local</code> or Vercel environment variables.
            </p>
          </div>
        </PanelFrame>

        {/* Step 3: Upstash Redis */}
        <PanelFrame title="STEP 3 — Upstash Redis">
          <div className="space-y-2">
            <p>
              <StatusIcon ok={!!status?.redisConnected} />{" "}
              <span className="text-[#ffb000]">Upstash Redis</span>{" "}
              {status?.redisConnected ? (
                <span className="text-[#00ff41]">connected</span>
              ) : (
                <span className="text-[#ff4444]">not configured</span>
              )}
            </p>
            <a
              href="https://console.upstash.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1 text-xs border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
            >
              Create Redis Database
            </a>
            <ul className="text-xs opacity-70 list-disc list-inside space-y-1">
              <li>
                Copy <strong>REST URL</strong> →{" "}
                <code>UPSTASH_REDIS_REST_URL</code>
              </li>
              <li>
                Copy <strong>REST Token</strong> →{" "}
                <code>UPSTASH_REDIS_REST_TOKEN</code>
              </li>
            </ul>
          </div>
        </PanelFrame>

        {/* Step 4: Restart */}
        <PanelFrame title="STEP 4 — Restart / Redeploy">
          <div className="space-y-2">
            <p className="text-xs opacity-70">
              After setting all environment variables, restart your dev server or
              redeploy on Vercel.
            </p>
            <button
              onClick={checkStatus}
              disabled={loading}
              className="px-3 py-1 text-xs border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors disabled:opacity-50"
            >
              {loading ? "Checking..." : "Recheck"}
            </button>
          </div>
        </PanelFrame>
      </div>
    </div>
  );
}
