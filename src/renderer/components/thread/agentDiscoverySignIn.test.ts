import { describe, expect, it } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import { resolveDiscoverySignIn, type DiscoverySignIn } from "./agentDiscoverySignIn";

function status(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "missing",
    capabilities: {},
    ...overrides,
  } as unknown as AgentStatus;
}

const wslProject = {
  id: "wsl-project",
  name: "Ubuntu",
  location: { kind: "wsl", distro: "Ubuntu", linuxPath: "~", uncPath: "\\\\wsl.localhost\\Ubuntu" },
} as unknown as Project;
/** A paired desktop's projects must never receive this host's credentials. */
const pairedWindowsProject = {
  id: "paired-windows",
  name: "Paired Windows",
  remoteServerId: "desktop-2",
  location: { kind: "windows", path: ".", remoteServerId: "desktop-2" },
} as unknown as Project;
const pairedWslProject = {
  id: "paired-wsl",
  name: "Paired Ubuntu",
  remoteServerId: "desktop-2",
  location: {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "~",
    uncPath: "\\\\wsl.localhost\\Ubuntu",
    remoteServerId: "desktop-2",
  },
} as unknown as Project;

const desktop = { isBrowserClient: false, isWindows: false, projects: [wslProject] };
const browser = { isBrowserClient: true, isWindows: false, projects: [wslProject] };

function terminalProject(result: DiscoverySignIn): Project {
  if (result.kind !== "terminal") throw new Error(`expected terminal, got ${result.kind}`);
  // Terminal login must never be handed undefined: runAgentLoginCommand would
  // otherwise fall back to the focused/active/first project on any host.
  expect(result.project).toBeDefined();
  expect(result.project.remoteServerId).toBeUndefined();
  expect(result.project.location.remoteServerId).toBeUndefined();
  return result.project;
}

describe("resolveDiscoverySignIn — supported direct auth", () => {
  it("offers no action when the row is already signed in or unknown", () => {
    expect(resolveDiscoverySignIn(status({ authState: "authenticated" }), desktop).kind).toBe(
      "notNeeded",
    );
    expect(resolveDiscoverySignIn(status({ authState: "unknown" }), desktop).kind).toBe(
      "notNeeded",
    );
  });

  it("returns a clear fallback for a browser that cannot sign in locally", () => {
    // Even with a fully supported login command, a browser client must not be
    // offered a local sign-in it cannot initiate.
    expect(resolveDiscoverySignIn(status({ loginCommand: "codex login" }), browser).kind).toBe(
      "browserFallback",
    );
    expect(
      resolveDiscoverySignIn(status({ authMethods: [{ id: "oauth", name: "OAuth" }] }), browser)
        .kind,
    ).toBe("browserFallback");
  });

  it("uses the provider's terminal login command with its env and env-matched project", () => {
    const wslStatus = status({
      kind: "claude",
      envKind: "wsl",
      envDistro: "Ubuntu",
      loginCommand: "claude login",
      authMethods: [{ id: "cli", name: "CLI", type: "terminal", env: { BROWSER: "/bin/true" } }],
    });
    const result = resolveDiscoverySignIn(wslStatus, desktop);
    expect(result.kind).toBe("terminal");
    if (result.kind !== "terminal") throw new Error("expected terminal");
    expect(result.status).toBe(wslStatus);
    expect(result.command).toBe("claude login");
    expect(result.env).toEqual({ BROWSER: "/bin/true" });
    expect(terminalProject(result)).toBe(wslProject);
  });

  it("uses the agent-owned ACP auth method and the exact environment target", () => {
    const wslStatus = status({
      kind: "gemini",
      envKind: "wsl",
      envDistro: "Ubuntu",
      authMethods: [{ id: "oauth", name: "Gemini OAuth" }],
    });
    const result = resolveDiscoverySignIn(wslStatus, desktop);
    expect(result.kind).toBe("agentAuth");
    if (result.kind !== "agentAuth") throw new Error("expected agentAuth");
    expect(result.status).toBe(wslStatus);
    expect(result.methodId).toBe("oauth");
    expect(result.target).toEqual({ envKind: "wsl", wslDistro: "Ubuntu" });
  });

  it("prefers the ACP method when both an ACP method and a login command exist", () => {
    const result = resolveDiscoverySignIn(
      status({
        loginCommand: "codex login",
        authMethods: [{ id: "oauth", name: "OAuth" }],
      }),
      desktop,
    );
    expect(result.kind).toBe("agentAuth");
  });

  it("honors preferTerminalLogin even when an ACP method is advertised", () => {
    const result = resolveDiscoverySignIn(
      status({
        loginCommand: "grok login",
        preferTerminalLogin: true,
        authMethods: [{ id: "oauth", name: "OAuth" }],
      }),
      desktop,
    );
    expect(result.kind).toBe("terminal");
    expect(terminalProject(result).id).toBe("__machine__:posix");
  });

  it("falls back to Settings when no direct auth method is reported", () => {
    expect(resolveDiscoverySignIn(status(), desktop).kind).toBe("settings");
  });

  it("never crosses provider/account/environment scope between rows", () => {
    const nativeCodex = status({
      kind: "codex",
      envKind: "windows",
      loginCommand: "codex login",
    });
    const wslClaude = status({
      kind: "claude:work",
      label: "Claude Work",
      envKind: "wsl",
      envDistro: "Ubuntu",
      authMethods: [{ id: "work-oauth", name: "Work OAuth" }],
    });
    const a = resolveDiscoverySignIn(nativeCodex, desktop);
    const b = resolveDiscoverySignIn(wslClaude, desktop);
    expect(a.kind).toBe("terminal");
    expect(b.kind).toBe("agentAuth");
    expect(a).toMatchObject({ kind: "terminal", status: nativeCodex });
    expect(terminalProject(a).id).toBe("__machine__:posix");
    expect(b).toMatchObject({
      kind: "agentAuth",
      status: wslClaude,
      methodId: "work-oauth",
      target: { envKind: "wsl", wslDistro: "Ubuntu" },
    });
  });
});

describe("resolveDiscoverySignIn — exact local login target", () => {
  it("resolves a concrete home-rooted local project on POSIX with no project", () => {
    // The previous project lookup returned undefined here, so the login
    // terminal fell back to an unrelated focused/first project.
    const result = resolveDiscoverySignIn(
      status({ envKind: "posix", loginCommand: "codex login" }),
      { isBrowserClient: false, isWindows: false, projects: [] },
    );
    expect(result.kind).toBe("terminal");
    if (result.kind !== "terminal") throw new Error("expected terminal");
    expect(result.project.location).toMatchObject({ kind: "posix", path: "~" });
    expect(terminalProject(result).id).toBe("__machine__:posix");
  });

  it("never targets a competing paired desktop's Windows project", () => {
    const result = resolveDiscoverySignIn(
      status({ envKind: "windows", loginCommand: "codex login" }),
      { isBrowserClient: false, isWindows: true, projects: [pairedWindowsProject] },
    );
    expect(result.kind).toBe("terminal");
    if (result.kind !== "terminal") throw new Error("expected terminal");
    expect(result.project.id).not.toBe(pairedWindowsProject.id);
    expect(result.project.location.kind).toBe("windows");
    expect(terminalProject(result).id).toBe("__machine__:windows");
  });

  it("never borrows a paired desktop's WSL checkout for the same distro", () => {
    const result = resolveDiscoverySignIn(
      status({ kind: "claude", envKind: "wsl", envDistro: "Ubuntu", loginCommand: "claude login" }),
      { isBrowserClient: false, isWindows: true, projects: [pairedWslProject] },
    );
    expect(result.kind).toBe("terminal");
    expect(terminalProject(result).id).toBe("__machine__:wsl:Ubuntu");
  });

  it("pins an unregistered WSL distro to its own home-rooted project", () => {
    const result = resolveDiscoverySignIn(
      status({
        kind: "claude",
        envKind: "wsl",
        envDistro: "Ubuntu-22.04",
        loginCommand: "claude login",
      }),
      desktop,
    );
    expect(result.kind).toBe("terminal");
    if (result.kind !== "terminal") throw new Error("expected terminal");
    expect(result.project.location).toMatchObject({
      kind: "wsl",
      distro: "Ubuntu-22.04",
      linuxPath: "~",
    });
    expect(terminalProject(result).id).toBe("__machine__:wsl:Ubuntu-22.04");
  });

  it("keeps the browser fallback even when a paired project would match", () => {
    expect(
      resolveDiscoverySignIn(
        status({ envKind: "wsl", envDistro: "Ubuntu", loginCommand: "codex login" }),
        { isBrowserClient: true, isWindows: true, projects: [pairedWslProject] },
      ).kind,
    ).toBe("browserFallback");
  });
});
