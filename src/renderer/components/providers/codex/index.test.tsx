// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { ComposerControl } from "@/renderer/components/thread/ThreadComposer";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { getComposerControls } from "../providerComposer";
import "./index";

const capabilities: AgentCapability = {
  models: [{ id: "gpt-5.6-terra", label: "GPT-5.6 Terra" }],
  efforts: ["low", "medium", "high"],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "on-request", label: "On Request" },
    { id: "never", label: "Full Access" },
    { id: "untrusted", label: "Untrusted" },
  ],
  sandboxModes: [
    { id: "workspace-write", label: "Workspace Write" },
    { id: "read-only", label: "Read Only" },
    { id: "danger-full-access", label: "Full Access" },
  ],
  supportsResume: true,
  supportsDirectInput: false,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
};

function permissionMenu(
  config: ThreadConfig,
  onConfigChange: (patch: Partial<ThreadConfig>) => void,
  capabilityOverride?: Partial<AgentCapability>,
): Extract<ComposerControl, { kind?: "menu" }> | undefined {
  const controls = getComposerControls("codex")?.({
    capabilities: { ...capabilities, ...capabilityOverride },
    config,
    isDisabled: false,
    onConfigChange,
    presentationMode: "gui",
  });
  return controls?.find(
    (control): control is Extract<ComposerControl, { kind?: "menu" }> =>
      (control.kind === undefined || control.kind === "menu") &&
      "iconKind" in control &&
      control.iconKind === "permission",
  );
}

describe("Codex composer permission presets", () => {
  it("submits the read-only preset as on-request user approval in a read-only sandbox", () => {
    const onConfigChange = vi.fn<(patch: Partial<ThreadConfig>) => void>();
    const permission = permissionMenu(
      { model: "gpt-5.6-terra", sandboxMode: "read-only", approvalPolicy: "on-request" },
      onConfigChange,
    );

    expect(permission?.value).toBe("read-only");
    expect(
      permission?.options.map((option) => (typeof option === "string" ? option : option.id)),
    ).toContain("read-only");
    permission?.onChange?.("read-only");
    expect(onConfigChange).toHaveBeenCalledWith({
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandboxMode: "read-only",
    });
  });

  it("hides the read-only preset when the capability probe does not offer it", () => {
    const permission = permissionMenu({ model: "gpt-5.6-terra" }, () => undefined, {
      sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
    });

    expect(
      permission?.options.map((option) => (typeof option === "string" ? option : option.id)),
    ).not.toContain("read-only");
  });
});
