import { describe, expect, it } from "vitest";
import { agentCapabilitySchema } from "./agent";

const previous = {
  models: [],
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
};

describe("context reload capability compatibility", () => {
  it("accepts previous payloads without requiring reload confirmation", () => {
    const parsed = agentCapabilitySchema.parse(previous);
    expect(parsed.contextSizeChangeReloadsSession).toBeUndefined();
    expect(parsed.contextSizeReloadStopsSubagents).toBeUndefined();
  });

  it("retains optional facts at the root and on presentation overrides", () => {
    const facts = {
      contextSizeChangeReloadsSession: true,
      contextSizeReloadStopsSubagents: true,
    };
    const parsed = agentCapabilitySchema.parse({
      ...previous,
      ...facts,
      presentationCapabilities: { gui: { ...previous, ...facts } },
    });
    expect(parsed).toMatchObject(facts);
    expect(parsed.presentationCapabilities?.gui).toMatchObject(facts);
  });
});
