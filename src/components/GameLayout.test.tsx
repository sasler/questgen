import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GameLayout, PanelFrame } from "@/components";

describe("PanelFrame", () => {
  it("renders the title in a retro frame", () => {
    render(<PanelFrame title="MAP">Panel content here</PanelFrame>);
    expect(screen.getByText(/MAP/)).toBeInTheDocument();
    expect(screen.getByText("Panel content here")).toBeInTheDocument();
  });

  it("applies monospace font", () => {
    const { container } = render(
      <PanelFrame title="TEST">Content</PanelFrame>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toMatch(/font-mono/);
  });

  it("merges custom className", () => {
    const { container } = render(
      <PanelFrame title="INV" className="custom-class">
        Items
      </PanelFrame>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("custom-class");
  });

  it("renders box-drawing border characters in the title bar", () => {
    render(<PanelFrame title="ROOM">Info</PanelFrame>);
    const titleBar = screen.getByText(/ROOM/).closest("[data-testid='panel-title-bar']");
    expect(titleBar).toBeInTheDocument();
    expect(titleBar!.textContent).toMatch(/[╔═╗]/);
  });
});

describe("GameLayout", () => {
  const defaultProps = {
    mapSlot: <div data-testid="map">ASCII Map</div>,
    inventorySlot: <div data-testid="inventory">Inventory Items</div>,
    roomInfoSlot: <div data-testid="room-info">Room Details</div>,
  };

  it("renders all four slots", () => {
    render(
      <GameLayout {...defaultProps}>
        <div data-testid="terminal">Terminal Content</div>
      </GameLayout>,
    );

    expect(screen.getByTestId("map")).toBeInTheDocument();
    expect(screen.getByTestId("terminal")).toBeInTheDocument();
    expect(screen.getByTestId("inventory")).toBeInTheDocument();
    expect(screen.getByTestId("room-info")).toBeInTheDocument();
  });

  it("renders slot content text", () => {
    render(
      <GameLayout {...defaultProps}>
        <div>Terminal Content</div>
      </GameLayout>,
    );

    expect(screen.getByText("ASCII Map")).toBeInTheDocument();
    expect(screen.getByText("Terminal Content")).toBeInTheDocument();
    expect(screen.getByText("Inventory Items")).toBeInTheDocument();
    expect(screen.getByText("Room Details")).toBeInTheDocument();
  });

  it("has dark background for retro terminal aesthetic", () => {
    const { container } = render(
      <GameLayout {...defaultProps}>
        <div>Content</div>
      </GameLayout>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/bg-\[#0a0a0a\]/);
  });

  it("uses full viewport height", () => {
    const { container } = render(
      <GameLayout {...defaultProps}>
        <div>Content</div>
      </GameLayout>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/h-dvh/);
  });

  it("has responsive grid classes for desktop layout", () => {
    const { container } = render(
      <GameLayout {...defaultProps}>
        <div>Content</div>
      </GameLayout>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/md:grid-cols-\[250px_1fr_250px\]/);
  });

  it("stacks on mobile (single column by default)", () => {
    const { container } = render(
      <GameLayout {...defaultProps}>
        <div>Content</div>
      </GameLayout>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/grid-cols-1/);
  });

  it("applies terminal green text color", () => {
    const { container } = render(
      <GameLayout {...defaultProps}>
        <div>Content</div>
      </GameLayout>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/text-\[#00ff41\]/);
  });

  it("applies monospace font family", () => {
    const { container } = render(
      <GameLayout {...defaultProps}>
        <div>Content</div>
      </GameLayout>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/font-mono/);
  });

  it("has a scanline overlay element", () => {
    const { container } = render(
      <GameLayout {...defaultProps}>
        <div>Content</div>
      </GameLayout>,
    );
    const scanline = container.querySelector("[data-testid='scanline-overlay']");
    expect(scanline).toBeInTheDocument();
  });

  it("right sidebar contains both inventory and room info", () => {
    render(
      <GameLayout {...defaultProps}>
        <div>Content</div>
      </GameLayout>,
    );
    const rightSidebar = screen.getByTestId("right-sidebar");
    expect(rightSidebar).toContainElement(screen.getByTestId("inventory"));
    expect(rightSidebar).toContainElement(screen.getByTestId("room-info"));
  });
});
