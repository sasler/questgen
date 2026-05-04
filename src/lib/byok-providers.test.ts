import { describe, expect, it } from "vitest";
import {
  BYOK_PROVIDER_CATALOG,
  findByokProvider,
  resolveByokProviderDefaults,
} from "./byok-providers";

describe("BYOK provider catalog", () => {
  it("includes the free-first provider presets with key links and base URLs", () => {
    const ids = BYOK_PROVIDER_CATALOG.map((provider) => provider.id);

    expect(ids).toEqual([
      "openrouter",
      "gemini",
      "groq",
      "cerebras",
      "mistral",
      "custom-openai",
    ]);
    expect(findByokProvider("openrouter")).toEqual(
      expect.objectContaining({
        type: "openai",
        baseUrl: "https://openrouter.ai/api/v1",
        keyUrl: "https://openrouter.ai/keys",
      }),
    );
    expect(findByokProvider("gemini")).toEqual(
      expect.objectContaining({
        type: "openai",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
        keyUrl: "https://aistudio.google.com/apikey",
      }),
    );
  });

  it("resolves missing BYOK fields from the selected preset", () => {
    expect(
      resolveByokProviderDefaults({
        byokProviderId: "groq",
        byokBaseUrl: "",
      }),
    ).toEqual(
      expect.objectContaining({
        byokProviderId: "groq",
        byokType: "openai",
        byokBaseUrl: "https://api.groq.com/openai/v1",
      }),
    );
  });
});
