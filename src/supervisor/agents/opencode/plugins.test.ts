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
  resolveOpenCodeBinary: mocks.resolve,
}));
vi.mock("./client", () => ({ acquireOpenCodeServer: mocks.acquire }));
vi.mock("./terminalPluginConfig", () => ({ readOpenCodeTerminalPackages: mocks.terminal }));
import {
  manageOpenCodePlugins,
  openCodePluginPackages,
  validateOpenCodePluginTarget,
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
      },
    },
    dispose,
  });
  return { list, update, dispose };
}

describe("OpenCode native plugin manager", () => {
  it("normalizes package metadata without exposing local or built-in entries", () => {
    expect(openCodePluginPackages([plugin, { ...plugin, source: { type: "builtin" } }])).toEqual([
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
      expect(() => validateOpenCodePluginTarget(target)).toThrow("Invalid plugin package");
    },
  );
  it("passes a package as one argv value using the native database", async () => {
    const { dispose } = setup();
    const result = await manageOpenCodePlugins({
      env: { kind: "native" },
      action: "install",
      target: "@vendor/goal",
    });
    expect(mocks.command).toHaveBeenCalledWith(
      expect.anything(),
      "/bin/provider",
      ["plugin", "add", "@vendor/goal"],
      expect.objectContaining({ timeoutMs: 120_000 }),
    );
    expect(result.packages).toHaveLength(1);
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("uses the acquired native API for updates without starting a separate background service", async () => {
    const { update, dispose } = setup();
    await manageOpenCodePlugins({
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
      manageOpenCodePlugins({
        env: { kind: "native" },
        action: "install",
        target: "@vendor/goal",
      }),
    ).rejects.toThrow("could not update");
    expect(mocks.acquire).not.toHaveBeenCalled();
    await expect(
      manageOpenCodePlugins({
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
      manageOpenCodePlugins({ env: { kind: "native" }, action: "list" }),
    ).rejects.toThrow("offline");
    expect(dispose).toHaveBeenCalledOnce();
  });
});

it("waits for the native watcher to remove a package before returning", async () => {
  const { list } = setup();
  list
    .mockResolvedValueOnce({ data: [plugin] })
    .mockResolvedValueOnce({ data: [plugin] })
    .mockResolvedValueOnce({ data: [] });
  const result = await manageOpenCodePlugins({
    env: { kind: "native" },
    action: "remove",
    target: "@vendor/goal",
  });
  expect(result.packages).toEqual([]);
  expect(list).toHaveBeenCalledTimes(3);
});
