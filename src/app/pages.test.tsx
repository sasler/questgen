import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Mock auth from @/lib/auth
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------- Landing Page ----------

describe("Landing Page", () => {
  it("renders QUESTGEN title", async () => {
    mockAuth.mockResolvedValue(null);
    const { default: Page } = await import("./page");
    const jsx = await Page();
    render(jsx);
    expect(screen.getByText(/QUESTGEN/)).toBeInTheDocument();
  });

  it("shows sign-in link when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { default: Page } = await import("./page");
    const jsx = await Page();
    render(jsx);
    const signInLink = screen.getByRole("link", { name: /sign in/i });
    expect(signInLink).toHaveAttribute("href", "/api/auth/signin");
  });

  it("shows dashboard link when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { name: "Zaphod" } });
    const { default: Page } = await import("./page");
    const jsx = await Page();
    render(jsx);
    const dashLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashLink).toHaveAttribute("href", "/dashboard");
  });
});

// ---------- Not Found Page ----------

describe("Not Found Page", () => {
  it("renders 404 message", async () => {
    const { default: NotFound } = await import("./not-found");
    render(<NotFound />);
    expect(screen.getByText(/404/)).toBeInTheDocument();
    expect(screen.getByText(/room not found/i)).toBeInTheDocument();
  });
});

// ---------- Error Page ----------

describe("Error Page", () => {
  it("renders error message and retry button", async () => {
    const { default: ErrorPage } = await import("./error");
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    expect(
      screen.getByText(/improbability drive/i),
    ).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    expect(retryBtn).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(retryBtn);
    expect(reset).toHaveBeenCalled();
  });
});
