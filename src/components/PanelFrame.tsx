import React from "react";

interface PanelFrameProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function PanelFrame({ title, children, className = "" }: PanelFrameProps) {
  const padded = ` ${title} `;
  const bar = "═".repeat(Math.max(0, 20 - padded.length));

  return (
    <div
      className={`font-mono border border-[#1a3a1a] bg-[#0d1a0d] flex flex-col overflow-hidden ${className}`}
    >
      <div
        data-testid="panel-title-bar"
        className="px-2 py-1 text-[#ffb000] text-sm font-bold border-b border-[#1a3a1a] bg-[#0d1a0d] select-none shrink-0"
      >
        ╔═{padded}{bar}╗
      </div>
      <div className="p-2 overflow-auto flex-1 text-sm">{children}</div>
    </div>
  );
}
