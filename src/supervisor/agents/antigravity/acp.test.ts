import { describe, expect, it } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { agentStatusForPresentation } from "@/shared/agentSelection";
import { defaultAntigravityCapabilities } from "./detection";
import { applyAntigravityAcpStatus } from "./acp";

function cliStatus(installed: boolean): AgentStatus {
  return {
    kind: "antigravity",
    label: "Antigravity",
    installed,
    ...(installed ? { version: "1.2.0", executablePath: "/bin/agy" } : {}),
    authState: installed ? "authenticated" : "missing",
    loginCommand: "agy",
    preferTerminalLogin: true,
    authMethods: [{ type: "terminal", id: "agy-login", name: "Antigravity login", args: [] }],
    providerMetadata: { authenticatedAs: "terminal@example.com" },
    capabilities: defaultAntigravityCapabilities,
  };
}

function acpStatus(installed: boolean): AgentStatus {
  return {
    kind: "antigravity",
    label: "Antigravity",
    installed,
    ...(installed ? { version: "1.0.0", executablePath: "/bin/agy_acp_server.par" } : {}),
    authState: installed ? "authenticated" : "missing",
    authMethods: [{ type: "agent", id: "google-login", name: "Google login" }],
    providerMetadata: { authenticatedAs: "chat@example.com" },
    capabilities: {
      ...defaultAntigravityCapabilities,
      models: [{ id: "gemini-pro", label: "Gemini Pro" }],
      modes: ["agent"],
      approvalPolicies: [],
      presentationMode: "gui",
      presentationModes: ["gui"],
      liveInputMode: "server",
      supportsResume: true,
    },
  };
}

describe("Antigravity runtime detection", () => {
  it("reports a CLI-only install as Terminal-only", () => {
    const status = applyAntigravityAcpStatus(cliStatus(true), acpStatus(false));

    expect(status.installed).toBe(true);
    expect(status.capabilities.presentationModes).toEqual(["terminal"]);
    expect(status.runtimeVariants).toMatchObject({
      cli: { installed: true, version: "1.2.0" },
      acp: { installed: false },
    });
  });

  it("reports an ACP-only install as Chat-only without claiming the agy CLI", () => {
    const status = applyAntigravityAcpStatus(cliStatus(false), acpStatus(true));

    expect(status.installed).toBe(true);
    expect(status.executablePath).toBe("/bin/agy_acp_server.par");
    expect(status.capabilities.presentationModes).toEqual(["gui"]);
    expect(status.runtimeVariants).toMatchObject({
      cli: { installed: false },
      acp: { installed: true, version: "1.0.0" },
    });
  });

  it("keeps the root authState on the signed-in CLI when the chat artifact is unsigned", () => {
    const unsignedChat = { ...acpStatus(true), authState: "missing" as const };
    const status = applyAntigravityAcpStatus(cliStatus(true), unsignedChat);

    // Supervisor gates (crossagent roster, account resolver) read the root
    // field; the signed-in CLI must not be demoted by the chat artifact.
    expect(status.authState).toBe("authenticated");
    expect(status.presentationAuthStates).toEqual({
      terminal: "authenticated",
      gui: "missing",
    });
  });

  it("exposes both surfaces only when both independent runtimes are detected", () => {
    const status = applyAntigravityAcpStatus(cliStatus(true), acpStatus(true));

    expect(status.capabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(status.presentationAuthStates).toEqual({
      terminal: "authenticated",
      gui: "authenticated",
    });
    expect(status.capabilities.presentationCapabilities?.gui).toMatchObject({
      models: [{ id: "gemini-pro" }],
      supportsResume: true,
      approvalPolicies: [],
    });
    expect(status.capabilities.presentationCapabilities?.gui).toMatchObject({
      runtimeLabel: "ACP",
      showRuntimeLabelInPicker: false,
    });
    expect(status.runtimeVariants?.acp?.capabilities).toMatchObject({
      runtimeLabel: "ACP",
      showRuntimeLabelInPicker: false,
    });
    expect(status.loginCommand).toBeUndefined();
    expect(status.authMethods).toEqual([
      { type: "agent", id: "google-login", name: "Google login" },
    ]);
    expect(status.providerMetadata?.authenticatedAs).toBe("chat@example.com");

    expect(agentStatusForPresentation(status, "terminal")).toMatchObject({
      loginCommand: "agy",
      preferTerminalLogin: true,
      authMethods: [{ type: "terminal", id: "agy-login" }],
      providerMetadata: { authenticatedAs: "terminal@example.com" },
    });
    expect(agentStatusForPresentation(status, "gui")).toMatchObject({
      authMethods: [{ type: "agent", id: "google-login" }],
      providerMetadata: { authenticatedAs: "chat@example.com" },
    });
    expect(agentStatusForPresentation(status, "gui").loginCommand).toBeUndefined();
  });

  it("defaults Chat to the strongest mode the server advertises, not the CLI's yolo id", () => {
    const chat = acpStatus(true);
    const status = applyAntigravityAcpStatus(cliStatus(true), {
      ...chat,
      capabilities: {
        ...chat.capabilities,
        // Google's ACP modes as `mapAcpModes` normalizes them: YOLO arrives as
        // `never`, while the CLI names the same posture `yolo`.
        approvalPolicies: [
          { id: "default", label: "Default" },
          { id: "auto_edit", label: "Auto Edit" },
          { id: "never", label: "YOLO" },
        ],
      },
    });

    // The CLI's `yolo` must not survive onto a surface that never advertised
    // it — the composer would render the raw id and drafts would open with no
    // valid permission selected.
    for (const guiCapabilities of [
      status.capabilities.presentationCapabilities?.gui,
      status.runtimeVariants?.acp?.capabilities,
      agentStatusForPresentation(status, "gui").capabilities,
    ]) {
      expect(guiCapabilities?.defaultApprovalPolicy).toBe("never");
      expect(guiCapabilities?.bypassPermissions).toEqual({ approvalPolicy: "never" });
    }

    // The terminal surface keeps the CLI's own vocabulary.
    expect(agentStatusForPresentation(status, "terminal").capabilities).toMatchObject({
      defaultApprovalPolicy: "yolo",
      bypassPermissions: { approvalPolicy: "yolo" },
    });
  });

  it("inherits the root permission defaults while Chat advertises no modes of its own", () => {
    const status = applyAntigravityAcpStatus(cliStatus(true), acpStatus(true));

    expect(status.capabilities.presentationCapabilities?.gui?.approvalPolicies).toEqual([]);
    expect(agentStatusForPresentation(status, "gui").capabilities).toMatchObject({
      defaultApprovalPolicy: "yolo",
    });
  });
});
