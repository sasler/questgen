"use client";

import { useState } from "react";
import type { Item } from "@/types";

interface InventoryPanelProps {
  items: Item[];
  onItemClick?: (itemId: string) => void;
}

export function InventoryPanel({ items, onItemClick }: InventoryPanelProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="bg-gray-950 border border-green-900 rounded p-3 font-mono text-sm text-green-400">
      <div className="flex items-center justify-between mb-2 border-b border-green-900 pb-1">
        <span className="font-bold text-green-300 uppercase tracking-wider text-xs">
          Inventory
        </span>
        <span className="text-green-600 text-xs">[{items.length} items]</span>
      </div>

      {items.length === 0 ? (
        <p className="text-green-700 italic text-xs">
          Your pockets are empty. Remarkably, not even lint.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="group"
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                type="button"
                onClick={() => onItemClick?.(item.id)}
                className={`text-left w-full ${
                  onItemClick
                    ? "hover:text-amber-400 cursor-pointer"
                    : "cursor-default"
                }`}
              >
                <span className="text-green-600 mr-1">▸</span>
                {item.name}
              </button>
              {hoveredId === item.id && (
                <p className="text-green-700 text-xs pl-4 mt-0.5">
                  {item.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
