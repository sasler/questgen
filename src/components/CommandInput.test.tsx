import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandInput } from "./CommandInput";

describe("CommandInput", () => {
  it("renders with prompt prefix >", () => {
    render(<CommandInput onSubmit={vi.fn()} />);
    expect(screen.getByText(">")).toBeInTheDocument();
  });

  it("calls onSubmit with input text on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "look around{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("look around");
  });

  it("clears input after submit", async () => {
    const user = userEvent.setup();
    render(<CommandInput onSubmit={vi.fn()} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "open door{Enter}");

    expect(input).toHaveValue("");
  });

  it("does NOT submit empty input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does NOT submit whitespace-only input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "   {Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disabled state prevents input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommandInput onSubmit={onSubmit} disabled />);

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();

    await user.type(input, "go north{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows processing text when disabled", () => {
    render(<CommandInput onSubmit={vi.fn()} disabled />);
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
  });

  it("up arrow recalls previous command from history", async () => {
    const user = userEvent.setup();
    const history = ["look", "go north", "take sword"];
    render(<CommandInput onSubmit={vi.fn()} commandHistory={history} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("{ArrowUp}");

    expect(input).toHaveValue("take sword");
  });

  it("multiple up arrows cycle through history", async () => {
    const user = userEvent.setup();
    const history = ["look", "go north", "take sword"];
    render(<CommandInput onSubmit={vi.fn()} commandHistory={history} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("{ArrowUp}{ArrowUp}");

    expect(input).toHaveValue("go north");
  });

  it("up arrow stops at oldest command", async () => {
    const user = userEvent.setup();
    const history = ["look", "go north"];
    render(<CommandInput onSubmit={vi.fn()} commandHistory={history} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}");

    expect(input).toHaveValue("look");
  });

  it("down arrow moves forward in history", async () => {
    const user = userEvent.setup();
    const history = ["look", "go north", "take sword"];
    render(<CommandInput onSubmit={vi.fn()} commandHistory={history} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowDown}");

    expect(input).toHaveValue("go north");
  });

  it("down arrow past newest clears input", async () => {
    const user = userEvent.setup();
    const history = ["look"];
    render(<CommandInput onSubmit={vi.fn()} commandHistory={history} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("{ArrowUp}{ArrowDown}");

    expect(input).toHaveValue("");
  });

  it("typing resets history index", async () => {
    const user = userEvent.setup();
    const history = ["look", "go north"];
    render(<CommandInput onSubmit={vi.fn()} commandHistory={history} />);

    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(input).toHaveValue("look");

    await user.clear(input);
    await user.type(input, "x");
    await user.keyboard("{ArrowUp}");

    expect(input).toHaveValue("go north");
  });

  it("shows placeholder text", () => {
    render(<CommandInput onSubmit={vi.fn()} placeholder="Enter command..." />);
    expect(screen.getByPlaceholderText("Enter command...")).toBeInTheDocument();
  });

  it("shows default placeholder when none provided", () => {
    render(<CommandInput onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText("What do you do?")).toBeInTheDocument();
  });

  it("auto-focuses on mount", () => {
    render(<CommandInput onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveFocus();
  });

  it("re-focuses when re-enabled after being disabled", () => {
    const { rerender } = render(<CommandInput onSubmit={vi.fn()} disabled />);
    const input = screen.getByRole("textbox");
    expect(input).not.toHaveFocus();

    rerender(<CommandInput onSubmit={vi.fn()} disabled={false} />);
    expect(input).toHaveFocus();
  });
});
