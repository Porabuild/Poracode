import { describe, expect, it } from "vitest";
import type { CreateProfilePayload } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";
import { applyCreateProfile } from "./sharedSettingsFile";

function create(payload: CreateProfilePayload) {
  return applyCreateProfile(structuredClone(defaultSharedSettings), payload, "").instance;
}

describe("applyCreateProfile config custody", () => {
  it("stores an OpenCode custom endpoint config unchanged", () => {
    const config = {
      connection: "local",
      endpoint: "http://127.0.0.1:11434/v1",
      model: "openai/gpt-oss:20b",
    };
    const instance = create({
      driver: "opencode",
      id: "work",
      displayName: "Work",
      config,
    });
    expect(instance.config).toEqual(config);
  });

  it("stores a Devin profile config unchanged", () => {
    const config = { format: 2, authKind: "isolated-owner", agentType: "review" };
    const instance = create({
      driver: "devin",
      id: "reviewer",
      displayName: "Reviewer",
      config,
    });
    expect(instance.config).toEqual(config);
  });
});
