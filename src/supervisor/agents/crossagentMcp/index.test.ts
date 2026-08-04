import { describe, expect, it, vi } from "vitest";
import { resolveCrossagentMcpHttpConfigForLaunch, type CrossagentMcpHttpConfig } from "./index";
import type { WslHostAccess, WslHostAccessResolver } from "@/supervisor/wsl/hostAccess";

const NATIVE: CrossagentMcpHttpConfig = {
  url: "http://127.0.0.1:54321/mcp",
  token: "tok-abc",
  headers: { Authorization: "Bearer tok-abc" },
};

function fakeHostAccess(access: WslHostAccess | undefined): WslHostAccessResolver {
  return {
    resolveHostAccess: vi.fn<(distro: string) => Promise<WslHostAccess | undefined>>(
      async () => access,
    ),
  };
}

function gateway(ip: string): WslHostAccessResolver {
  return fakeHostAccess({ kind: "gateway", ip });
}

describe("resolveCrossagentMcpHttpConfigForLaunch", () => {
  it("returns undefined when the thread has no native config", async () => {
    expect(
      await resolveCrossagentMcpHttpConfigForLaunch(
        undefined,
        { kind: "posix" },
        gateway("172.20.0.1"),
      ),
    ).toBeUndefined();
  });

  it("passes a posix location's config through unchanged", async () => {
    const result = await resolveCrossagentMcpHttpConfigForLaunch(NATIVE, { kind: "posix" });
    expect(result).toBe(NATIVE);
  });

  it("passes a windows location's config through unchanged", async () => {
    const result = await resolveCrossagentMcpHttpConfigForLaunch(NATIVE, { kind: "windows" });
    expect(result).toBe(NATIVE);
  });

  it("does not invoke the host-access resolver for native locations", async () => {
    const resolver = gateway("172.20.0.1");
    await resolveCrossagentMcpHttpConfigForLaunch(NATIVE, { kind: "windows" }, resolver);
    expect(resolver.resolveHostAccess).not.toHaveBeenCalled();
  });

  it("rewrites the loopback host to the WSL gateway IP, preserving port/path/token", async () => {
    const resolver = gateway("172.20.0.1");
    const result = await resolveCrossagentMcpHttpConfigForLaunch(
      NATIVE,
      { kind: "wsl", distro: "Ubuntu" },
      resolver,
    );
    expect(resolver.resolveHostAccess).toHaveBeenCalledWith("Ubuntu");
    expect(result).toEqual({
      url: "http://172.20.0.1:54321/mcp",
      token: "tok-abc",
      headers: { Authorization: "Bearer tok-abc" },
    });
  });

  it("rewrites a `localhost` host too", async () => {
    const result = await resolveCrossagentMcpHttpConfigForLaunch(
      { ...NATIVE, url: "http://localhost:54321/mcp" },
      { kind: "wsl", distro: "Ubuntu" },
      gateway("10.0.0.5"),
    );
    expect(result?.url).toBe("http://10.0.0.5:54321/mcp");
  });

  it("passes the native config through unchanged for mirrored-mode WSL (loopback)", async () => {
    const result = await resolveCrossagentMcpHttpConfigForLaunch(
      NATIVE,
      { kind: "wsl", distro: "Ubuntu" },
      fakeHostAccess({ kind: "loopback" }),
    );
    expect(result).toBe(NATIVE);
  });

  it("accepts a full wsl ProjectLocation shape", async () => {
    const result = await resolveCrossagentMcpHttpConfigForLaunch(
      NATIVE,
      {
        kind: "wsl",
        distro: "Debian",
        linuxPath: "/home/me/proj",
        uncPath: "\\\\wsl.localhost\\Debian\\home\\me\\proj",
      },
      gateway("192.168.1.2"),
    );
    expect(result?.url).toBe("http://192.168.1.2:54321/mcp");
  });

  it("falls back to undefined for WSL when no host-access resolver is wired", async () => {
    const result = await resolveCrossagentMcpHttpConfigForLaunch(NATIVE, {
      kind: "wsl",
      distro: "Ubuntu",
    });
    expect(result).toBeUndefined();
  });

  it("falls back to undefined for WSL when host access can't be resolved", async () => {
    const result = await resolveCrossagentMcpHttpConfigForLaunch(
      NATIVE,
      { kind: "wsl", distro: "Ubuntu" },
      fakeHostAccess(undefined),
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined for WSL when the native URL is unparseable", async () => {
    const result = await resolveCrossagentMcpHttpConfigForLaunch(
      { ...NATIVE, url: "not a url" },
      { kind: "wsl", distro: "Ubuntu" },
      gateway("172.20.0.1"),
    );
    expect(result).toBeUndefined();
  });
});
