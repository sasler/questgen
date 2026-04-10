"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-[var(--terminal-error)] text-2xl">
          FATAL ERROR IN THE IMPROBABILITY DRIVE
        </h1>
        <p className="text-[var(--terminal-green)] text-sm leading-relaxed">
          Something went wrong. The probability of this exact error occurring was
          approximately 1 in 42.
        </p>
        {error.digest && (
          <p className="text-[var(--terminal-dim)] text-xs">
            Error digest: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
          <button
            onClick={reset}
            className="border border-[var(--terminal-green)] text-[var(--terminal-green)] px-6 py-3 hover:bg-[var(--terminal-green)] hover:text-black transition-colors cursor-pointer"
          >
            ▸ Try Again
          </button>
          <Link
            href="/dashboard"
            className="border border-[var(--terminal-dim)] text-[var(--terminal-dim)] px-6 py-3 hover:border-[var(--terminal-green)] hover:text-[var(--terminal-green)] transition-colors"
          >
            ▸ Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
