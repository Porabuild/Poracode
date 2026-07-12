import { describe, expect, it, vi } from "vitest";
import type {
  McpProbeEnvironment,
  McpProbeResult,
  McpServer,
  ProjectLocation,
} from "@/shared/contracts";
import { McpProbeService } from "./McpProbeService";

type HostProbe = (
  server: McpServer,
  environment: McpProbeEnvironment,
  signal: AbortSignal,
) => Promise<McpProbeResult>;
type WslProbe = (
  server: McpServer,
  location: Extract<ProjectLocation, { kind: "wsl" }>,
  environment: McpProbeEnvironment,
  signal: AbortSignal,
) => Promise<McpProbeResult>;

const server: McpServer = {
  id: "test",
  name: "test",
  description: "",
  enabled: true,
  timeoutMs: 2_000,
  transport: { type: "stdio", command: "test-command", args: [], env: {} },
};

function available(runtime: "host" | "wsl", projectScoped: boolean): McpProbeResult {
  return {
    status: "available",
    toolCount: 3,
    latencyMs: 1,
    environment: { runtime, projectScoped },
  };
}

describe("McpProbeService", () => {
  it("probes user-scoped servers on the host without inventing a project cwd", async () => {
    const probeHost = vi.fn<HostProbe>(async () => available("host", false));
    const probeWsl = vi.fn<WslProbe>(async () => available("wsl", true));
    const service = new McpProbeService({ probeHost, probeWsl });

    await expect(service.probe({ server })).resolves.toMatchObject({
      status: "available",
      environment: { runtime: "host", projectScoped: false },
    });
    expect(probeHost).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.not.objectContaining({ cwd: expect.anything() }),
      }),
      { runtime: "host", projectScoped: false },
      expect.any(AbortSignal),
    );
    expect(probeWsl).not.toHaveBeenCalled();
  });

  it("uses the native project cwd for a host workspace probe", async () => {
    const probeHost = vi.fn<HostProbe>(async () => available("host", true));
    const location: ProjectLocation = { kind: "windows", path: "C:\\workspace" };
    const service = new McpProbeService({ probeHost });

    await service.probe({ server, projectLocation: location });

    expect(probeHost).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({ type: "stdio", cwd: "C:\\workspace" }),
      }),
      { runtime: "host", projectScoped: true },
      expect.any(AbortSignal),
    );
  });

  it("routes a WSL workspace probe into its distro and Linux cwd", async () => {
    const probeHost = vi.fn<HostProbe>(async () => available("host", true));
    const probeWsl = vi.fn<WslProbe>(async () => available("wsl", true));
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/workspace",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\workspace",
    };
    const service = new McpProbeService({ probeHost, probeWsl });

    await expect(service.probe({ server, projectLocation: location })).resolves.toMatchObject({
      environment: { runtime: "wsl", projectScoped: true },
    });
    expect(probeWsl).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({ type: "stdio", cwd: "/home/demo/workspace" }),
      }),
      location,
      { runtime: "wsl", projectScoped: true },
      expect.any(AbortSignal),
    );
    expect(probeHost).not.toHaveBeenCalled();
  });

  it("preserves an explicitly configured stdio cwd", async () => {
    let received: McpServer | undefined;
    const probeHost = vi.fn<HostProbe>(async (candidate) => {
      received = candidate;
      return available("host", true);
    });
    const service = new McpProbeService({ probeHost });

    await service.probe({
      server: {
        ...server,
        transport: {
          type: "stdio",
          command: "test-command",
          args: [],
          env: {},
          cwd: "C:\\custom",
        },
      },
      projectLocation: { kind: "windows", path: "C:\\workspace" },
    });

    expect(received?.transport).toMatchObject({ cwd: "C:\\custom" });
  });

  it("bounds a WSL executor with the configured timeout", async () => {
    const probeWsl = vi.fn<WslProbe>(
      (_server, _location, _environment, signal) =>
        new Promise<McpProbeResult>((resolve) => {
          signal.addEventListener(
            "abort",
            () =>
              resolve({
                status: "unavailable",
                toolCount: 0,
                latencyMs: 10,
                environment: { runtime: "wsl", projectScoped: true },
                error: { code: "timeout", message: "Connection timed out." },
              }),
            { once: true },
          );
        }),
    );
    const service = new McpProbeService({ probeWsl });

    await expect(
      service.probe({
        server: { ...server, timeoutMs: 10 },
        projectLocation: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/workspace",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\workspace",
        },
      }),
    ).resolves.toMatchObject({ status: "unavailable", error: { code: "timeout" } });
  });
});
