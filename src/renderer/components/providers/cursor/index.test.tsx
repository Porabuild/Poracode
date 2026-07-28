// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { AgentCapability, ThreadConfig } from "@/shared/contracts";
import { getComposerControls } from "../providerComposer";
import "./index";

const sdkCapabilities: AgentCapability = {
  runtimeLabel: "SDK",
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Auto-review" },
    { id: "never", label: "Allow All Tools" },
  ],
  sandboxModes: [
    { id: "workspace-write", label: "Workspace Sandbox" },
    { id: "danger-full-access", label: "No Sandbox" },
  ],
  defaultApprovalPolicy: "default",
  defaultSandboxMode: "workspace-write",
  bypassPermissions: {
    approvalPolicy: "never",
    sandboxMode: "danger-full-access",
  },
  supportsResume: true,
  supportsDirectInput: false,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
};

function permissionToggle(
  config: ThreadConfig,
  onConfigChange: (patch: Partial<ThreadConfig>) => void,
) {
  const controls = getComposerControls("cursor")?.({
    capabilities: sdkCapabilities,
    config,
    isDisabled: false,
    onConfigChange,
    presentationMode: "gui",
  });
  const permission = controls?.find(
    (control) => "iconKind" in control && control.iconKind === "permission",
  );
  if (!permission || permission.kind !== "toggle") {
    throw new Error("Cursor permission toggle was not registered.");
  }
  return permission;
}

describe("Cursor composer controls", () => {
  it("shows the active structured runtime beside the model controls", () => {
    const controls = getComposerControls("cursor")?.({
      capabilities: sdkCapabilities,
      config: { model: "auto" },
      isDisabled: false,
      onConfigChange: () => undefined,
      presentationMode: "gui",
    });

    expect(controls?.[0]).toMatchObject({ kind: "static", value: "SDK" });
  });

  it("enables and displays full access only when both SDK safety controls bypass", () => {
    const onConfigChange = vi.fn<(patch: Partial<ThreadConfig>) => void>();
    const supervised = permissionToggle(
      {
        model: "auto",
        approvalPolicy: "never",
        sandboxMode: "workspace-write",
      },
      onConfigChange,
    );

    expect(supervised.isSelected).toBe(false);
    supervised.onChange?.(true);
    expect(onConfigChange).toHaveBeenCalledWith({
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    });

    const unrestricted = permissionToggle(
      {
        model: "auto",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
      onConfigChange,
    );
    expect(unrestricted.isSelected).toBe(true);
  });

  it("restores the SDK's safe defaults when full access is disabled", () => {
    const onConfigChange = vi.fn<(patch: Partial<ThreadConfig>) => void>();
    const permission = permissionToggle(
      {
        model: "auto",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
      onConfigChange,
    );

    permission.onChange?.(false);
    expect(onConfigChange).toHaveBeenCalledWith({
      approvalPolicy: "default",
      sandboxMode: "workspace-write",
    });
  });
});
