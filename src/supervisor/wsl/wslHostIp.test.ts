import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnSyncMock = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args?: readonly string[],
      options?: unknown,
    ) => { status: number | null; stdout?: string; stderr?: string }
  >(),
);
const readFileSyncMock = vi.hoisted(() =>
  vi.fn<(path: string, encoding: BufferEncoding) => string>(),
);

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: readFileSyncMock,
  };
});

import { __clearWslHostIpCache, resolveWslHostIp, rewriteUrlForWsl } from "./wslHostIp";

beforeEach(() => {
  __clearWslHostIpCache();
  spawnSyncMock.mockReset();
  readFileSyncMock.mockReset();
});

describe("resolveWslHostIp", () => {
  it("prefers the WSL default gateway over DNS tunneling resolv.conf", () => {
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: "default via 172.31.240.1 dev eth0 proto kernel\n",
    });
    readFileSyncMock.mockReturnValue("nameserver 10.255.255.254\n");

    expect(resolveWslHostIp("Ubuntu")).toBe("172.31.240.1");
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it("falls back to resolv.conf when the default route is unavailable", () => {
    spawnSyncMock.mockReturnValue({ status: 1, stdout: "", stderr: "missing ip" });
    readFileSyncMock.mockReturnValue("nameserver 172.22.16.1\n");

    expect(resolveWslHostIp("Ubuntu")).toBe("172.22.16.1");
  });

  it("rewrites loopback URLs for WSL projects", () => {
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: "default via 172.31.240.1 dev eth0 proto kernel\n",
    });

    expect(rewriteUrlForWsl("http://127.0.0.1:65093", "Ubuntu")).toBe("http://172.31.240.1:65093");
  });
});
