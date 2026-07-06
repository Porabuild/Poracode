import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLightcodePaths } from "@/shared/lightcodePaths";
import { defaultSharedSettings } from "@/shared/settings";

const dispatchAcpAuthenticateMock = vi.hoisted(() =>
  vi.fn<
    (input: {
      adapter: unknown;
      methodId: string;
      envKind?: "windows" | "wsl";
      wslDistro?: string;
    }) => Promise<void>
  >(),
);
const verifyAcpGenericAuthenticationMock = vi.hoisted(() =>
  vi.fn<(instance: unknown, ctx?: unknown) => Promise<boolean>>(),
);

vi.mock("../agents/acp", async (importActual) => {
  const actual = await importActual<typeof import("../agents/acp")>();
  return {
    ...actual,
    dispatchAcpAuthenticate: dispatchAcpAuthenticateMock,
  };
});

vi.mock("../agents/acp-generic", async (importActual) => {
  const actual = await importActual<typeof import("../agents/acp-generic")>();
  return {
    ...actual,
    verifyAcpGenericAuthentication: verifyAcpGenericAuthenticationMock,
  };
});

import { SupervisorRuntime } from "../supervisorRuntime";

const tempDirs: string[] = [];
const runtimesToDispose: SupervisorRuntime[] = [];
const lightcodeDataDirBeforeTests = process.env.LIGHTCODE_DATA_DIR;

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lightcode-runtime-auth-"));
  tempDirs.push(dir);
  return dir;
}

function makeRuntime(emit: ConstructorParameters<typeof SupervisorRuntime>[0]): SupervisorRuntime {
  const runtime = new SupervisorRuntime(emit);
  runtimesToDispose.push(runtime);
  // `authenticateAcpAgent` fires `void refreshAffectedAgentStatus(...)`, a
  // fire-and-forget host-detection sweep that runs after our assertions and is
  // never awaited. Left real, it spawns the native agent probes — including the
  // Claude Agent SDK subprocess and a billed fast-mode turn — then leaks an
  // unhandled `EPIPE` when this unit test tears the runtime down mid-probe (the
  // racing stdin write lives inside the SDK and has no error listener we can
  // attach). This test only exercises auth-ack persistence, so stub the status
  // service's two detection entry points to inert no-ops.
  const statusService = (
    runtime as unknown as {
      agentStatusService: {
        listWslDistros: () => Promise<string[]>;
        refreshAgentStatuses: (payload: unknown) => Promise<unknown>;
      };
    }
  ).agentStatusService;
  vi.spyOn(statusService, "listWslDistros").mockResolvedValue([]);
  vi.spyOn(statusService, "refreshAgentStatuses").mockResolvedValue({
    windows: [],
    wsl: [],
    fromCache: false,
  });
  return runtime;
}

afterEach(() => {
  for (const runtime of runtimesToDispose.splice(0)) {
    runtime.dispose();
  }
  if (lightcodeDataDirBeforeTests === undefined) {
    delete process.env.LIGHTCODE_DATA_DIR;
  } else {
    process.env.LIGHTCODE_DATA_DIR = lightcodeDataDirBeforeTests;
  }
  dispatchAcpAuthenticateMock.mockReset();
  verifyAcpGenericAuthenticationMock.mockReset();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeGenericAcpSettings(
  dataDir: string,
  authAcknowledged?: { native?: boolean; wsl?: Record<string, boolean> },
): string {
  const { settingsPath } = resolveLightcodePaths(dataDir);
  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        ...defaultSharedSettings,
        agentInstances: {
          "my-acp": {
            id: "my-acp",
            driver: "acp-generic",
            displayName: "My ACP",
            ...(authAcknowledged ? { authAcknowledged } : {}),
            config: {
              binary: "my-acp",
              args: ["--stdio"],
              cwd: "project",
              authMode: "none",
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return settingsPath;
}

describe("authenticateAcpAgent", () => {
  it("persists generic ACP auth only after verification succeeds", async () => {
    const dataDir = makeTempDir();
    process.env.LIGHTCODE_DATA_DIR = dataDir;
    const settingsPath = writeGenericAcpSettings(dataDir);
    dispatchAcpAuthenticateMock.mockResolvedValue(undefined);
    verifyAcpGenericAuthenticationMock.mockResolvedValueOnce(true);

    const runtime = makeRuntime(() => {});
    await runtime.agentRegistryService.authenticateAcpAgent({
      agentKind: "acp-generic:my-acp",
      methodId: "browser-login",
    });

    expect(dispatchAcpAuthenticateMock).toHaveBeenCalledWith(
      expect.objectContaining({ methodId: "browser-login" }),
    );
    expect(verifyAcpGenericAuthenticationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "my-acp" }),
      undefined,
    );
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      agentInstances: Record<string, { authAcknowledged?: { native?: boolean } }>;
    };
    expect(settings.agentInstances["my-acp"]?.authAcknowledged?.native).toBe(true);
  });

  it("clears generic ACP auth when browser login does not complete", async () => {
    const dataDir = makeTempDir();
    process.env.LIGHTCODE_DATA_DIR = dataDir;
    const settingsPath = writeGenericAcpSettings(dataDir, { native: true });
    dispatchAcpAuthenticateMock.mockResolvedValue(undefined);
    verifyAcpGenericAuthenticationMock.mockResolvedValueOnce(false);

    const runtime = makeRuntime(() => {});
    await expect(
      runtime.agentRegistryService.authenticateAcpAgent({
        agentKind: "acp-generic:my-acp",
        methodId: "browser-login",
      }),
    ).rejects.toThrow("ACP authentication was not completed.");

    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      agentInstances: Record<string, { authAcknowledged?: { native?: boolean } }>;
    };
    expect(settings.agentInstances["my-acp"]?.authAcknowledged).toBeUndefined();
  });
});
