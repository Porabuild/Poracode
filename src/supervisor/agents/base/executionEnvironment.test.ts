import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "./types";

const resolveDefaultWslDistro = vi.hoisted(() =>
  vi.fn<(signal?: AbortSignal) => Promise<string>>().mockResolvedValue("Ubuntu"),
);
const windowsProjectLocationInWsl = vi.hoisted(() =>
  vi
    .fn<
      (
        location: Extract<ProjectLocation, { kind: "windows" }>,
        signal?: AbortSignal,
      ) => Promise<Extract<ProjectLocation, { kind: "wsl" }>>
    >()
    .mockResolvedValue({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/mnt/c/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\repo",
    }),
);
const windowsProjectLocationInWslDistro = vi.hoisted(() =>
  vi
    .fn<
      (
        location: Extract<ProjectLocation, { kind: "windows" }>,
        distro: string,
        signal?: AbortSignal,
      ) => Promise<Extract<ProjectLocation, { kind: "wsl" }>>
    >()
    .mockResolvedValue({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/mnt/c/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\repo",
    }),
);

vi.mock("../../wsl/projectLocation", () => ({
  resolveDefaultWslDistro,
  windowsProjectLocationInWsl,
  windowsProjectLocationInWslDistro,
}));

import {
  buildWindowsWslLoginCommand,
  buildWindowsWslShellCommand,
  resolveAgentEnvContext,
  resolveAgentProjectLocation,
} from "./executionEnvironment";

const adapter = { windowsProjectExecution: "wsl" } as AgentAdapter;

afterEach(() => vi.restoreAllMocks());
beforeEach(() => vi.clearAllMocks());

describe("provider-declared Windows execution environment", () => {
  it("routes Windows detection and project execution through WSL", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const location = { kind: "windows", path: "C:\\repo" } as const;

    await expect(resolveAgentEnvContext(adapter, { envKind: "windows" })).resolves.toEqual({
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });
    await expect(resolveAgentProjectLocation(adapter, location)).resolves.toMatchObject({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/mnt/c/repo",
    });
    expect(windowsProjectLocationInWsl).toHaveBeenCalledWith(location, undefined);
  });

  it("reuses a persisted distro and forwards cancellation", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const location = { kind: "windows", path: "C:\\repo" } as const;
    const signal = new AbortController().signal;

    await resolveAgentProjectLocation(adapter, location, { kind: "wsl", distro: "Ubuntu" }, signal);

    expect(windowsProjectLocationInWslDistro).toHaveBeenCalledWith(location, "Ubuntu", signal);
    expect(windowsProjectLocationInWsl).not.toHaveBeenCalled();
  });

  it("leaves undeclared adapters and non-Windows locations unchanged", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const location = { kind: "windows", path: "C:\\repo" } as const;
    const nativeAdapter = {} as AgentAdapter;

    await expect(resolveAgentProjectLocation(nativeAdapter, location)).resolves.toBe(location);
    await expect(
      resolveAgentEnvContext(adapter, { envKind: "wsl", wslDistro: "Debian" }),
    ).resolves.toEqual({ envKind: "wsl", wslDistro: "Debian" });
  });

  it("builds a PowerShell-safe WSL login command with provider env", () => {
    expect(
      buildWindowsWslShellCommand("Ubuntu Dev", "muse login", {
        MUSE_NO_AUTO_UPDATE: "1",
        BROWSER: "/bin/true",
      }),
    ).toBe(
      "wsl.exe -d 'Ubuntu Dev' --exec bash -l -i -c 'export MUSE_NO_AUTO_UPDATE=''1''; export BROWSER=''/bin/true''; muse login'",
    );
  });

  it("opens WSL login URLs in Windows even when the provider suppresses launch browsers", () => {
    expect(
      buildWindowsWslLoginCommand(
        {
          baseSpawnEnv: { MUSE_NO_AUTO_UPDATE: "1" },
          spawnEnv: { wsl: { BROWSER: "/bin/true" } },
        } as unknown as AgentAdapter,
        "Ubuntu",
        "muse login",
      ),
    ).toContain("export BROWSER=''cmd.exe /c start \"\"''");
  });
});
