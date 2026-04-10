import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) =>
    React.createElement("a", { href, ...props }, children),
}));

import SetupPage from "./page";

const unconfiguredResponse = {
  auth: false,
  secret: false,
  redis: false,
  redisConnected: false,
  allConfigured: false,
};

const fullyConfiguredResponse = {
  auth: true,
  secret: true,
  redis: true,
  redisConnected: true,
  allConfigured: true,
};

function mockFetchResponse(data: Record<string, unknown>) {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Setup Page", () => {
  it("renders page title", async () => {
    mockFetchResponse(unconfiguredResponse);
    render(<SetupPage />);
    expect(screen.getByText(/SYSTEM INITIALIZATION/i)).toBeInTheDocument();
  });

  it("shows loading state while checking", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response(JSON.stringify(unconfiguredResponse), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                })
              ),
            5000
          )
        )
    );
    render(<SetupPage />);
    expect(
      screen.getByText(/Checking system configuration/i)
    ).toBeInTheDocument();
  });

  it("shows unconfigured state with all steps red", async () => {
    mockFetchResponse(unconfiguredResponse);
    render(<SetupPage />);

    await waitFor(() => {
      const markers = screen.getAllByText("✗");
      expect(markers.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("shows fully configured state with continue link", async () => {
    mockFetchResponse(fullyConfiguredResponse);
    render(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByText(/all systems go/i)).toBeInTheDocument();
    });

    const continueLink = screen.getByRole("link", { name: /continue/i });
    expect(continueLink).toHaveAttribute("href", "/");
  });

  it("generate secret button creates a base64 string", async () => {
    mockFetchResponse(unconfiguredResponse);
    const user = userEvent.setup();
    render(<SetupPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
    });

    const generateBtn = screen.getByRole("button", { name: /generate/i });
    await user.click(generateBtn);

    const secretDisplay = screen.getByTestId("generated-secret");
    expect(secretDisplay.textContent!.length).toBeGreaterThanOrEqual(20);
  });

  it("Create OAuth App link includes correct callback URL", async () => {
    mockFetchResponse(unconfiguredResponse);
    render(<SetupPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /create oauth app/i })
      ).toBeInTheDocument();
    });

    const oauthLink = screen.getByRole("link", { name: /create oauth app/i });
    const href = oauthLink.getAttribute("href")!;
    expect(href).toContain("github.com/settings/applications/new");
    expect(href).toContain("callback_url");
    expect(href).toContain("api%2Fauth%2Fcallback%2Fgithub");
  });
});
