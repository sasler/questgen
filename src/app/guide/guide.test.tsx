import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import GuidePage from "./page";

describe("Guide Page", () => {
  it("renders the page title", () => {
    render(<GuidePage />);
    expect(
      screen.getByText(/hitchhiker.*guide.*github copilot/i)
    ).toBeInTheDocument();
  });

  it("contains signup link to GitHub Copilot settings", () => {
    render(<GuidePage />);
    const link = screen.getByRole("link", {
      name: /github\.com\/settings\/copilot/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/settings/copilot"
    );
  });

  it("contains BYOK alternative section", () => {
    render(<GuidePage />);
    expect(screen.getByText(/BYOK — BRING YOUR OWN KEY/)).toBeInTheDocument();
    expect(
      screen.getByText(/use your own API key instead/i)
    ).toBeInTheDocument();
  });

  it("has link back to dashboard", () => {
    render(<GuidePage />);
    const backLink = screen.getByRole("link", { name: /back|dashboard/i });
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("contains step-by-step instructions", () => {
    render(<GuidePage />);
    expect(screen.getByText(/step 1/i)).toBeInTheDocument();
    expect(screen.getByText(/step 2/i)).toBeInTheDocument();
    expect(screen.getByText(/step 3/i)).toBeInTheDocument();
    expect(screen.getByText(/step 4/i)).toBeInTheDocument();
  });
});
