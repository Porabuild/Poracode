import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginInfo } from "./clientTypes";

const mocks = vi.hoisted(() => ({
  command:
    vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>>(),
  resolve: vi.fn<(...args: unknown[]) => Promise<string | undefined>>(),
  acquire: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  terminal: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
}));
vi.mock("../base", () => ({
  detectProbeLocation: () => ({ kind: "posix", path: "/home/test" }),
  readAgentCommandOutput: mocks.command,
}));
vi.mock("./binary", () => ({
  OPENCODE2_ENV: { OPENCODE_DB: "opencode-v2.db" },
  resolveOpenCode2Binary: mocks.resolve,
}));
vi.mock("./client", () => ({ acquireOpenCode2Server: mocks.acquire }));
vi.mock("./terminalPluginConfig", () => ({ readOpenCode2TerminalPackages: mocks.terminal }));
import {
  manageOpenCode2Plugins,
  openCode2PluginPackages,
  validateOpenCode2PluginTarget,
} from "./plugins";

const plugin: PluginInfo = {
  id: "goal",
  source: { type: "package", target: "@vendor/goal", version: "1.2.3", outdated: true },
  features: { server: true, tui: true },
  state: { status: "active" },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue("/bin/provider");
  mocks.command.mockResolvedValue({ ok: true, stdout: "installed", stderr: "" });
  mocks.terminal.mockResolvedValue([]);
});

function setup() {
  const list = vi.fn<() => Promise<{ data: PluginInfo[] }>>().mockResolvedValue({ data: [plugin] });
  const update = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const dispose = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  mocks.acquire.mockResolvedValue({
    client: {
      plugin: {
        list,
        check: list,
        update,
        awaitActivation: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    },
    dispose,
  });
  return { list, update, dispose };
}

describe("OpenCode 2 native plugin manager", () => {
  it("normalizes package metadata without exposing local or built-in entries", () => {
    expect(openCode2PluginPackages([plugin, { ...plugin, source: { type: "builtin" } }])).toEqual([
      {
        target: "@vendor/goal",
        id: "goal",
        version: "1.2.3",
        status: "active",
        outdated: true,
        server: true,
        terminal: true,
      },
    ]);
  });
  it.each(["--help", "", "pkg\nother", "pkg other", "-bad"])(
    "rejects unsafe command targets: %s",
    (target) => {
      expect(() => validateOpenCode2PluginTarget(target)).toThrow("Invalid plugin package");
    },
  );
  it("passes a package as one argv value and retains the isolated database environment", async () => {
    const { dispose } = setup();
    const result = await manageOpenCode2Plugins({
      env: { kind: "native" },
      action: "install",
      target: "@vendor/goal",
    });
    expect(mocks.command).toHaveBeenCalledWith(
      expect.anything(),
      "/bin/provider",
      ["plugin", "add", "@vendor/goal"],
      expect.objectContaining({ env: { OPENCODE_DB: "opencode-v2.db" } }),
    );
    expect(result.packages).toHaveLength(1);
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("uses the acquired native API for updates without starting a separate background service", async () => {
    const { update, dispose } = setup();
    await manageOpenCode2Plugins({
      env: { kind: "native" },
      action: "update",
      target: "@vendor/goal",
    });
    expect(update).toHaveBeenCalledWith({ targets: ["@vendor/goal"] }, expect.anything());
    expect(mocks.command).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("does not report failed installs as successful and permits a later retry", async () => {
    setup();
    mocks.command.mockResolvedValueOnce({ ok: false, stdout: "", stderr: "failed" });
    await expect(
      manageOpenCode2Plugins({
        env: { kind: "native" },
        action: "install",
        target: "@vendor/goal",
      }),
    ).rejects.toThrow("could not update");
    expect(mocks.acquire).not.toHaveBeenCalled();
    await expect(
      manageOpenCode2Plugins({
        env: { kind: "native" },
        action: "install",
        target: "@vendor/goal",
      }),
    ).resolves.toHaveProperty("packages");
  });
  it("releases the server lease after inventory errors", async () => {
    const { list, dispose } = setup();
    list.mockRejectedValueOnce(new Error("offline"));
    await expect(
      manageOpenCode2Plugins({ env: { kind: "native" }, action: "list" }),
    ).rejects.toThrow("offline");
    expect(dispose).toHaveBeenCalledOnce();
  });
});

it("waits for the native watcher to remove a package before returning", async () => {
  const { list } = setup();
  list.mockResolvedValueOnce({ data: [plugin] }).mockResolvedValueOnce({ data: [] });
  const result = await manageOpenCode2Plugins({
    env: { kind: "native" },
    action: "remove",
    target: "@vendor/goal",
  });
  expect(result.packages).toEqual([]);
  expect(list).toHaveBeenCalledTimes(2);
});
