// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentCapability } from "@/shared/contracts";
import { getComposerControls } from "../providerComposer";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import "./index";

const capabilities = {
  models: [
    { id: "claude-opus-5", label: "Opus 5" },
    { id: "claude-fable-5", label: "Fable 5" },
    { id: "haiku", label: "Haiku" },
  ],
  efforts: ["low", "medium", "high", "xHigh", "max", "ultracode"],
  defaultEffort: "high",
  modelEfforts: {
    "claude-opus-5": ["low", "medium", "high", "xHigh", "max", "ultracode"],
    "claude-fable-5": ["low", "medium", "high", "xHigh", "max", "ultracode"],
    haiku: [],
  },
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "auto", label: "Auto mode" },
    { id: "bypassPermissions", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
} as AgentCapability;

function isPermissionControl(
  control: ComposerControl,
): control is ComposerControl & { iconKind: "permission" } {
  return "iconKind" in control && control.iconKind === "permission";
}

describe("Claude composer controls", () => {
  it("allows auto permissions for Opus 5", () => {
    const controls = getComposerControls("claude")?.({
      capabilities,
      config: { model: "claude-opus-5" },
      isDisabled: false,
      onConfigChange: () => undefined,
    });

    const permission = controls?.find(isPermissionControl);
    expect(permission && "options" in permission ? permission.options : []).toContainEqual({
      id: "auto",
      label: "Auto mode",
    });
  });

  it("allows auto permissions for Fable 5", () => {
    const controls = getComposerControls("claude")?.({
      capabilities,
      config: { model: "claude-fable-5" },
      isDisabled: false,
      onConfigChange: () => undefined,
    });

    const permission = controls?.find(isPermissionControl);
    expect(permission && "options" in permission ? permission.options : []).toContainEqual({
      id: "auto",
      label: "Auto mode",
    });
  });

  it("filters auto permissions for Haiku", () => {
    const controls = getComposerControls("claude")?.({
      capabilities,
      config: { model: "haiku", approvalPolicy: "auto" },
      isDisabled: false,
      onConfigChange: () => undefined,
    });

    const permission = controls?.find(isPermissionControl);
    expect(permission && "options" in permission ? permission.options : []).not.toContainEqual({
      id: "auto",
      label: "Auto mode",
    });
    expect(permission && "value" in permission ? permission.value : undefined).toBe(
      "bypassPermissions",
    );
  });

  it("uses the Claude composer controls for profile-backed Claude providers", () => {
    const controls = getComposerControls("claude:work")?.({
      capabilities,
      config: { model: "claude-fable-5" },
      isDisabled: false,
      onConfigChange: () => undefined,
    });

    expect(controls?.some(isPermissionControl)).toBe(true);
  });
});
