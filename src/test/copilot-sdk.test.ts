import { describe, it, expect, vi } from "vitest";

// Test that the Copilot SDK can be imported and basic types exist
describe("Copilot SDK validation", () => {
  it("can import CopilotClient from the SDK", async () => {
    const sdk = await import("@github/copilot-sdk");
    expect(sdk.CopilotClient).toBeDefined();
    expect(typeof sdk.CopilotClient).toBe("function");
  });

  it("can import approveAll permission handler", async () => {
    const sdk = await import("@github/copilot-sdk");
    expect(sdk.approveAll).toBeDefined();
  });

  it("can instantiate CopilotClient without starting", async () => {
    const { CopilotClient } = await import("@github/copilot-sdk");
    // CopilotClient should be constructable - we don't start it (that spawns the CLI)
    const client = new CopilotClient({ autoStart: false });
    expect(client).toBeDefined();
    expect(typeof client.start).toBe("function");
    expect(typeof client.stop).toBe("function");
    expect(typeof client.createSession).toBe("function");
  });
});
