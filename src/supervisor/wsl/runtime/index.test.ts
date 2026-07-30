import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const batchWslCommandsAsyncMock = vi.hoisted(() =>
  vi.fn<(distro: string, commands: string[]) => Promise<{ ok: boolean; stdout: string }[]>>(),
);
const resolveWslHomeDirectoryMock = vi.hoisted(() =>
  vi.fn<(distro: string) => string | undefined>(),
);
const resolveWslHomeDirectoryAsyncMock = vi.hoisted(() =>
  vi.fn<(distro: string) => Promise<string | undefined>>(),
);
const execInWslMock = vi.hoisted(() =>
  vi.fn<(distro: string, cwd: string, command: string, args: string[]) => Promise<string>>(),
);
const getWslCommandMock = vi.hoisted(() => vi.fn<() => string>(() => "wsl.exe"));

vi.mock("../../agents/base", () => ({
  batchWslCommandsAsync: batchWslCommandsAsyncMock,
  execInWsl: execInWslMock,
  resolveWslHomeDirectory: resolveWslHomeDirectoryMock,
  resolveWslHomeDirectoryAsync: resolveWslHomeDirectoryAsyncMock,
  getWslCommand: getWslCommandMock,
}));

type RuntimeModule = typeof import("./index");

async function loadRuntime(): Promise<RuntimeModule> {
  vi.resetModules();
  return import("./index");
}

function setProbe(distro: string, ...callResponses: { ok: boolean; stdout: string }[][]): void {
  let calls = 0;
  batchWslCommandsAsyncMock.mockImplementation(async (d) => {
    if (d !== distro) throw new Error(`unexpected distro ${d}`);
    const result = callResponses[calls];
    if (!result) throw new Error(`no probe response queued for call ${calls}`);
    calls += 1;
    return result;
  });
}

beforeEach(() => {
  batchWslCommandsAsyncMock.mockReset();
  resolveWslHomeDirectoryMock.mockReset();
  resolveWslHomeDirectoryAsyncMock.mockReset();
  execInWslMock.mockReset();
  getWslCommandMock.mockReturnValue("wsl.exe");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probeUserNode", () => {
  it("returns absolute path + version when login shell finds node", async () => {
    setProbe("Ubuntu", [
      { ok: true, stdout: "/home/u/.nvm/versions/node/v22.4.0/bin/node" },
      { ok: true, stdout: "v22.4.0" },
    ]);
    const { probeUserNode } = await loadRuntime();

    expect(await probeUserNode("Ubuntu")).toEqual({
      nodePath: "/home/u/.nvm/versions/node/v22.4.0/bin/node",
      version: "22.4.0",
    });
  });

  it("returns null when no node is on PATH", async () => {
    setProbe("Ubuntu", [
      { ok: false, stdout: "" },
      { ok: false, stdout: "" },
    ]);
    const { probeUserNode } = await loadRuntime();

    expect(await probeUserNode("Ubuntu")).toBeNull();
  });

  it("returns null when path is not absolute", async () => {
    setProbe("Ubuntu", [
      { ok: true, stdout: "node" },
      { ok: true, stdout: "v22.4.0" },
    ]);
    const { probeUserNode } = await loadRuntime();

    expect(await probeUserNode("Ubuntu")).toBeNull();
  });

  it("returns null when version line is malformed", async () => {
    setProbe("Ubuntu", [
      { ok: true, stdout: "/usr/bin/node" },
      { ok: true, stdout: "garbage" },
    ]);
    const { probeUserNode } = await loadRuntime();

    expect(await probeUserNode("Ubuntu")).toBeNull();
  });
});

describe("resolveNodeForDistro", () => {
  it("returns user-installed node when probe finds version >= 22", async () => {
    setProbe("Ubuntu", [
      { ok: true, stdout: "/home/u/.nvm/versions/node/v22.4.0/bin/node" },
      { ok: true, stdout: "v22.4.0" },
    ]);
    const { resolveNodeForDistro } = await loadRuntime();

    expect(await resolveNodeForDistro("Ubuntu")).toMatchObject({
      nodePath: "/home/u/.nvm/versions/node/v22.4.0/bin/node",
      nodeVersion: "22.4.0",
      source: "user-installed",
    });
  });

  it("emits probe-start, probe-result, and ready in order", async () => {
    setProbe("Ubuntu", [
      { ok: true, stdout: "/home/u/.nvm/versions/node/v22.4.0/bin/node" },
      { ok: true, stdout: "v22.4.0" },
    ]);
    const { resolveNodeForDistro } = await loadRuntime();

    const events: string[] = [];
    await resolveNodeForDistro("Ubuntu", { onProgress: (e) => events.push(e.kind) });

    expect(events).toEqual(["probe-start", "probe-result", "ready"]);
  });

  it("caches the resolution and skips re-probing on the second call", async () => {
    setProbe("Ubuntu", [
      { ok: true, stdout: "/home/u/.nvm/versions/node/v22.4.0/bin/node" },
      { ok: true, stdout: "v22.4.0" },
    ]);
    const { resolveNodeForDistro } = await loadRuntime();

    await resolveNodeForDistro("Ubuntu");
    await resolveNodeForDistro("Ubuntu");

    expect(batchWslCommandsAsyncMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a user-installed node that meets a consumer semver floor", async () => {
    setProbe("Ubuntu", [
      { ok: true, stdout: "/home/u/.nvm/versions/node/v22.13.0/bin/node" },
      { ok: true, stdout: "v22.13.0" },
    ]);
    const { resolveNodeForDistro } = await loadRuntime();

    await expect(
      resolveNodeForDistro("Ubuntu", { minimumVersion: "22.13.0" }),
    ).resolves.toMatchObject({
      nodePath: "/home/u/.nvm/versions/node/v22.13.0/bin/node",
      nodeVersion: "22.13.0",
      source: "user-installed",
    });
  });

  it("falls back to managed node when the user node is below a consumer semver floor", async () => {
    resolveWslHomeDirectoryMock.mockReturnValue("/home/u");
    resolveWslHomeDirectoryAsyncMock.mockResolvedValue("/home/u");
    setProbe(
      "Ubuntu",
      [
        { ok: true, stdout: "/home/u/.nvm/versions/node/v22.12.9/bin/node" },
        { ok: true, stdout: "v22.12.9" },
      ],
      [{ ok: true, stdout: "x86_64" }],
    );
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
    const { resolveNodeForDistro } = await loadRuntime();

    const events: string[] = [];
    await expect(
      resolveNodeForDistro("Ubuntu", {
        minimumVersion: "22.13.0",
        onProgress: (event) =>
          events.push(
            event.kind === "probe-result" ? `${event.kind}:${event.resolved}` : event.kind,
          ),
      }),
    ).rejects.toThrow("network down");
    expect(events).toContain("probe-result:too-old");
  });

  it("does not reuse a cached user node that is below a later stricter floor", async () => {
    resolveWslHomeDirectoryMock.mockReturnValue("/home/u");
    resolveWslHomeDirectoryAsyncMock.mockResolvedValue("/home/u");
    setProbe(
      "Ubuntu",
      [
        { ok: true, stdout: "/home/u/.nvm/versions/node/v22.4.0/bin/node" },
        { ok: true, stdout: "v22.4.0" },
      ],
      [
        { ok: true, stdout: "/home/u/.nvm/versions/node/v22.4.0/bin/node" },
        { ok: true, stdout: "v22.4.0" },
      ],
      [{ ok: true, stdout: "x86_64" }],
    );
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
    const { resolveNodeForDistro } = await loadRuntime();

    await expect(resolveNodeForDistro("Ubuntu")).resolves.toMatchObject({
      nodeVersion: "22.4.0",
    });
    await expect(resolveNodeForDistro("Ubuntu", { minimumVersion: "22.13.0" })).rejects.toThrow(
      "network down",
    );
    expect(batchWslCommandsAsyncMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a malformed consumer semver floor before probing", async () => {
    const { resolveNodeForDistro } = await loadRuntime();

    await expect(resolveNodeForDistro("Ubuntu", { minimumVersion: "twenty-two" })).rejects.toThrow(
      /invalid minimum Node version/,
    );
    expect(batchWslCommandsAsyncMock).not.toHaveBeenCalled();
  });

  it("fails before downloading when the requested floor exceeds the managed runtime", async () => {
    setProbe("Ubuntu", [
      { ok: false, stdout: "" },
      { ok: false, stdout: "" },
    ]);
    const { resolveNodeForDistro, PORACODE_PINNED_NODE_VERSION } = await loadRuntime();

    await expect(resolveNodeForDistro("Ubuntu", { minimumVersion: "23.0.0" })).rejects.toThrow(
      `Poracode-managed Node ${PORACODE_PINNED_NODE_VERSION} does not satisfy the requested minimum 23.0.0.`,
    );
  });

  it("falls back to install when probed node is too old", async () => {
    resolveWslHomeDirectoryMock.mockReturnValue("/home/u");
    resolveWslHomeDirectoryAsyncMock.mockResolvedValue("/home/u");
    setProbe(
      "Ubuntu",
      [
        { ok: true, stdout: "/usr/bin/node" },
        { ok: true, stdout: "v18.20.0" },
      ],
      [{ ok: true, stdout: "x86_64" }],
    );
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
    const { resolveNodeForDistro } = await loadRuntime();

    await expect(resolveNodeForDistro("Ubuntu")).rejects.toThrow("network down");
  });

  it("falls back to install when no node is found", async () => {
    resolveWslHomeDirectoryMock.mockReturnValue("/home/u");
    resolveWslHomeDirectoryAsyncMock.mockResolvedValue("/home/u");
    setProbe(
      "Ubuntu",
      [
        { ok: false, stdout: "" },
        { ok: false, stdout: "" },
      ],
      [{ ok: true, stdout: "x86_64" }],
    );
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
    const { resolveNodeForDistro } = await loadRuntime();

    await expect(resolveNodeForDistro("Ubuntu")).rejects.toThrow("network down");
  });
});

describe("installRuntimeIntoDistro rejection paths", () => {
  it("rejects when arch is unrecognised", async () => {
    resolveWslHomeDirectoryMock.mockReturnValue("/home/u");
    resolveWslHomeDirectoryAsyncMock.mockResolvedValue("/home/u");
    setProbe("Ubuntu", [{ ok: true, stdout: "ppc64le" }]);
    const { installRuntimeIntoDistro } = await loadRuntime();

    await expect(installRuntimeIntoDistro("Ubuntu")).rejects.toThrow(
      /could not detect architecture/,
    );
  });

  it("rejects when WSL home cannot be resolved", async () => {
    resolveWslHomeDirectoryMock.mockReturnValue(undefined);
    resolveWslHomeDirectoryAsyncMock.mockResolvedValue(undefined);
    setProbe("Ubuntu", [{ ok: true, stdout: "x86_64" }]);
    const { installRuntimeIntoDistro } = await loadRuntime();

    await expect(installRuntimeIntoDistro("Ubuntu")).rejects.toThrow(/could not resolve \$HOME/);
  });
});
