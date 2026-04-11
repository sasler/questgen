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
  return ok ? <span className="text-[#00ff41]">✓</span> : <span className="text-[#ff4444]">✗</span>;
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
  const [statusUnavailable, setStatusUnavailable] = useState(false);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    setStatusUnavailable(false);
    try {
      const res = await fetch("/api/setup/check");
      if (!res.ok) {
        throw new Error("Status unavailable");
      }
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
      setStatusUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const [origin, setOrigin] = useState("http://localhost:3000");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
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
          <p className="text-[#00ff41] mt-2 text-sm opacity-70">One-time deployment setup</p>
          <p className="text-[#4a6741] mt-3 text-xs leading-relaxed">
            This page is only for the person deploying QuestGen. Regular players should only see a
            GitHub connect button, not any of this.
          </p>
        </div>

        {loading && !status && (
          <div className="text-center text-[#ffb000] animate-pulse">
            &gt; Checking system configuration...
          </div>
        )}
        {statusUnavailable && (
          <PanelFrame title="LOCAL STATUS CHECKS">
            <p className="text-xs text-[#4a6741] leading-relaxed">
              Live setup checks are only available on localhost. On Vercel, set the deployment owner
              variables in the dashboard and redeploy.
            </p>
          </PanelFrame>
        )}

        {status?.allConfigured && (
          <PanelFrame title="STATUS">
            <div className="text-center py-4 space-y-3">
              <p className="text-2xl">🎉</p>
              <p className="text-[#00ff41] text-lg font-bold">All systems go!</p>
              <Link
                href="/"
                className="inline-block mt-2 px-4 py-2 border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-[#0a0a0a] transition-colors"
              >
                Continue to QuestGen →
              </Link>
            </div>
          </PanelFrame>
        )}

        <PanelFrame title="STEP 1 — Secure Sessions">
          <div className="space-y-2">
            <p>
              <StatusIcon ok={!!status?.secret} />{" "}
              <span className="text-[#ffb000]">Session secret</span>{" "}
              {status?.secret ? (
                <span className="text-[#00ff41]">ready</span>
              ) : (
                <span className="text-[#ff4444]">missing</span>
              )}
            </p>
            <p className="text-xs opacity-70">
              QuestGen needs one private random value to keep login sessions safe.
            </p>
            <button
              onClick={() => setGeneratedSecret(generateSecret())}
              className="mt-1 px-3 py-1 text-xs border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
            >
              Generate secret
            </button>
            {generatedSecret && (
              <code
                data-testid="generated-secret"
                className="block bg-[#0a0a0a] border border-[#00ff41] px-2 py-1 text-xs break-all text-[#00ff41]"
              >
                {generatedSecret}
              </code>
            )}
            <details className="text-xs opacity-70">
              <summary className="cursor-pointer text-[#ffb000]">Technical details</summary>
              <div className="mt-2 space-y-2">
                <p>
                  Save it as <code>AUTH_SECRET</code> in <code>.env.local</code> or Vercel.
                </p>
                <code className="block bg-[#0a0a0a] border border-[#1a3a1a] px-2 py-1">
                  openssl rand -base64 32
                </code>
              </div>
            </details>
          </div>
        </PanelFrame>

        <PanelFrame title="STEP 2 — Enable GitHub Sign-In">
          <div className="space-y-2">
            <p>
              <StatusIcon ok={!!status?.auth} />{" "}
              <span className="text-[#ffb000]">GitHub sign-in</span>{" "}
              {status?.auth ? (
                <span className="text-[#00ff41]">ready</span>
              ) : (
                <span className="text-[#ff4444]">missing</span>
              )}
            </p>
            <p className="text-xs opacity-70 leading-relaxed">
              Players use their own GitHub account and their own Copilot subscription. GitHub still
              requires the app owner to register the sign-in app once.
            </p>
            <a
              href={oauthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1 text-xs border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
            >
              Create GitHub OAuth App
            </a>
            <details className="text-xs opacity-70">
              <summary className="cursor-pointer text-[#ffb000]">Technical details</summary>
              <div className="mt-2 space-y-2">
                <p>After creating the app, copy:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong>Client ID</strong> → <code>GITHUB_ID</code> or{" "}
                    <code>GITHUB_CLIENT_ID</code>
                  </li>
                  <li>
                    <strong>Client Secret</strong> → <code>GITHUB_SECRET</code> or{" "}
                    <code>GITHUB_CLIENT_SECRET</code>
                  </li>
                </ul>
                <p>
                  Add both to <code>.env.local</code> or Vercel environment variables.
                </p>
                <p>
                  If you set <code>NEXTAUTH_URL</code>, use your QuestGen app URL (for example{" "}
                  <code>https://your-app.vercel.app</code>), not an Upstash URL.
                </p>
              </div>
            </details>
          </div>
        </PanelFrame>

        <PanelFrame title="STEP 3 — Connect Save Storage">
          <div className="space-y-2">
            <p>
              <StatusIcon ok={!!status?.redisConnected} />{" "}
              <span className="text-[#ffb000]">Saved games storage</span>{" "}
              {status?.redisConnected ? (
                <span className="text-[#00ff41]">connected</span>
              ) : (
                <span className="text-[#ff4444]">not configured</span>
              )}
            </p>
            <p className="text-xs opacity-70">
              QuestGen stores worlds and save data in Upstash Redis.
            </p>
            <a
              href="https://console.upstash.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1 text-xs border border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0a0a] transition-colors"
            >
              Create Redis Database
            </a>
            <details className="text-xs opacity-70">
              <summary className="cursor-pointer text-[#ffb000]">Technical details</summary>
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li>
                  <strong>REST URL</strong> → <code>UPSTASH_REDIS_REST_URL</code>
                </li>
                <li>
                  <strong>REST Token</strong> → <code>UPSTASH_REDIS_REST_TOKEN</code>
                </li>
              </ul>
            </details>
          </div>
        </PanelFrame>

        <PanelFrame title="STEP 4 — Recheck">
          <div className="space-y-2">
            <p className="text-xs opacity-70">
              After saving the owner settings, restart your local dev server or redeploy on Vercel,
              then recheck below.
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
