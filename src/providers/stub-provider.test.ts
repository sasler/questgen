import { describe, expect, it } from "vitest";
import { StubProvider } from "./stub-provider";
import { GAMEPLAY_SYSTEM_PROMPT } from "@/prompts";

describe("StubProvider", () => {
  it("normalizes abbreviated move directions to full Direction values", async () => {
    const provider = new StubProvider();
    const result = await provider.generateCompletion(
      ["## Player Input", "n"].join("\n"),
      {
        model: "stub",
        systemMessage: GAMEPLAY_SYSTEM_PROMPT,
      },
      {
        mode: "copilot",
      },
    );

    expect(JSON.parse(result.content)).toEqual({
      narrative: "You move north.",
      proposedActions: [{ type: "move", direction: "north" }],
    });
  });
});
