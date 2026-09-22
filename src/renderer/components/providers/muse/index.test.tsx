// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { getComposerControls } from "../providerComposer";
import { resolveThreadTitlePrompt } from "../threadTitlePrompt";
import "./index";

const capabilities: AgentCapability = {
  models: [
    { id: "muse-spark-1.2", label: "Muse Spark 1.2" },
    { id: "muse-spark-1.1", label: "Muse Spark 1.1" },
  ],
  efforts: ["none", "minimal", "low", "medium", "high", "xhigh", "ultra"],
  defaultEffort: "high",
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [
    { id: "untrusted", label: "Untrusted" },
    { id: "on-request", label: "On Request" },
    { id: "never", label: "Never Ask" },
    { id: "yolo", label: "Bypass Approvals" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal"],
  settingDefs: [],
};

function isMenuControl(
  control: ComposerControl,
): control is Extract<ComposerControl, { kind?: "menu" }> {
  return control.kind === undefined || control.kind === "menu";
}

function isPermissionMenuControl(
  control: ComposerControl,
): control is Extract<ComposerControl, { kind?: "menu" }> {
  return isMenuControl(control) && control.iconKind === "permission";
}

describe("Muse composer controls", () => {
  it("exposes Muse approval policies on terminal without a plan/work toggle", () => {
    const onConfigChange = vi.fn<(patch: Partial<ThreadConfig>) => void>();
    const controls = getComposerControls("muse")?.({
      capabilities,
      config: { model: "muse-spark-1.2", mode: "agent", approvalPolicy: "on-request" },
      isDisabled: false,
      onConfigChange,
      presentationMode: "terminal",
    });

    expect(controls?.some((c) => "iconKind" in c && c.iconKind === "mode")).toBe(false);

    const permission = controls?.find(isPermissionMenuControl);
    expect(permission).toMatchObject({
      value: "on-request",
      options: capabilities.approvalPolicies,
    });

    permission?.onChange?.("yolo");
    expect(onConfigChange).toHaveBeenCalledWith({ approvalPolicy: "yolo" });
  });
});

describe("Muse thread title prompt", () => {
  it("titles a /goal-started thread from its objective", () => {
    expect(resolveThreadTitlePrompt("muse", "/goal Reply with a haiku")).toBe("Reply with a haiku");
    expect(resolveThreadTitlePrompt("muse", "/goal edit Ship the fix")).toBe("Ship the fix");
  });

  it("keeps the typed prompt for goal verbs and ordinary messages", () => {
    expect(resolveThreadTitlePrompt("muse", "/goal pause")).toBe("/goal pause");
    expect(resolveThreadTitlePrompt("muse", "/goal")).toBe("/goal");
    expect(resolveThreadTitlePrompt("muse", "Explain the build")).toBe("Explain the build");
  });
});
