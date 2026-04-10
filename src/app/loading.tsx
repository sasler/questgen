export default function Loading() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center px-4 py-16">
      <div className="text-center space-y-4">
        <p className="text-[var(--terminal-green)] glow-text text-sm animate-pulse">
          Consulting the Guide...
        </p>
        <p className="text-[var(--terminal-green)] text-lg">
          <span className="inline-block w-2 animate-pulse">█</span>
        </p>
      </div>
    </div>
  );
}
