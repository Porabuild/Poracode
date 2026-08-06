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
    { id: "auto", label: "Auto" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "auto",
  settingDefs: [],
};

function isMenuControl(
  control: ComposerControl,
): control is Extract<ComposerControl, { kind?: "menu" }> {
  return control.kind === undefined || control.kind === "menu";
}

function isModeControl(control: ComposerControl): boolean {
  return "iconKind" in control && control.iconKind === "mode";
}

describe("Qwen composer controls", () => {
  it("shows Task mode with Auto permissions by default", () => {
    const onConfigChange = vi.fn<(patch: Partial<ThreadConfig>) => void>();
    const controls = getComposerControls("qwen")?.({
      capabilities,
      config: { model: "qwen3.8-max", mode: "agent", approvalPolicy: "auto" },
      isDisabled: false,
      onConfigChange,
      presentationMode: "gui",
    });

    expect(controls?.find(isModeControl)).toMatchObject({
      label: "Task",
      isSelected: false,
    });
    expect(
      controls?.find((control) => isMenuControl(control) && control.iconKind === "permission"),
    ).toMatchObject({ value: "auto" });
  });

  it("keeps Plan as the alternate mode", () => {
    const controls = getComposerControls("qwen")?.({
      capabilities,
      config: { model: "qwen3.8-max", mode: "plan", approvalPolicy: "auto" },
      isDisabled: false,
      onConfigChange: vi.fn<(patch: Partial<ThreadConfig>) => void>(),
      presentationMode: "gui",
    });

    expect(controls?.find(isModeControl)).toMatchObject({
      label: "Plan",
      isSelected: true,
    });
  });
});
