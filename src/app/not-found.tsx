import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center px-4 py-16">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-[var(--terminal-amber)] glow-text-amber text-2xl">
          404: ROOM NOT FOUND
        </h1>
        <p className="text-[var(--terminal-green)] text-sm leading-relaxed">
          You have stumbled into a part of the universe that doesn&apos;t exist.
          This is more common than you&apos;d think.
        </p>
        <p className="text-[var(--terminal-dim)] text-sm">
          The Guide suggests going back to somewhere that does exist.
        </p>
        <Link
          href="/"
          className="inline-block border border-[var(--terminal-green)] text-[var(--terminal-green)] px-6 py-3 hover:bg-[var(--terminal-green)] hover:text-black transition-colors"
        >
          ▸ Return to Safety
        </Link>
      </div>
    </div>
  );
}
