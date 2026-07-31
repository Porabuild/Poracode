// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { getComposerControls } from "../providerComposer";
import "./index";

const capabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "auto", label: "Auto Approve" },
    { id: "yolo", label: "Bypass Approvals" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
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

describe("Kimi composer controls", () => {
  it("exposes Default, Auto, and YOLO permission modes", () => {
    const onConfigChange = vi.fn<(patch: Partial<ThreadConfig>) => void>();
    const controls = getComposerControls("kimi")?.({
      capabilities,
      config: { model: "", mode: "agent", approvalPolicy: "default" },
      isDisabled: false,
      onConfigChange,
      presentationMode: "gui",
    });

    const permission = controls?.find(isPermissionMenuControl);
    expect(permission).toMatchObject({
      value: "default",
      options: capabilities.approvalPolicies,
    });

    permission?.onChange?.("auto");
    expect(onConfigChange).toHaveBeenCalledWith({ approvalPolicy: "auto" });
  });
});
