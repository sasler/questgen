import React from "react";

export interface GameLayoutProps {
  children: React.ReactNode;
  mapSlot: React.ReactNode;
  inventorySlot: React.ReactNode;
  roomInfoSlot: React.ReactNode;
}

export function GameLayout({
  children,
  mapSlot,
  inventorySlot,
  roomInfoSlot,
}: GameLayoutProps) {
  return (
    <div
      className="relative h-dvh grid grid-cols-1 md:grid-cols-[250px_1fr_250px] bg-[#0a0a0a] text-[#00ff41] font-mono overflow-hidden"
    >
      {/* Scanline CRT overlay */}
      <div
        data-testid="scanline-overlay"
        className="pointer-events-none absolute inset-0 z-50 scanline-overlay"
        aria-hidden="true"
      />

      {/* Left sidebar — Map */}
      <aside className="order-1 md:order-none overflow-auto border-b md:border-b-0 md:border-r border-[#1a3a1a]">
        {mapSlot}
      </aside>

      {/* Center — Terminal area */}
      <main className="order-2 md:order-none overflow-auto min-h-0">
        {children}
      </main>

      {/* Right sidebar — Inventory + Room Info */}
      <aside
        data-testid="right-sidebar"
        className="order-3 md:order-none flex flex-col overflow-auto border-t md:border-t-0 md:border-l border-[#1a3a1a]"
      >
        <div className="flex-1 min-h-0 overflow-auto">{inventorySlot}</div>
        <div className="flex-1 min-h-0 overflow-auto border-t border-[#1a3a1a]">
          {roomInfoSlot}
        </div>
      </aside>
    </div>
  );
}
