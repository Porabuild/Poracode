import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { authenticateAcpAgent, logoutAcpAgent, probeAcpCapabilities } from "../acp";
import {
  authenticateAcpGenericInstance,
  createAcpGenericAdapter,
  logoutAcpGenericInstance,
  verifyAcpGenericAuthentication,
} from ".";

vi.mock("../acp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../acp")>();
  return {
    ...actual,
    authenticateAcpAgent: vi.fn<() => Promise<void>>(),
    createAcpStructuredSession: vi.fn<() => undefined>(),
    logoutAcpAgent: vi.fn<() => Promise<void>>(),
    probeAcpCapabilities:
      vi.fn<
        (
          ...args: Parameters<typeof probeAcpCapabilities>
        ) => ReturnType<typeof probeAcpCapabilities>
      >(),
  };
});

/**
 * The acp-generic adapter is the proof-point that any ACP-speaking binary
 * plugs into chat mode without provider-specific code. These tests verify
 * that an `AgentInstanceConfig` produces a well-formed `AgentAdapter` whose
 * kind, label, and capability declarations route correctly through the
 * registry — without spawning the real binary.
 */

const baseInstance: AgentInstanceConfig = {
  id: "my-acp",
  driver: "acp-generic",
  displayName: "My Custom ACP",
  config: {
    binary: "my-acp",
    args: ["--stdio"],
    cwd: "project",
    authMode: "none",
  },
};

describe("createAcpGenericAdapter", () => {
  beforeEach(() => {
    vi.mocked(authenticateAcpAgent).mockReset().mockResolvedValue(undefined);
    vi.mocked(logoutAcpAgent).mockReset().mockResolvedValue(undefined);
    vi.mocked(probeAcpCapabilities).mockReset().mockResolvedValue(undefined);
  });

  it("produces a chat-only adapter with a namespaced kind", () => {
    const adapter = createAcpGenericAdapter(baseInstance);
    expect(adapter.kind).toBe("acp-generic:my-acp");
    expect(adapter.label).toBe("My Custom ACP");
    expect(adapter.capabilities.presentationModes).toEqual(["gui"]);
    expect(adapter.capabilities.liveInputMode).toBe("server");
    // No PTY launch path — generic ACP is structured-only.
    expect(typeof adapter.createStructuredSession).toBe("function");
  });

  it("falls back to the binary as a label when displayName is omitted", () => {
    const adapter = createAcpGenericAdapter({ ...baseInstance, displayName: undefined });
    expect(adapter.label).toBe("my-acp");
  });

  it("exposes the instance icon on detected status", async () => {
    const adapter = createAcpGenericAdapter({
      ...baseInstance,
      icon: "https://example.com/icon.svg",
      version: "1.2.3",
    });
    const status = await adapter.detectInstall();
    expect(status.icon).toBe("https://example.com/icon.svg");
    expect(status.version).toBe("1.2.3");
  });

  it("injects synthetic supervised and auto-approve policies when the probe declares none", async () => {
    // Some agents don't advertise yolo/autopilot. We expose a synthetic
    // "never" policy so users can still pick "Auto Approve", while "default"
    // keeps the supervised prompting path available.
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      models: [{ id: "model-a", label: "Model A" }],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.capabilities.approvalPolicies).toEqual([
      { id: "default", label: "Supervised" },
      { id: "never", label: "Auto Approve" },
    ]);
  });

  it("normalizes probe-produced default-only approval policy to supervised and auto-approve", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      approvalPolicies: [{ id: "default", label: "Ask for permission" }],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.capabilities.approvalPolicies).toEqual([
      { id: "default", label: "Supervised" },
      { id: "never", label: "Auto Approve" },
    ]);
  });

  it("does not override agent-advertised approval policies", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      approvalPolicies: [{ id: "auto_edit", label: "Auto edit" }],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.capabilities.approvalPolicies).toEqual([{ id: "auto_edit", label: "Auto edit" }]);
  });

  it("merges ACP-probed capabilities into detected status", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      models: [{ id: "model-a", label: "Model A" }],
      modes: ["agent", "plan"],
      approvalPolicies: [{ id: "default", label: "Default" }],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.capabilities.models).toEqual([{ id: "model-a", label: "Model A" }]);
    expect(status.capabilities.modes).toEqual(["agent", "plan"]);
    expect(status.capabilities.approvalPolicies).toEqual([
      { id: "default", label: "Supervised" },
      { id: "never", label: "Auto Approve" },
    ]);
  });

  it("normalizes Factory Droid model rates at the provider boundary", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      models: [
        {
          id: "glm-5.1",
          label: "Droid Core (GLM-5.1)",
          description: "0.55x Factory token rate",
        },
        {
          id: "auto",
          label: "Auto",
          description: "Let Droid choose the best model",
        },
      ],
    });
    const adapter = createAcpGenericAdapter({
      ...baseInstance,
      id: "factory-droid",
      displayName: "Factory Droid",
    });
    const status = await adapter.detectInstall();
    expect(status.capabilities.models).toEqual([
      {
        id: "glm-5.1",
        label: "Droid Core (GLM-5.1)",
        description: "0.55x",
        tooltipDescription: "0.55x Factory token rate",
      },
      { id: "auto", label: "Auto", description: "Let Droid choose the best model" },
    ]);
  });

  it("repairs an existing Factory Droid daemon command before launch", async () => {
    const adapter = createAcpGenericAdapter({
      ...baseInstance,
      id: "factory-droid",
      config: {
        binary: "npx",
        args: ["-y", "droid@0.170.0", "exec", "--output-format", "acp-daemon"],
      },
    });

    await adapter.detectInstall();

    const launchArgs = vi.mocked(probeAcpCapabilities).mock.calls[0]?.[1] ?? [];
    expect(launchArgs.slice(-5)).toEqual(["-y", "droid@0.170.0", "exec", "--output-format", "acp"]);
    expect(launchArgs).not.toContain("acp-daemon");
  });

  it("does not parse token-rate prose for other ACP-generic instances", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      models: [
        {
          id: "glm-5.1",
          label: "GLM-5.1",
          description: "0.55x Factory token rate",
        },
      ],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.capabilities.models).toEqual([
      { id: "glm-5.1", label: "GLM-5.1", description: "0.55x Factory token rate" },
    ]);
  });

  it("uses ACP env-var auth methods to report missing auth", async () => {
    const key = "__LIGHTCODE_ACP_GENERIC_AUTH_METHOD_TEST__";
    delete process.env[key];
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      authMethods: [
        {
          type: "env_var",
          id: "example-key",
          name: "Example API key",
          vars: [{ name: key }],
        },
      ],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.authState).toBe("missing");
    expect(status.authMethods).toEqual([
      {
        type: "env_var",
        id: "example-key",
        name: "Example API key",
        vars: [{ name: key }],
      },
    ]);
    expect(status.providerMetadata?.authMethod).toBe("Example API key");
  });

  it("deduplicates repeated ACP auth method names in provider metadata", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      authMethods: [
        {
          type: "env_var",
          id: "example-native",
          name: "Example API key",
          vars: [{ name: "EXAMPLE_API_KEY" }],
        },
        {
          type: "env_var",
          id: "example-wsl",
          name: "Example API key",
          vars: [{ name: "EXAMPLE_API_KEY" }],
        },
      ],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.providerMetadata?.authMethod).toBe("Example API key");
  });

  it("drops malformed env-var auth methods without showing them as login methods", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      authMethods: [
        { id: "login", name: "Login" },
        {
          id: "factory-key",
          name: "Factory API Key",
          vars: [{ name: "FACTORY_API_KEY" }],
        } as never,
      ],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.authMethods).toEqual([{ id: "login", name: "Login" }]);
    expect(status.providerMetadata?.authMethod).toBeUndefined();
  });

  it("reports ACP terminal auth as missing until a session probe succeeds", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      authMethods: [
        {
          type: "terminal",
          id: "cli-login",
          name: "CLI login",
          args: ["login"],
        },
      ],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.authState).toBe("missing");
    expect(status.loginCommand).toBe("my-acp --stdio login");
  });

  it("treats ACP terminal-auth metadata as terminal auth", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      authMethods: [
        {
          id: "copilot-login",
          name: "Log in with Copilot CLI",
          _meta: {
            "terminal-auth": {
              args: ["login"],
              env: { BROWSER: "/bin/true" },
            },
          },
        },
      ],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.authState).toBe("missing");
    expect(status.loginCommand).toBe("my-acp --stdio login");
    expect(status.authMethods?.[0]).toMatchObject({
      type: "terminal",
      id: "copilot-login",
      name: "Log in with Copilot CLI",
      args: ["login"],
      env: { BROWSER: "/bin/true" },
    });
  });

  it("drops agent-owned methods that duplicate an env-var method name", async () => {
    // Some agents advertise both an agent-typed stub and the real env_var
    // method under the same display name. The stub's authenticate() just acks,
    // so surfacing it in the UI produces a Login button that does nothing.
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      authMethods: [
        { id: "example-api-key", name: "Example API key" },
        {
          type: "env_var",
          id: "example_api_key",
          name: "Example API key",
          vars: [{ name: "EXAMPLE_API_KEY" }],
        },
      ],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.authMethods).toEqual([
      {
        type: "env_var",
        id: "example_api_key",
        name: "Example API key",
        vars: [{ name: "EXAMPLE_API_KEY" }],
      },
    ]);
  });

  it("trusts ACP probe authState when newSession returns auth_required", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      authState: "missing",
      authMethods: [{ id: "login", name: "Login" }],
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.authState).toBe("missing");
    expect(status.authMethods).toEqual([{ id: "login", name: "Login" }]);
  });

  it("reports advertised agent auth as missing even when a session probe succeeds", async () => {
    // `sessionEstablished` is not a reliable proxy for "signed in" — some
    // agents (e.g. Cline) accept newSession unauthenticated. Until we have a
    // positive identity signal, fall through to "missing" so the UI prompts
    // for login instead of falsely claiming Signed in.
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      sessionEstablished: true,
      authMethods: [{ id: "browser-login", name: "Browser login" }],
      authLogoutSupported: true,
    });
    const adapter = createAcpGenericAdapter(baseInstance);
    const status = await adapter.detectInstall();
    expect(status.authState).toBe("missing");
    expect(status.authLogoutSupported).toBe(true);
  });

  it("treats per-env authAcknowledged native flag as authenticated on native only", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      sessionEstablished: true,
      authMethods: [{ id: "browser-login", name: "Browser login" }],
    });
    const adapter = createAcpGenericAdapter({
      ...baseInstance,
      authAcknowledged: { native: true },
    });
    expect((await adapter.detectInstall()).authState).toBe("authenticated");
    expect((await adapter.detectInstall({ envKind: "wsl", wslDistro: "Ubuntu" })).authState).toBe(
      "missing",
    );
  });

  it("treats per-env authAcknowledged wsl distro flag as authenticated only in that distro", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValue({
      sessionEstablished: true,
      authMethods: [{ id: "browser-login", name: "Browser login" }],
    });
    const adapter = createAcpGenericAdapter({
      ...baseInstance,
      authAcknowledged: { wsl: { Ubuntu: true } },
    });
    expect((await adapter.detectInstall({ envKind: "wsl", wslDistro: "Ubuntu" })).authState).toBe(
      "authenticated",
    );
    expect((await adapter.detectInstall({ envKind: "wsl", wslDistro: "Debian" })).authState).toBe(
      "missing",
    );
    expect((await adapter.detectInstall()).authState).toBe("missing");
  });

  it("merges user-declared capability overrides into the default capability set", () => {
    const adapter = createAcpGenericAdapter({
      ...baseInstance,
      config: {
        ...(baseInstance.config as Record<string, unknown>),
        capabilities: { models: ["x-1", "x-2"], modes: ["agent", "plan"] },
      },
    });
    expect(adapter.capabilities.models).toEqual([
      { id: "x-1", label: "x-1" },
      { id: "x-2", label: "x-2" },
    ]);
    expect(adapter.capabilities.modes).toEqual(["agent", "plan"]);
  });

  it("envVar auth resolves authState from process.env at detection time", async () => {
    const key = "__LIGHTCODE_ACP_GENERIC_TEST__";
    delete process.env[key];
    const adapterMissing = createAcpGenericAdapter({
      ...baseInstance,
      config: {
        ...(baseInstance.config as Record<string, unknown>),
        authMode: "envVar",
        authEnvVar: key,
      },
    });
    const missingStatus = await adapterMissing.detectInstall();
    expect(missingStatus.authState).toBe("missing");

    process.env[key] = "secret";
    try {
      const adapterAuthed = createAcpGenericAdapter({
        ...baseInstance,
        config: {
          ...(baseInstance.config as Record<string, unknown>),
          authMode: "envVar",
          authEnvVar: key,
        },
      });
      const authedStatus = await adapterAuthed.detectInstall();
      expect(authedStatus.authState).toBe("authenticated");
    } finally {
      delete process.env[key];
    }
  });

  it("authenticates in the requested WSL environment", async () => {
    await authenticateAcpGenericInstance(baseInstance, "browser-login", {
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });

    const [command, args] = vi.mocked(authenticateAcpAgent).mock.calls[0]!;
    expect(command).toMatch(/wsl(?:\.exe)?$/u);
    expect(args).toContain("Ubuntu");
    expect(args.at(-1)).toContain("BROWSER=");
    expect(args.at(-1)).toContain("cmd.exe /c start");
  });

  it("verifies authentication with a fresh ACP probe", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValueOnce({ authState: "authenticated" });

    await expect(verifyAcpGenericAuthentication(baseInstance)).resolves.toBe(true);
  });

  it("treats missing auth after browser login as incomplete", async () => {
    vi.mocked(probeAcpCapabilities).mockResolvedValueOnce({ authState: "missing" });

    await expect(verifyAcpGenericAuthentication(baseInstance)).resolves.toBe(false);
  });

  it("logs out in the requested WSL environment", async () => {
    await logoutAcpGenericInstance(baseInstance, {
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });

    const [command, args] = vi.mocked(logoutAcpAgent).mock.calls[0]!;
    expect(command).toMatch(/wsl(?:\.exe)?$/u);
    expect(args).toContain("Ubuntu");
  });
});
