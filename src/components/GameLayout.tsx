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
      className="relative h-dvh grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_420px] bg-[#0a0a0a] text-[#00ff41] font-mono overflow-hidden"
    >
      {/* Scanline CRT overlay */}
      <div
        data-testid="scanline-overlay"
        className="pointer-events-none absolute inset-0 z-50 scanline-overlay"
        aria-hidden="true"
      />

      {/* Center — Terminal area */}
      <main className="order-1 md:order-none overflow-auto min-h-0">
        {children}
      </main>

      {/* Right sidebar — Map + Inventory + Room Info */}
      <aside
        data-testid="right-sidebar"
        className="order-2 md:order-none flex flex-col overflow-auto border-t md:border-t-0 md:border-l border-[#1a3a1a]"
      >
        <div
          data-testid="map-panel"
          className="min-h-0 overflow-auto border-b border-[#1a3a1a] p-3"
        >
          {mapSlot}
        </div>
        <div className="min-h-0 overflow-auto border-b border-[#1a3a1a] p-3">
          {inventorySlot}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {roomInfoSlot}
        </div>
      </aside>
    </div>
  );
}
