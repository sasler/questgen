import Link from "next/link";
import { auth } from "@/lib/auth";

const ASCII_TITLE = `
 ██████  ██    ██ ███████ ███████ ████████  ██████  ███████ ███    ██
██    ██ ██    ██ ██      ██         ██    ██       ██      ████   ██
██    ██ ██    ██ █████   ███████    ██    ██   ███ █████   ██ ██  ██
██ ▄▄ ██ ██    ██ ██           ██    ██    ██    ██ ██      ██  ██ ██
 ██████   ██████  ███████ ███████    ██     ██████  ███████ ██   ████
    ▀▀
`.trimStart();

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-col flex-1 items-center px-4 py-12">
      <main className="w-full max-w-3xl flex flex-col items-center gap-8">
        {/* ASCII Title */}
        <pre
          className="text-[var(--terminal-green)] glow-text text-[0.45rem] sm:text-xs leading-tight text-center select-none"
          aria-hidden="true"
        >
          {ASCII_TITLE}
        </pre>
        <h1 className="sr-only">QUESTGEN</h1>

        {/* Tagline */}
        <p className="text-[var(--terminal-amber)] glow-text-amber text-lg text-center">
          An AI-Powered Text Adventure. Don&apos;t Panic.
        </p>

        {/* Description */}
        <p className="text-[var(--terminal-dim)] text-sm text-center max-w-xl leading-relaxed">
          QuestGen uses the GitHub Copilot SDK to generate entire text adventure
          worlds on-the-fly. Every dungeon, puzzle, and snarky NPC is conjured
          by AI — so no two playthroughs are ever the same. It&apos;s like Zork
          met a large language model at a party and things escalated.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 mt-2">
          {session ? (
            <Link
              href="/dashboard"
              className="border border-[var(--terminal-green)] text-[var(--terminal-green)] px-6 py-3 text-center hover:bg-[var(--terminal-green)] hover:text-black transition-colors"
            >
              ▸ Dashboard
            </Link>
          ) : (
            <Link
              href="/api/auth/signin"
              className="border border-[var(--terminal-green)] text-[var(--terminal-green)] px-6 py-3 text-center hover:bg-[var(--terminal-green)] hover:text-black transition-colors"
            >
              ▸ Sign In with GitHub
            </Link>
          )}
          <Link
            href="/guide"
            className="border border-[var(--terminal-dim)] text-[var(--terminal-dim)] px-6 py-3 text-center hover:border-[var(--terminal-green)] hover:text-[var(--terminal-green)] transition-colors"
          >
            ▸ Read the Guide
          </Link>
        </div>

        {/* How it Works */}
        <section className="w-full mt-8 border border-[var(--terminal-border)] p-6">
          <h2 className="text-[var(--terminal-amber)] glow-text-amber text-sm mb-4">
            HOW IT WORKS
          </h2>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="text-[var(--terminal-amber)]">1.</span>
              <span>
                <Link
                  href="/guide"
                  className="text-[var(--terminal-green)] underline"
                >
                  Get GitHub Copilot (free)
                </Link>
                {" "}— your ticket to the improbability drive
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--terminal-amber)]">2.</span>
              <span>Generate a world with AI — describe it, and it shall be</span>
            </li>
            <li className="flex gap-3">
              <span className="text-[var(--terminal-amber)]">3.</span>
              <span>
                Explore, solve puzzles, don&apos;t die — easier said than done
              </span>
            </li>
          </ol>
        </section>

        {/* Footer */}
        <footer className="mt-12 text-[var(--terminal-dim)] text-xs text-center">
          Powered by the Copilot SDK and an improbability drive
        </footer>
      </main>
    </div>
  );
}
