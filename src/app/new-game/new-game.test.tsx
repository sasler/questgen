import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import NewGamePage from "./page";

const validSettings = {
  generationModel: "gpt-4o",
  gameplayModel: "gpt-4o-mini",
  responseLength: "moderate",
  provider: "copilot",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  localStorage.clear();
  localStorage.setItem("questgen-settings", JSON.stringify(validSettings));
});

describe("NewGamePage", () => {
  it("renders form fields (description, size, genre)", () => {
    render(<NewGamePage />);

    expect(
      screen.getByPlaceholderText(
        /derelict space station/i,
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("Small")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Large")).toBeInTheDocument();
    expect(screen.getByText("Epic")).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText(/sci-fi, mystery, horror, comedy/i),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /generate world/i }),
    ).toBeInTheDocument();
  });

  it("default size is medium", () => {
    render(<NewGamePage />);

    const mediumRadio = screen.getByRole("radio", { name: /medium/i });
    expect(mediumRadio).toBeChecked();
  });

  it("validates description minimum length", async () => {
    const user = userEvent.setup();
    render(<NewGamePage />);

    const descInput = screen.getByPlaceholderText(/derelict space station/i);
    const generateBtn = screen.getByRole("button", { name: /generate world/i });

    await user.type(descInput, "short");
    await user.click(generateBtn);

    expect(
      screen.getByText(/at least 10 characters/i),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows loading state during generation", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

    render(<NewGamePage />);

    const descInput = screen.getByPlaceholderText(/derelict space station/i);
    await user.type(descInput, "A mysterious abandoned laboratory deep underground");
    await user.click(screen.getByRole("button", { name: /generate world/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate world/i })).toBeDisabled();
    });

    expect(screen.getByTestId("loading-message")).toBeInTheDocument();
  });

  it("calls API with correct payload", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ gameId: "game-123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<NewGamePage />);

    const descInput = screen.getByPlaceholderText(/derelict space station/i);
    await user.type(descInput, "A mysterious abandoned laboratory deep underground");

    // Select "large"
    await user.click(screen.getByRole("radio", { name: /large/i }));

    const genreInput = screen.getByPlaceholderText(
      /sci-fi, mystery, horror, comedy/i,
    );
    await user.clear(genreInput);
    await user.type(genreInput, "horror");

    await user.click(screen.getByRole("button", { name: /generate world/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/game/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: {
            description:
              "A mysterious abandoned laboratory deep underground",
            size: "large",
            genre: "horror",
          },
          settings: validSettings,
        }),
      });
    });
  });

  it("redirects on success", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ gameId: "game-abc" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<NewGamePage />);

    await user.type(
      screen.getByPlaceholderText(/derelict space station/i),
      "A mysterious abandoned laboratory deep underground",
    );
    await user.click(screen.getByRole("button", { name: /generate world/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/game/game-abc");
    });
  });

  it("shows error on failure", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Generation failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<NewGamePage />);

    await user.type(
      screen.getByPlaceholderText(/derelict space station/i),
      "A mysterious abandoned laboratory deep underground",
    );
    await user.click(screen.getByRole("button", { name: /generate world/i }));

    await waitFor(() => {
      expect(screen.getByText(/generation failed/i)).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });
});
