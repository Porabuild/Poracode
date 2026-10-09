import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  agentCapabilitySchema,
  agentRuntimeVariantSchema,
  agentStatusSchema,
} from "../contracts/agent";
import { remoteAgentStatusesSchema } from "./protocol/resources";

// The previous decoder shape had no family field. Its unknown-field behavior
// must still leave exact raw IDs available to clients that cannot render axes.
const previousOverride = agentCapabilitySchema.shape.presentationCapabilities
  .unwrap()
  .shape.gui.unwrap()
  .omit({ modelFamilies: true });
const previousCapabilities = agentCapabilitySchema.omit({ modelFamilies: true }).extend({
  presentationCapabilities: z
    .object({
      terminal: previousOverride.optional(),
      gui: previousOverride.optional(),
    })
    .optional(),
});
const previousStatus = agentStatusSchema.extend({
  capabilities: previousCapabilities,
  runtimeVariants: z
    .record(
      z.string(),
      agentRuntimeVariantSchema.extend({
        capabilities: previousCapabilities,
      }),
    )
    .optional(),
});
const previousResponse = remoteAgentStatusesSchema.extend({
  windows: z.array(previousStatus),
  wsl: z.array(previousStatus),
});
const models = [
  { id: "pair-one", label: "Pair One" },
  { id: "pair-two", label: "Pair Two" },
];
const family = {
  model: "pair-one",
  label: "Pair",
  bindings: { effort: "config", fast: "config" },
  selectors: [
    {
      id: "partner",
      labelKey: "modelSelection.sidekick",
      options: [
        { id: "one", label: "One" },
        { id: "two", label: "Two" },
      ],
    },
  ],
  members: [
    { model: "pair-one", selections: { partner: "one" } },
    { model: "pair-two", selections: { partner: "two" } },
  ],
};
const response = {
  windows: [
    {
      kind: "toy",
      label: "Toy",
      installed: true,
      authState: "authenticated",
      capabilities: {
        models,
        modelFamilies: [family],
        presentationCapabilities: {
          gui: { models, modelFamilies: [family] },
        },
      },
      runtimeVariants: {
        structured: {
          presentationMode: "gui",
          installed: true,
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: { models, modelFamilies: [family] },
        },
      },
    },
  ],
  wsl: [],
  updatedAt: "2026-10-08T12:00:00.000Z",
};

describe("optional family metadata compatibility", () => {
  it("preserves the descriptor through remote serialization on both capability surfaces", () => {
    const decoded = remoteAgentStatusesSchema.parse(JSON.parse(JSON.stringify(response)));
    expect(decoded.windows[0]!.capabilities.modelFamilies).toEqual([family]);
    expect(decoded.windows[0]!.runtimeVariants?.structured?.capabilities.modelFamilies).toEqual([
      family,
    ]);
    expect(decoded.windows[0]!.capabilities.presentationCapabilities?.gui?.modelFamilies).toEqual([
      family,
    ]);
  });
  it("lets previous clients decode fresh hosts with the complete raw selection inventory", () => {
    const decoded = previousResponse.parse(JSON.parse(JSON.stringify(response)));
    expect(decoded.windows[0]!.capabilities.models).toEqual(models);
    expect(decoded.windows[0]!.capabilities).not.toHaveProperty("modelFamilies");
    expect(decoded.windows[0]!.runtimeVariants?.structured?.capabilities.models).toEqual(models);
    expect(decoded.windows[0]!.runtimeVariants?.structured?.capabilities).not.toHaveProperty(
      "modelFamilies",
    );
    expect(decoded.windows[0]!.capabilities.presentationCapabilities?.gui?.models).toEqual(models);
    expect(decoded.windows[0]!.capabilities.presentationCapabilities?.gui).not.toHaveProperty(
      "modelFamilies",
    );
  });
  it("lets fresh clients read previous hosts without requiring or synthesizing metadata", () => {
    const previous = previousResponse.parse(response);
    const decoded = remoteAgentStatusesSchema.parse(previous);
    expect(decoded.windows[0]!.capabilities.models).toEqual(models);
    expect(decoded.windows[0]!.capabilities.modelFamilies).toBeUndefined();
    expect(
      decoded.windows[0]!.runtimeVariants?.structured?.capabilities.modelFamilies,
    ).toBeUndefined();
    expect(
      decoded.windows[0]!.capabilities.presentationCapabilities?.gui?.modelFamilies,
    ).toBeUndefined();
  });
});
