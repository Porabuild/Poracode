// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import { resolveProviderDraftConfig } from "@/renderer/components/thread/threadDraftViewHelpers";
import type { AgentCapability, AgentStatus, ThreadConfig } from "@/shared/contracts";
import { getComposerControls } from "../providerComposer";
import "./index";

const capabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "acceptEdits", label: "Accept Edits" },
    { id: "bypassPermissions", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "bypassPermissions",
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

describe("Qoder composer controls", () => {
  it("resolves a fresh draft to Bypass Permissions", () => {
    const agent = {
      kind: "qoder",
      label: "Qoder",
      installed: true,
      capabilities,
    } as AgentStatus;

    expect(resolveProviderDraftConfig(agent).approvalPolicy).toBe("bypassPermissions");
  });

  it("shows Work mode with Bypass Permissions by default", () => {
    const onConfigChange = vi.fn<(patch: Partial<ThreadConfig>) => void>();
    const controls = getComposerControls("qoder")?.({
      capabilities,
      config: { model: "auto", mode: "agent", approvalPolicy: "bypassPermissions" },
      isDisabled: false,
      onConfigChange,
      presentationMode: "gui",
    });

    expect(controls?.find(isModeControl)).toMatchObject({
      label: "Work",
      isSelected: false,
    });
    expect(
      controls?.find((control) => isMenuControl(control) && control.iconKind === "permission"),
    ).toMatchObject({ value: "bypassPermissions" });
  });

  it("keeps Plan as the alternate mode", () => {
    const controls = getComposerControls("qoder")?.({
      capabilities,
      config: { model: "auto", mode: "plan", approvalPolicy: "default" },
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
