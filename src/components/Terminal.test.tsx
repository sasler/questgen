import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Terminal } from "./Terminal";
import type { TurnEntry } from "@/types";

// Mock scrollIntoView since jsdom doesn't implement it
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeTurn(
  overrides: Partial<TurnEntry> & Pick<TurnEntry, "role" | "text">
): TurnEntry {
  return {
    turnId: crypto.randomUUID(),
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("Terminal", () => {
  it("renders welcome message when no entries", () => {
    render(<Terminal entries={[]} welcomeMessage="Welcome, adventurer!" />);
    expect(screen.getByText("Welcome, adventurer!")).toBeInTheDocument();
  });

  it("renders player entries with > prefix", () => {
    const entries: TurnEntry[] = [
      makeTurn({ role: "player", text: "look around" }),
    ];
    render(<Terminal entries={entries} />);
    expect(screen.getByText(/^>\s*look around$/)).toBeInTheDocument();
  });

  it("renders narrator entries", () => {
    const entries: TurnEntry[] = [
      makeTurn({
        role: "narrator",
        text: "You are in a dark forest.",
      }),
    ];
    render(<Terminal entries={entries} />);
    expect(
      screen.getByText("You are in a dark forest.")
    ).toBeInTheDocument();
  });

  it("shows loading indicator when isLoading=true and no streamingText", () => {
    render(<Terminal entries={[]} isLoading={true} />);
    expect(screen.getByTestId("typing-indicator")).toBeInTheDocument();
  });

  it("does not show loading indicator when isLoading=false", () => {
    render(<Terminal entries={[]} isLoading={false} />);
    expect(screen.queryByTestId("typing-indicator")).not.toBeInTheDocument();
  });

  it("shows streaming text when provided", () => {
    render(
      <Terminal
        entries={[]}
        isLoading={true}
        streamingText="The door creaks open slowly"
      />
    );
    expect(
      screen.getByText(/The door creaks open slowly/)
    ).toBeInTheDocument();
    // Should not show typing indicator when streaming
    expect(screen.queryByTestId("typing-indicator")).not.toBeInTheDocument();
  });

  it("hides the welcome message while streaming text is visible", () => {
    render(
      <Terminal
        entries={[]}
        welcomeMessage="Welcome, adventurer!"
        streamingText="You wake to the hum of improbable machinery."
      />
    );

    expect(screen.queryByText("Welcome, adventurer!")).not.toBeInTheDocument();
    expect(
      screen.getByText(/You wake to the hum of improbable machinery./),
    ).toBeInTheDocument();
  });

  it("does not show welcome message when entries exist", () => {
    const entries: TurnEntry[] = [
      makeTurn({ role: "narrator", text: "You wake up." }),
    ];
    render(
      <Terminal entries={entries} welcomeMessage="Welcome, adventurer!" />
    );
    expect(screen.queryByText("Welcome, adventurer!")).not.toBeInTheDocument();
  });

  it("handles empty entries array", () => {
    const { container } = render(<Terminal entries={[]} />);
    expect(container.querySelector("[data-testid='terminal']")).toBeInTheDocument();
  });

  it("renders multiple entries in order", () => {
    const entries: TurnEntry[] = [
      makeTurn({ role: "player", text: "go north" }),
      makeTurn({ role: "narrator", text: "You enter a cave." }),
      makeTurn({ role: "player", text: "look around" }),
      makeTurn({
        role: "narrator",
        text: "The cave is damp and dark.",
      }),
    ];
    render(<Terminal entries={entries} />);

    const terminalEl = screen.getByTestId("terminal");
    const text = terminalEl.textContent ?? "";

    expect(text.indexOf("go north")).toBeLessThan(
      text.indexOf("You enter a cave.")
    );
    expect(text.indexOf("You enter a cave.")).toBeLessThan(
      text.indexOf("look around")
    );
    expect(text.indexOf("look around")).toBeLessThan(
      text.indexOf("The cave is damp and dark.")
    );
  });

  it("applies correct styling classes for player entries", () => {
    const entries: TurnEntry[] = [
      makeTurn({ role: "player", text: "open chest" }),
    ];
    render(<Terminal entries={entries} />);

    const playerEntry = screen.getByText(/^>\s*open chest$/).closest("[data-role]");
    expect(playerEntry).toHaveAttribute("data-role", "player");
  });

  it("applies correct styling classes for narrator entries", () => {
    const entries: TurnEntry[] = [
      makeTurn({ role: "narrator", text: "The chest is locked." }),
    ];
    render(<Terminal entries={entries} />);

    const narratorEntry = screen
      .getByText("The chest is locked.")
      .closest("[data-role]");
    expect(narratorEntry).toHaveAttribute("data-role", "narrator");
  });
});
