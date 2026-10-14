// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import type { ComposerSelectionOrigin } from "@/renderer/components/thread/composerSelectionMutation";
import {
  getComposerControls,
  getConfigNormalizer,
  registerComposerControls,
  registerConfigNormalizer,
} from "./providerComposer";

const capabilities = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
} as AgentCapability;

const input = {
  capabilities,
  config: { model: "test" },
  isDisabled: false,
  onConfigChange: () => undefined,
};

describe("provider composer registry", () => {
  it("composes shared controls before the active presentation surface", () => {
    registerComposerControls("test-composed", {
      shared: () => [{ kind: "static", value: "shared" }],
      gui: () => [{ kind: "static", value: "gui" }],
      terminal: () => [{ kind: "static", value: "terminal" }],
    });

    expect(getComposerControls("test-composed")?.({ ...input, presentationMode: "gui" })).toEqual([
      { kind: "static", value: "shared" },
      { kind: "static", value: "gui" },
    ]);
    expect(
      getComposerControls("test-composed")?.({ ...input, presentationMode: "terminal" }),
    ).toEqual([
      { kind: "static", value: "shared" },
      { kind: "static", value: "terminal" },
    ]);
    expect(getComposerControls("test-composed")?.(input)).toEqual([
      { kind: "static", value: "shared" },
    ]);
  });

  it("falls back to the base provider while allowing an exact override", () => {
    registerComposerControls("test-scoped", () => [{ kind: "static", value: "base" }]);
    expect(getComposerControls("test-scoped:work")?.(input)).toEqual([
      { kind: "static", value: "base" },
    ]);

    registerComposerControls("test-scoped:work", () => [{ kind: "static", value: "exact" }]);
    expect(getComposerControls("test-scoped:work")?.(input)).toEqual([
      { kind: "static", value: "exact" },
    ]);
  });

  it("keeps config normalizers provider-scoped and HMR-idempotent", () => {
    registerConfigNormalizer("test-normalizer", () => ({ mode: "plan" }));
    expect(
      getConfigNormalizer("test-normalizer:work")?.({
        capabilities,
        config: { model: "test" },
        presentationMode: "gui",
      }),
    ).toEqual({ mode: "plan" });

    registerConfigNormalizer("test-normalizer", () => ({ mode: "agent" }));
    expect(
      getConfigNormalizer("test-normalizer")?.({
        capabilities,
        config: { model: "test" },
        presentationMode: "terminal",
      }),
    ).toEqual({ mode: "agent" });
  });

  it("lets a registered factory forward the ephemeral origin with its patch", () => {
    const seen: Array<[Partial<ThreadConfig>, ComposerSelectionOrigin | undefined]> = [];
    registerComposerControls("test-origin-forward", ({ onConfigChange }) => {
      onConfigChange({ mode: "plan" });
      onConfigChange({ model: "pair-beta-x" }, { kind: "family-resolved" });
      return [];
    });
    getComposerControls("test-origin-forward")?.({
      ...input,
      onConfigChange: (patch, origin) => seen.push([patch, origin]),
    });
    expect(seen).toEqual([
      [{ mode: "plan" }, undefined],
      [{ model: "pair-beta-x" }, { kind: "family-resolved" }],
    ]);
  });
});
