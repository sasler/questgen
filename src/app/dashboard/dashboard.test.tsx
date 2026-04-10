import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GameMetadata } from "@/types";

// Mock next-auth/react
const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import DashboardPage from "./page";

function makeGame(overrides: Partial<GameMetadata> = {}): GameMetadata {
  return {
    id: "game-1",
    userId: "user@test.com",
    title: "The Lost Temple",
    description: "An ancient temple filled with traps and treasure awaits.",
    size: "medium",
    createdAt: Date.now() - 86400000,
    lastPlayedAt: Date.now() - 3600000,
    turnCount: 42,
    completed: false,
    ...overrides,
  };
}

function mockSession(name = "Adventurer") {
  mockUseSession.mockReturnValue({
    data: { user: { name, email: "user@test.com" } },
    status: "authenticated",
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockSession();
  global.fetch = vi.fn();
});

describe("DashboardPage", () => {
  it("shows loading state initially", () => {
    // fetch never resolves
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );
    render(<DashboardPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders saved games after fetch", async () => {
    const games = [
      makeGame({ id: "g1", title: "The Lost Temple" }),
      makeGame({ id: "g2", title: "Space Odyssey", completed: true }),
    ];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ games }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("The Lost Temple")).toBeInTheDocument();
    });
    expect(screen.getByText("Space Odyssey")).toBeInTheDocument();
  });

  it("shows empty state when no games", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ games: [] }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/no adventures yet/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/start new game/i)).toBeInTheDocument();
  });

  it("continue button links to correct game URL", async () => {
    const games = [makeGame({ id: "game-abc" })];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ games }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("The Lost Temple")).toBeInTheDocument();
    });
    const continueLink = screen.getByRole("link", { name: /continue/i });
    expect(continueLink).toHaveAttribute("href", "/game/game-abc");
  });

  it("delete button calls DELETE API and removes card", async () => {
    const user = userEvent.setup();
    const games = [makeGame({ id: "del-1", title: "Doomed Quest" })];

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ games }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deleted: true }),
      });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Doomed Quest")).toBeInTheDocument();
    });

    // Click delete → shows confirmation
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    await user.click(deleteBtn);

    // Confirm deletion
    const confirmBtn = screen.getByRole("button", { name: /yes/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText("Doomed Quest")).not.toBeInTheDocument();
    });

    // Verify the DELETE fetch was called
    expect(global.fetch).toHaveBeenCalledWith("/api/game/del-1", {
      method: "DELETE",
    });
  });

  it("shows game metadata (title, turns, last played)", async () => {
    const games = [
      makeGame({
        id: "meta-1",
        title: "Dungeon Crawl",
        turnCount: 17,
        size: "large",
        lastPlayedAt: Date.now() - 7200000, // 2 hours ago
      }),
    ];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ games }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Dungeon Crawl")).toBeInTheDocument();
    });
    expect(screen.getByText(/17 turns/i)).toBeInTheDocument();
    expect(screen.getByText(/large/i)).toBeInTheDocument();
    expect(screen.getByText(/2 hours ago/i)).toBeInTheDocument();
  });

  it("new game button links to /new-game", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ games: [] }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/no adventures yet/i)).toBeInTheDocument();
    });

    const links = screen.getAllByRole("link", { name: /new game/i });
    expect(links.some((l) => l.getAttribute("href") === "/new-game")).toBe(
      true,
    );
  });

  it("shows COMPLETED badge for completed games", async () => {
    const games = [makeGame({ id: "c1", title: "Won Game", completed: true })];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ games }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Won Game")).toBeInTheDocument();
    });
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it("displays user greeting", async () => {
    mockSession("Link");
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ games: [] }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/link/i)).toBeInTheDocument();
    });
  });
});
