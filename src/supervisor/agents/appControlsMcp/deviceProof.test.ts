import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_WORKSPACE_AGENT_KEY_ENV,
  verifyDeviceThreadProof,
} from "@/shared/deviceWorkspaceAgentProof";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("device agent launch credential custody", () => {
  it("delivers only a thread-bound proof and consumes the supervisor signing key", async () => {
    vi.resetModules();
    const key = "isolated-test-key";
    vi.stubEnv(DEVICE_WORKSPACE_AGENT_KEY_ENV, key);
    vi.stubEnv("PORACODE_APP_CONTROLS_MCP_URL", "http://127.0.0.1:1234");
    vi.stubEnv("PORACODE_APP_CONTROLS_MCP_TOKEN", "test-mcp-token");
    const { resolveAppControlsMcpHttpConfig } = await import("./index");
    const config = resolveAppControlsMcpHttpConfig({ kind: "posix" }, { threadId: "thread-A" })!;
    const proof = new URL(config.url).searchParams.get("deviceProof")!;
    expect(verifyDeviceThreadProof(key, "thread-A", proof)).toBe(true);
    expect(verifyDeviceThreadProof(key, "thread-B", proof)).toBe(false);
    expect(process.env[DEVICE_WORKSPACE_AGENT_KEY_ENV]).toBeUndefined();
    const { sanitizedProcessEnv, describeSpawnFailure } =
      await import("@/supervisor/runtime/threadSession/spawnDiagnostics");
    expect(sanitizedProcessEnv).not.toHaveProperty(DEVICE_WORKSPACE_AGENT_KEY_ENV);
    const diagnostics = describeSpawnFailure(
      "agent",
      { command: "node", args: [] },
      { ...sanitizedProcessEnv },
      new Error("fixture failure"),
    );
    expect(diagnostics.includes(key)).toBe(false);
    expect(diagnostics.includes(proof)).toBe(false);
    expect(JSON.stringify(config).includes(key)).toBe(false);
  });
  it("keeps pre-feature unsigned launch URLs usable for existing tools", async () => {
    vi.resetModules();
    vi.stubEnv(DEVICE_WORKSPACE_AGENT_KEY_ENV, "");
    vi.stubEnv("PORACODE_APP_CONTROLS_MCP_URL", "http://127.0.0.1:1234");
    vi.stubEnv("PORACODE_APP_CONTROLS_MCP_TOKEN", "test-mcp-token");
    const { resolveAppControlsMcpHttpConfig } = await import("./index");
    const config = resolveAppControlsMcpHttpConfig(
      { kind: "posix" },
      { threadId: "legacy-thread" },
    )!;
    expect(new URL(config.url).searchParams.has("deviceProof")).toBe(false);
    expect(config.headers.Authorization).toBe("Bearer test-mcp-token");
  });
  it("preserves the thread proof when the existing WSL transport rewrites its gateway", async () => {
    vi.resetModules();
    const key = "isolated-wsl-test-key";
    vi.stubEnv(DEVICE_WORKSPACE_AGENT_KEY_ENV, key);
    vi.stubEnv("PORACODE_APP_CONTROLS_MCP_URL", "http://127.0.0.1:1234");
    vi.stubEnv("PORACODE_APP_CONTROLS_MCP_TOKEN", "test-mcp-token");
    const { resolveAppControlsMcpHttpConfigForLaunch } = await import("./index");
    const config = await resolveAppControlsMcpHttpConfigForLaunch(
      { kind: "wsl", distro: "Fixture" },
      { resolveHostAccess: async () => ({ kind: "gateway", ip: "172.28.0.1" }) },
      { threadId: "thread-A" },
    );
    const url = new URL(config!.url);
    expect(url.hostname).toBe("172.28.0.1");
    expect(url.port).toBe("1234");
    expect(verifyDeviceThreadProof(key, "thread-A", url.searchParams.get("deviceProof")!)).toBe(
      true,
    );
    expect(process.env[DEVICE_WORKSPACE_AGENT_KEY_ENV]).toBeUndefined();
  });
});
