import { describe, expect, it } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";
import { directMcpProxyBypassEnv } from "./mcpProxyBypass";

const directServer = {
  id: "browser",
  name: "browser",
  timeoutMs: 30_000,
  transport: {
    type: "http" as const,
    url: "http://127.0.0.1:9300/route-1/mcp",
    headers: {},
  },
  directTransport: {
    type: "http" as const,
    url: "http://127.0.0.1:9300/route-1/mcp",
    headers: {},
  },
} as ResolvedMcpServer;

const relayedOnly = {
  id: "fs",
  name: "fs",
  timeoutMs: 30_000,
  transport: {
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "fs-mcp"],
    env: {},
  },
} as ResolvedMcpServer;

describe("directMcpProxyBypassEnv", () => {
  it("extends NO_PROXY and no_proxy with direct endpoint hostnames when a proxy variable exists", () => {
    const bypass = directMcpProxyBypassEnv({ HTTP_PROXY: "http://proxy.corp:8080", PATH: "/bin" }, [
      directServer,
    ]);
    expect(bypass).toEqual({ NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" });
  });

  it("returns undefined when no proxy variable is present", () => {
    const env = { PATH: "/bin", TERM: "xterm-256color" };
    expect(directMcpProxyBypassEnv(env, [directServer])).toBeUndefined();
  });

  it("preserves existing bypass entries and avoids duplicates", () => {
    const bypass = directMcpProxyBypassEnv(
      {
        http_proxy: "http://proxy.corp:8080",
        NO_PROXY: "internal.corp, 127.0.0.1",
        no_proxy: "internal.corp",
      },
      [directServer],
    );
    expect(bypass).toEqual({
      NO_PROXY: "internal.corp,127.0.0.1",
      no_proxy: "internal.corp,127.0.0.1",
    });
  });

  it("merges a Windows-style No_Proxy casing and blanks the stray variant", () => {
    const bypass = directMcpProxyBypassEnv(
      { HTTPS_PROXY: "http://proxy.corp:8080", No_Proxy: "internal.corp" },
      [directServer],
    );
    expect(bypass).toEqual({
      NO_PROXY: "internal.corp,127.0.0.1",
      no_proxy: "internal.corp,127.0.0.1",
      No_Proxy: "",
    });
  });

  it("covers lowercase proxy variables and https direct endpoints", () => {
    const bypass = directMcpProxyBypassEnv({ all_proxy: "socks5://proxy.corp:1080" }, [
      {
        ...directServer,
        transport: {
          type: "http" as const,
          url: "https://mcp.example.com/v1",
          headers: {},
        },
        directTransport: {
          type: "http" as const,
          url: "https://mcp.example.com/v1",
          headers: {},
        },
      } as ResolvedMcpServer,
    ]);
    expect(bypass).toEqual({ NO_PROXY: "mcp.example.com", no_proxy: "mcp.example.com" });
  });

  it("does not bypass a remote non-hosted server that only has a plain transport", () => {
    const remoteOnly = {
      ...relayedOnly,
      transport: {
        type: "http" as const,
        url: "https://mcp.example.com/v1",
        headers: {},
      },
    } as ResolvedMcpServer;
    const env = { HTTP_PROXY: "http://proxy.corp:8080" };
    expect(directMcpProxyBypassEnv(env, [remoteOnly])).toBeUndefined();
    expect(directMcpProxyBypassEnv(env, [relayedOnly, remoteOnly])).toBeUndefined();
  });

  it("leaves a wildcard bypass alone and ignores relayed-only servers", () => {
    expect(
      directMcpProxyBypassEnv({ HTTP_PROXY: "http://p:1", NO_PROXY: "*" }, [directServer]),
    ).toBeUndefined();
    expect(directMcpProxyBypassEnv({ HTTP_PROXY: "http://p:1" }, [relayedOnly])).toBeUndefined();
    expect(directMcpProxyBypassEnv({ HTTP_PROXY: "http://p:1" }, undefined)).toBeUndefined();
  });
});
