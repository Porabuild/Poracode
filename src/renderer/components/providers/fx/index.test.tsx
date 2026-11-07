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
  modes: ["agent"],
  approvalPolicies: [
    { id: "auto", label: "Auto" },
    { id: "ask", label: "Ask" },
    { id: "bypassPermissions", label: "Full Access" },
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

describe("fx composer controls", () => {
  it("resolves a fresh draft to Auto", () => {
    const agent = {
      kind: "fx",
      label: "fx",
      installed: true,
      capabilities,
    } as AgentStatus;

    expect(resolveProviderDraftConfig(agent).approvalPolicy).toBe("auto");
  });

  it("shows no plan/mode toggle and offers the three approval policies", () => {
    const onConfigChange = vi.fn<(patch: Partial<ThreadConfig>) => void>();
    const controls = getComposerControls("fx")?.({
      capabilities,
      config: { model: "spacexai/grok-4.7", mode: "agent", approvalPolicy: "auto" },
      isDisabled: false,
      onConfigChange,
      presentationMode: "gui",
    });

    expect(controls?.find(isModeControl)).toBeUndefined();
    expect(
      controls?.find((control) => isMenuControl(control) && control.iconKind === "permission"),
    ).toMatchObject({
      value: "auto",
      options: [
        { id: "auto", label: "Auto" },
        { id: "ask", label: "Ask" },
        { id: "bypassPermissions", label: "Full Access" },
      ],
    });
  });
});
