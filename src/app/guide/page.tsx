import Link from "next/link";

const BORDER_TOP = "╔══════════════════════════════════════════════════════════════╗";
const BORDER_BOT = "╚══════════════════════════════════════════════════════════════╝";
const BORDER_SEP = "╠══════════════════════════════════════════════════════════════╣";
const B = "║";

function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="my-6">
      <pre className="text-[var(--terminal-border)] text-xs leading-tight select-none">
        {BORDER_TOP}
      </pre>
      {title && (
        <>
          <pre className="text-[var(--terminal-amber)] glow-text-amber text-xs leading-tight">
            {B} {title.padEnd(61)}{B}
          </pre>
          <pre className="text-[var(--terminal-border)] text-xs leading-tight select-none">
            {BORDER_SEP}
          </pre>
        </>
      )}
      <div className="border-x border-[var(--terminal-border)] px-4 py-3">
        {children}
      </div>
      <pre className="text-[var(--terminal-border)] text-xs leading-tight select-none">
        {BORDER_BOT}
      </pre>
    </section>
  );
}

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-mono p-4 sm:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <header className="text-center my-8">
        <pre className="text-[var(--terminal-amber)] glow-text-amber text-xs sm:text-sm leading-tight inline-block text-left">
{`
 ╔═══════════════════════════════════════════════╗
 ║  THE HITCHHIKER'S GUIDE TO GITHUB COPILOT    ║
 ║  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   ║
 ║  A QuestGen Companion Document                ║
 ╚═══════════════════════════════════════════════╝`}
        </pre>
        <p className="mt-4 text-[var(--terminal-green)] glow-text text-sm">
          DON&apos;T PANIC. Getting GitHub Copilot is easier than finding
          a decent restaurant at the end of the universe.
        </p>
      </header>

      {/* What is GitHub Copilot? */}
      <Section title="WHAT IS GITHUB COPILOT?">
        <p className="text-sm leading-relaxed">
          GitHub Copilot is an AI coding assistant that — among its many
          talents — provides access to a variety of large language models.
          QuestGen piggybacks on this so you don&apos;t need to sign up for
          separate AI services or manage your own API keys.
        </p>
        <p className="text-sm leading-relaxed mt-2 text-[var(--terminal-dim)]">
          Think of it as a towel: the most massively useful thing an
          interstellar hitchhiker — or aspiring text adventurer — can have.
        </p>
      </Section>

      {/* Step-by-Step Signup */}
      <Section title="STEP-BY-STEP SIGNUP (4 EASY STEPS)">
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-[var(--terminal-amber)]">
              Step 1: Navigate to Copilot Settings
            </p>
            <p className="ml-4 mt-1">
              Point your sub-etha browser to{" "}
              <a
                href="https://github.com/settings/copilot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--terminal-amber)] underline hover:brightness-125"
              >
                github.com/settings/copilot
              </a>
            </p>
            <p className="ml-4 text-[var(--terminal-dim)]">
              (If you don&apos;t have a GitHub account yet, you&apos;ll need one.
              Creating it is free, painless, and does not require a babel fish.)
            </p>
          </div>

          <div>
            <p className="text-[var(--terminal-amber)]">
              Step 2: Sign Up for GitHub Copilot Free
            </p>
            <p className="ml-4 mt-1">
              Select the free tier. It includes a limited number of completions
              per month — more than enough for most adventures, unless you&apos;re
              attempting to map the entire Infinite Improbability Drive.
            </p>
          </div>

          <div>
            <p className="text-[var(--terminal-amber)]">
              Step 3: Return to QuestGen and Sign In
            </p>
            <p className="ml-4 mt-1">
              Come back here and sign in with your GitHub account.
              The system will detect your Copilot access automatically.
              No forms to fill. No secret handshakes. No Vogon poetry.
            </p>
          </div>

          <div>
            <p className="text-[var(--terminal-amber)]">
              Step 4: Start Adventuring!
            </p>
            <p className="ml-4 mt-1">
              You&apos;re done. Seriously. Go start a new game.
              The universe awaits, and it&apos;s only mildly hostile.
            </p>
          </div>
        </div>
      </Section>

      {/* BYOK Alternative */}
      <Section title="BYOK — BRING YOUR OWN KEY">
        <p className="text-sm leading-relaxed">
          If you already have an OpenAI, Anthropic, or Azure account, you can
          use your own API key instead. Go to Settings to configure.
        </p>
        <p className="text-sm leading-relaxed mt-2 text-[var(--terminal-dim)]">
          This is the option for seasoned galactic hitchhikers who prefer
          to carry their own towel rather than borrowing one from the ship.
        </p>
      </Section>

      {/* FAQ */}
      <Section title="FREQUENTLY ASKED QUESTIONS">
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-[var(--terminal-amber)]">
              &quot;Is it really free?&quot;
            </p>
            <p className="ml-4 mt-1">
              Yes. GitHub Copilot Free tier includes limited usage per month at
              absolutely zero cost. The answer to life, the universe, and
              everything is 42 — the answer to &quot;how much does it cost&quot;
              is $0.
            </p>
          </div>

          <div>
            <p className="text-[var(--terminal-amber)]">
              &quot;What models can I use?&quot;
            </p>
            <p className="ml-4 mt-1">
              Various models are available through Copilot, including GPT and
              Claude variants. The exact lineup changes occasionally — much like
              the menu at Milliways.
            </p>
          </div>

          <div>
            <p className="text-[var(--terminal-amber)]">
              &quot;What if I run out of completions?&quot;
            </p>
            <p className="ml-4 mt-1">
              You have two options: switch to BYOK (bring your own key) and
              configure a direct API key in Settings, or simply wait for your
              monthly allocation to reset. Time, as they say, is an illusion.
              Lunchtime doubly so.
            </p>
          </div>
        </div>
      </Section>

      {/* Back link */}
      <div className="text-center my-8">
        <Link
          href="/"
          className="text-[var(--terminal-amber)] underline hover:brightness-125 text-sm"
        >
          ← Back to Dashboard
        </Link>
        <p className="mt-2 text-xs text-[var(--terminal-dim)]">
          So long, and thanks for all the fish.
        </p>
      </div>
    </div>
  );
}
