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
});
