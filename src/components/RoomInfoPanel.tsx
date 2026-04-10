import type { Item, NPC, Room, Direction } from "@/types";

interface RoomInfoPanelProps {
  room: Room | null;
  items: Item[];
  npcs: NPC[];
  exits: Array<{
    direction: Direction;
    roomName: string;
    locked: boolean;
    hidden: boolean;
  }>;
}

export function RoomInfoPanel({ room, items, npcs, exits }: RoomInfoPanelProps) {
  if (!room) {
    return (
      <div className="bg-gray-950 border border-green-900 rounded p-3 font-mono text-sm text-green-400">
        <p className="text-green-700 italic">
          You appear to be nowhere. This is concerning.
        </p>
      </div>
    );
  }

  const visibleExits = exits.filter((e) => !e.hidden);

  return (
    <div className="bg-gray-950 border border-green-900 rounded p-3 font-mono text-sm text-green-400 space-y-2">
      {/* Room header */}
      <h2 className="text-green-300 font-bold uppercase tracking-wider text-xs border-b border-green-900 pb-1">
        {room.name}
      </h2>

      {/* Description */}
      <p className="text-green-600 text-xs leading-relaxed">{room.description}</p>

      {/* Items */}
      {items.length > 0 && (
        <div>
          <span className="text-amber-400 text-xs font-bold">You see: </span>
          <ul className="inline">
            {items.map((item, i) => (
              <li key={item.id} className="inline text-green-400 text-xs">
                <span className="text-green-600 mr-0.5">▸</span>
                {item.name}
                {i < items.length - 1 && <span className="text-green-800">, </span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* NPCs */}
      {npcs.length > 0 && (
        <div>
          <span className="text-amber-400 text-xs font-bold">Present: </span>
          <ul className="inline">
            {npcs.map((npc, i) => (
              <li key={npc.id} className="inline text-green-400 text-xs">
                {npc.name}
                {i < npcs.length - 1 && <span className="text-green-800">, </span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Exits */}
      {visibleExits.length > 0 && (
        <div>
          <span className="text-amber-400 text-xs font-bold">Exits: </span>
          <ul className="space-y-0.5 mt-0.5">
            {visibleExits.map((exit) => (
              <li key={exit.direction} className="text-xs">
                <span className="text-green-300">{exit.direction}</span>
                <span className="text-green-700"> → </span>
                <span className="text-green-500">{exit.roomName}</span>
                {exit.locked && (
                  <span className="text-red-500 ml-1" title="Locked">
                    🔒
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
