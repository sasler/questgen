import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SETTINGS_STORAGE_KEY } from "@/lib/settings";
import SettingsPage from "./page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockModels = [
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", recommended: "generation" as const },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", recommended: "gameplay" as const },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai" },
];

const connectedStatus = {
  authConfigured: true,
  github: { connected: true, username: "testuser", avatar: "https://avatar.url" },
  copilot: { available: true },
};

const disconnectedStatus = {
  authConfigured: true,
  github: { connected: false },
  copilot: { available: false },
};

const unconfiguredDeploymentStatus = {
  authConfigured: false,
  github: { connected: false },
  copilot: { available: false },
};

function createMockFetch(statusOverride?: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    if (url === "/api/copilot/status") {
      return Promise.resolve({
        ok: true,
        json: async () => statusOverride ?? connectedStatus,
      });
    }
    // /api/models
    return Promise.resolve({
      ok: true,
      json: async () => ({
        models: mockModels,
        recommended: {
          generation: mockModels[0],
          gameplay: mockModels[1],
        },
      }),
    });
  });
}

function createFailingStatusFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if (url === "/api/copilot/status") {
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: "unavailable" }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({
        models: mockModels,
        recommended: {
          generation: mockModels[0],
          gameplay: mockModels[1],
        },
      }),
    });
  });
}

function createFlakyStatusFetch() {
  let statusCalls = 0;

  return vi.fn().mockImplementation((url: string) => {
    if (url === "/api/copilot/status") {
      statusCalls += 1;

      if (statusCalls === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => connectedStatus,
        });
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({ error: "unavailable" }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({
        models: mockModels,
        recommended: {
          generation: mockModels[0],
          gameplay: mockModels[1],
        },
      }),
    });
  });
}

function createCopilotRuntimeFailureFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if (url === "/api/copilot/status") {
      return Promise.resolve({
        ok: true,
        json: async () => connectedStatus,
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({
        models: [],
        recommended: {
          generation: null,
          gameplay: null,
        },
        error:
          "Could not resolve the @github/copilot CLI path. Ensure @github/copilot is installed, or set COPILOT_CLI_PATH.",
      }),
    });
  });
}

function createCopilotModelErrorFetch(error = "Could not find @github/copilot package.") {
  return vi.fn().mockImplementation((url: string) => {
    if (url === "/api/copilot/status") {
      return Promise.resolve({
        ok: true,
        json: async () => connectedStatus,
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({
        models: [],
        recommended: {
          generation: null,
          gameplay: null,
        },
        error,
      }),
    });
  });
}

function createPendingStatusFetch() {
  return vi.fn().mockImplementation(() => new Promise(() => {}));
}

function createConnectedWithoutTokenModelErrorFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if (url === "/api/copilot/status") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          authConfigured: true,
          github: { connected: true, username: "testuser" },
          copilot: { available: false },
        }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({
        models: [],
        recommended: {
          generation: null,
          gameplay: null,
        },
        error: "QuestGen couldn't load models right now.",
      }),
    });
  });
}

let storage: Record<string, string> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal("fetch", createMockFetch());
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key];
    }),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsPage", () => {
  it("renders provider selection with Copilot and BYOK options", async () => {
    render(<SettingsPage />);

    expect(await screen.findByLabelText(/github copilot/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bring your own key/i)).toBeInTheDocument();
  });

  it("shows BYOK config fields when BYOK is selected", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    const byokRadio = await screen.findByLabelText(/bring your own key/i);
    await user.click(byokRadio);

    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/base url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/openai/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/anthropic/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/azure/i)).toBeInTheDocument();
  });

  it("hides BYOK fields when Copilot is selected", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    // Switch to BYOK first
    const byokRadio = await screen.findByLabelText(/bring your own key/i);
    await user.click(byokRadio);
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();

    // Switch back to Copilot
    const copilotRadio = screen.getByLabelText(/github copilot/i);
    await user.click(copilotRadio);

    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/base url/i)).not.toBeInTheDocument();
  });

  it("renders model dropdowns after fetching models", async () => {
    render(<SettingsPage />);

    expect(await screen.findByLabelText(/world generation model/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gameplay model/i)).toBeInTheDocument();
  });

  it("renders response length options", async () => {
    render(<SettingsPage />);

    expect(await screen.findByLabelText(/brief/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/moderate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/detailed/i)).toBeInTheDocument();
  });

  it("saves settings to localStorage on save", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    // Wait for models to load and auto-select
    await screen.findByLabelText(/world generation model/i);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    expect(localStorage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
      expect.any(String),
    );

    const savedJson = (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: string[]) => c[0] === SETTINGS_STORAGE_KEY,
    )![1];
    const saved = JSON.parse(savedJson);

    expect(saved.provider).toBe("copilot");
    expect(saved.generationModel).toBe("gpt-4o");
    expect(saved.gameplayModel).toBe("gpt-4o-mini");
    expect(saved.responseLength).toBe("moderate");
  });

  it("loads existing settings from localStorage on mount", async () => {
    const existingSettings = {
      provider: "byok",
      byokType: "anthropic",
      byokBaseUrl: "https://api.anthropic.com",
      byokApiKey: "sk-test-123",
      generationModel: "gpt-3.5-turbo",
      gameplayModel: "gpt-3.5-turbo",
      responseLength: "detailed",
    };
    storage[SETTINGS_STORAGE_KEY] = JSON.stringify(existingSettings);

    render(<SettingsPage />);

    // Should have BYOK selected
    const byokRadio = await screen.findByLabelText(/bring your own key/i);
    expect(byokRadio).toBeChecked();

    // BYOK fields should be visible with saved values
    const apiKeyInput = screen.getByLabelText(/api key/i);
    expect(apiKeyInput).toHaveValue("sk-test-123");

    const baseUrlInput = screen.getByLabelText(/base url/i);
    expect(baseUrlInput).toHaveValue("https://api.anthropic.com");

    // Response length should be detailed
    expect(screen.getByLabelText(/detailed/i)).toBeChecked();
  });

  // -------------------------------------------------------------------
  // New: Connection Status tests
  // -------------------------------------------------------------------

  it("shows 'Connected' when GitHub session exists", async () => {
    vi.stubGlobal("fetch", createMockFetch(connectedStatus));

    render(<SettingsPage />);

    expect(await screen.findByText(/connected as/i)).toBeInTheDocument();
    expect(screen.getByText("testuser")).toBeInTheDocument();
    expect(screen.getByText(/player's own subscription/i)).toBeInTheDocument();
  });

  it("shows a loading state before the first status response instead of the owner setup warning", () => {
    vi.stubGlobal("fetch", createPendingStatusFetch());

    render(<SettingsPage />);

    expect(screen.getByText(/checking connection/i)).toBeInTheDocument();
    expect(screen.queryByText(/isn't enabled on this deployment/i)).not.toBeInTheDocument();
  });

  it("shows reconnect and retry actions when Copilot model loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      createCopilotModelErrorFetch("Could not find @github/copilot package. Searched 8 paths."),
    );

    render(<SettingsPage />);

    expect(
      await screen.findByText(/questgen couldn't load copilot models/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/deployment couldn't start the copilot runtime/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reconnect github copilot/i })).toHaveAttribute(
      "href",
      "/api/auth/signin?callbackUrl=%2Fsettings",
    );
    expect(screen.getAllByRole("button", { name: /retry model load/i }).length).toBeGreaterThan(0);
  });

  it("shows 'Not connected' when no session", async () => {
    vi.stubGlobal("fetch", createMockFetch(disconnectedStatus));

    render(<SettingsPage />);

    expect(await screen.findByRole("link", { name: /connect github copilot/i })).toBeInTheDocument();
    expect(screen.getByText(/no api key needed/i)).toBeInTheDocument();
  });

  it("shows deployer-only setup message when GitHub sign-in is unavailable on this deployment", async () => {
    vi.stubGlobal("fetch", createMockFetch(unconfiguredDeploymentStatus));

    render(<SettingsPage />);

    expect(await screen.findByText(/isn.t enabled on this deployment/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /owner setup/i })).toHaveAttribute("href", "/setup");
    expect(screen.queryByRole("link", { name: /connect github copilot/i })).not.toBeInTheDocument();
  });

  it("shows a transient status error instead of the owner-setup message when status fetch fails", async () => {
    vi.stubGlobal("fetch", createFailingStatusFetch());

    render(<SettingsPage />);

    expect(await screen.findByText(/couldn't check github copilot status/i)).toBeInTheDocument();
    expect(screen.queryByText(/isn't enabled on this deployment/i)).not.toBeInTheDocument();
  });

  it("shows a stale-status warning when refresh fails after an earlier success", async () => {
    vi.stubGlobal("fetch", createFlakyStatusFetch());
    const user = userEvent.setup();

    render(<SettingsPage />);

    await screen.findByText(/connected as/i);
    await user.click(screen.getByRole("button", { name: /refresh status/i }));

    expect(
      await screen.findByText(/details below may be stale/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/connected as/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh status/i })).toBeInTheDocument();
  });

  it("Refresh status button triggers re-fetch", async () => {
    const mockFetch = createMockFetch();
    vi.stubGlobal("fetch", mockFetch);
    const user = userEvent.setup();

    render(<SettingsPage />);

    // Wait for initial fetch to complete
    await screen.findByText(/connected as/i);

    const statusCalls = mockFetch.mock.calls.filter(
      (c: string[]) => c[0] === "/api/copilot/status",
    ).length;

    const testBtn = screen.getByRole("button", { name: /refresh status/i });
    await user.click(testBtn);

    await waitFor(() => {
      const newCalls = mockFetch.mock.calls.filter(
        (c: string[]) => c[0] === "/api/copilot/status",
      ).length;
      expect(newCalls).toBeGreaterThan(statusCalls);
    });
  });

  it("shows runtime recovery actions instead of blaming account entitlement when Copilot model loading fails", async () => {
    vi.stubGlobal("fetch", createCopilotRuntimeFailureFetch());

    render(<SettingsPage />);

    expect(await screen.findByText(/connected as/i)).toBeInTheDocument();
    expect(await screen.findByText(/couldn't load copilot models/i)).toBeInTheDocument();
    expect(screen.getAllByText(/could not resolve the @github\/copilot cli path/i).length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/copilot is not available for this account/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /retry model load/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /refresh status/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /disconnect github/i })).toBeInTheDocument();
  });

  it("shows reconnect guidance when the GitHub session is connected but missing a Copilot token", async () => {
    vi.stubGlobal("fetch", createConnectedWithoutTokenModelErrorFetch());

    render(<SettingsPage />);

    expect(await screen.findByText(/session needs to be refreshed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/missing the token needed to load copilot models/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reconnect github copilot/i })).toBeInTheDocument();
    expect(screen.queryByText(/questgen couldn't load copilot models/i)).not.toBeInTheDocument();
  });

  it("BYOK fields visible when BYOK provider selected", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    // Initially BYOK fields are hidden
    await screen.findByLabelText(/github copilot/i);
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();

    // Select BYOK
    await user.click(screen.getByLabelText(/bring your own key/i));

    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/base url/i)).toBeInTheDocument();
    expect(screen.getByText(/stored in your browser only/i)).toBeInTheDocument();
  });

  it("save uses shared saveSettings function", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await screen.findByLabelText(/world generation model/i);

    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    // saveSettings writes to localStorage with the shared key
    expect(localStorage.setItem).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
      expect.any(String),
    );
  });
});
