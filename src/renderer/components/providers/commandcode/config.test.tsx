// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { defaultCommandCodeCapabilities } from "@/supervisor/agents/commandcode/detection";
import { resolveModelValue, resolveProviderDraftConfig } from "../../thread/threadDraftViewHelpers";
import { getComposerControls, getConfigNormalizer } from "../providerComposer";
import "./index";

const terminal = defaultCommandCodeCapabilities;
const gui = {
  ...terminal,
  presentationMode: "gui" as const,
  approvalPolicies: [
    { id: "default", label: "Standard" },
    { id: "auto-accept", label: "Accept Edits" },
    { id: "dont-ask", label: "Don't Ask" },
    { id: "bypass", label: "Bypass Permissions" },
  ],
  defaultApprovalPolicy: "bypass",
};

describe("Command Code permission intent across presentations", () => {
  it("keeps model and effort intent when catalog casing changes in either direction", () => {
    const nativeId = "moonshotai/Kimi-K3";
    const cliId = nativeId.toLowerCase();
    const status = (presentation: "gui" | "terminal"): AgentStatus => ({
      kind: "commandcode",
      label: "Command Code",
      installed: true,
      authState: "authenticated",
      capabilities: {
        ...(presentation === "gui" ? gui : terminal),
        models: [
          { id: "default-model", label: "Default" },
          { id: presentation === "gui" ? nativeId : cliId, label: "Kimi K3" },
        ],
        modelEfforts: { [presentation === "gui" ? nativeId : cliId]: ["low", "max"] },
      },
    });
    const chat = resolveProviderDraftConfig(status("gui"), { model: cliId, effort: "low" });
    expect(chat).toMatchObject({ model: nativeId, effort: "low" });
    expect(resolveModelValue(status("gui"), cliId)).toBe(nativeId);
    expect(resolveModelValue(status("terminal"), nativeId)).toBe(cliId);
    expect(resolveProviderDraftConfig(status("terminal"), chat)).toMatchObject({
      model: cliId,
      effort: "low",
    });
  });

  it.each([
    ["auto_edit", "auto-accept"],
    ["yolo", "bypass"],
    ["never", "bypass"],
    ["dont-ask", "dont-ask"],
  ])("preserves saved %s intent in Chat as %s", (approvalPolicy, expected) => {
    const status: AgentStatus = {
      kind: "commandcode",
      label: "Command Code",
      installed: true,
      authState: "authenticated",
      capabilities: gui,
    };
    expect(resolveProviderDraftConfig(status, { approvalPolicy }).approvalPolicy).toBe(expected);
  });

  it("round trips edit permission IDs without choosing bypass", () => {
    const normalize = getConfigNormalizer("commandcode")!;
    expect(
      normalize({
        capabilities: gui,
        config: { model: "", approvalPolicy: "auto_edit" },
        presentationMode: "gui",
      }),
    ).toEqual({ approvalPolicy: "auto-accept" });
    expect(
      normalize({
        capabilities: terminal,
        config: { model: "", approvalPolicy: "auto-accept" },
        presentationMode: "terminal",
      }),
    ).toEqual({ approvalPolicy: "auto_edit" });
  });

  it("displays the permission actually sent for a legacy active thread", () => {
    const controls = getComposerControls("commandcode")!({
      capabilities: gui,
      config: { model: "", approvalPolicy: "auto_edit" },
      presentationMode: "gui",
      isDisabled: false,
      onConfigChange: vi.fn<() => void>(),
    });
    expect(controls.some((control) => "value" in control && control.value === "auto-accept")).toBe(
      true,
    );
  });
});
