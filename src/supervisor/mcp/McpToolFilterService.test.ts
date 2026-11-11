import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ResolvedMcpServer } from "@/shared/contracts";
import { prepareMcpToolFilters } from "./McpToolFilterService";

const wslMocks = vi.hoisted(() => ({
  resolveNodeForDistro: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    nodePath: "/opt/node/bin/node",
  })),
  resolveDistroArch: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => "x64"),
  markDistroBinaryExecutable: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
  deployFilesToWslTempBase: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    home: "/home/u",
    linuxBaseDir: "/home/u/.poracode/poracode-mcp-filter-test",
  })),
}));

vi.mock("../wsl/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../wsl/runtime")>()),
  resolveNodeForDistro: wslMocks.resolveNodeForDistro,
  resolveDistroArch: wslMocks.resolveDistroArch,
  markDistroBinaryExecutable: wslMocks.markDistroBinaryExecutable,
}));
vi.mock("../wsl/wslDeploy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../wsl/wslDeploy")>()),
  deployFilesToWslTempBase: wslMocks.deployFilesToWslTempBase,
}));
import {
  MCP_FILTER_CONFIG_ENV,
  MCP_FILTER_CONFIG_V1_ENV,
  MCP_FILTER_CONFIG_V2_ENV,
  MCP_HTTP_RELAY_CONFIG_ENV,
  MCP_STDIO_CONFIG_ENV,
  encodeMcpHttpRelayConfig,
  readMcpHttpRelayConfig,
  readMcpToolFilterConfig,
} from "./mcpToolFilterConfig";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  wslMocks.resolveNodeForDistro.mockClear();
  wslMocks.resolveDistroArch.mockReset();
  wslMocks.resolveDistroArch.mockResolvedValue("x64");
  wslMocks.markDistroBinaryExecutable.mockReset();
  wslMocks.markDistroBinaryExecutable.mockResolvedValue(true);
  wslMocks.deployFilesToWslTempBase.mockClear();
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
const server: McpServer = {
  id: "fixture",
  name: "fixture",
  description: "",
  enabled: true,
  timeoutMs: 1000,
  transport: {
    type: "stdio",
    command: "node",
    args: ["relative.mjs"],
    cwd: "/plugin",
    env: { FIXTURE: "private" },
  },
};

describe("MCP launch transport compatibility", () => {
  it("reads configurations written by the previous unversioned helper", () => {
    const config = { server, disabledTools: ["restricted"] };
    const encoded = Buffer.from(JSON.stringify(config)).toString("base64url");
    expect(readMcpToolFilterConfig({ [MCP_FILTER_CONFIG_ENV]: encoded })).toEqual(config);
    expect(() =>
      readMcpToolFilterConfig({
        [MCP_FILTER_CONFIG_ENV]: encoded,
        [MCP_FILTER_CONFIG_V1_ENV]: Buffer.from(JSON.stringify({ version: 2, ...config })).toString(
          "base64url",
        ),
      }),
    ).toThrow("Unsupported MCP filter configuration version");
  });

  it("wraps external MCPs in a failure-isolating helper without changing upstream configuration", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-mcp-test-"));
    roots.push(root);
    writeFileSync(join(root, "mcp-filter.mjs"), "");
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
    const [wrapped] = await prepareMcpToolFilters(
      [server],
      { kind: "posix", path: "/project" },
      { isolateConnectionFailures: true },
    );
    if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
    expect(wrapped!.transport.args).toEqual([join(root, "mcp-filter.mjs")]);
    expect(wrapped!.transport.env[MCP_FILTER_CONFIG_ENV]).toBeUndefined();
    expect(readMcpToolFilterConfig(wrapped!.transport.env)).toEqual({
      version: 1,
      isolateConnectionFailures: true,
      server,
      disabledTools: [],
    });
    expect(wrapped!.transport.args.join(" ")).not.toContain("private");
  });

  it("preserves native transports unless filtering or cwd emulation is needed", async () => {
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", "/missing");
    expect(await prepareMcpToolFilters([server], { kind: "posix", path: "/project" })).toEqual([
      server,
    ]);
    await expect(
      prepareMcpToolFilters([server], { kind: "posix", path: "/project" }, { proxyStdioCwd: true }),
    ).rejects.toThrow("unavailable");
  });
  it("preserves the original cwd, environment, and timeout inside the proxy config", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-mcp-test-"));
    roots.push(root);
    writeFileSync(join(root, "mcp-stdio.mjs"), "");
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
    const [wrapped] = await prepareMcpToolFilters(
      [server],
      { kind: "posix", path: "/project" },
      { proxyStdioCwd: true },
    );
    expect(wrapped!.transport.type).toBe("stdio");
    if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
    expect(wrapped!.transport.args).toEqual([join(root, "mcp-stdio.mjs")]);
    const config = JSON.parse(
      Buffer.from(wrapped!.transport.env.PORACODE_MCP_STDIO_CONFIG!, "base64url").toString("utf8"),
    );
    expect(config).toEqual({ version: 1, server });
    expect(wrapped!.transport.args.join(" ")).not.toContain("private");
  });
});

it("versions schema-normalizing helpers while retaining prior helper configurations", async () => {
  const root = mkdtempSync(join(tmpdir(), "poracode-mcp-test-"));
  roots.push(root);
  writeFileSync(join(root, "mcp-filter.mjs"), "");
  vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
  const [wrapped] = await prepareMcpToolFilters(
    [server],
    { kind: "posix", path: "/project" },
    { omitInvalidSchemaPatterns: true, isolateConnectionFailures: true },
  );
  if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
  const env = wrapped!.transport.env;
  expect(env[MCP_FILTER_CONFIG_ENV]).toBeUndefined();
  expect(env[MCP_FILTER_CONFIG_V1_ENV]).toBeUndefined();
  expect(env[MCP_FILTER_CONFIG_V2_ENV]).toBeDefined();
  expect(readMcpToolFilterConfig(env)).toEqual({
    version: 2,
    omitInvalidSchemaPatterns: true,
    isolateConnectionFailures: true,
    server,
    disabledTools: [],
  });
  const previous = { version: 1, server, disabledTools: [], isolateConnectionFailures: true };
  expect(
    readMcpToolFilterConfig({
      [MCP_FILTER_CONFIG_V1_ENV]: Buffer.from(JSON.stringify(previous)).toString("base64url"),
    }),
  ).toEqual(previous);
  expect(() =>
    readMcpToolFilterConfig({
      [MCP_FILTER_CONFIG_V2_ENV]: Buffer.from(JSON.stringify({ ...previous, version: 3 })).toString(
        "base64url",
      ),
    }),
  ).toThrow("Unsupported MCP filter configuration version");
});

it.each([false, true])(
  "retains stdio environment semantics when adding schema proxying, prior filtering %s",
  async (filtered) => {
    const root = mkdtempSync(join(tmpdir(), "poracode-mcp-test-"));
    roots.push(root);
    writeFileSync(join(root, "mcp-filter.mjs"), "");
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
    const [wrapped] = await prepareMcpToolFilters(
      [{ ...server, disabledTools: filtered ? ["restricted"] : [] }],
      { kind: "posix", path: "/project" },
      { omitInvalidSchemaPatterns: true, proxyStdioCwd: true },
    );
    if (wrapped!.transport.type !== "stdio") throw Error("expected stdio");
    const config = readMcpToolFilterConfig(wrapped!.transport.env);
    expect(config.schemaOnly).toBe(filtered ? undefined : true);
    for (const [key, value] of Object.entries(
      server.transport.type === "stdio" ? server.transport.env : {},
    )) {
      expect(wrapped!.transport.env[key]).toBe(filtered ? undefined : value);
    }
    expect(config.server.transport).toEqual(server.transport);
  },
);

it.each(["stdio", "http"] as const)(
  "uses protocol-preserving normalization for previously direct %s servers",
  async (type) => {
    const root = mkdtempSync(join(tmpdir(), "poracode-mcp-test-"));
    roots.push(root);
    writeFileSync(join(root, "mcp-filter.mjs"), "");
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
    const input: McpServer =
      type === "stdio"
        ? server
        : { ...server, transport: { type: "http", url: "https://example.test/mcp", headers: {} } };
    const [wrapped] = await prepareMcpToolFilters(
      [input],
      { kind: "posix", path: "/project" },
      { omitInvalidSchemaPatterns: true },
    );
    if (wrapped!.transport.type !== "stdio") throw Error("expected stdio");
    expect(readMcpToolFilterConfig(wrapped!.transport.env).schemaOnly).toBe(true);
  },
);

describe("host endpoint relays", () => {
  const route = {
    type: "http" as const,
    url: "http://127.0.0.1:9300/route-1/mcp",
    headers: { Authorization: "Bearer route-secret" },
  };
  const endpoint: ResolvedMcpServer = {
    id: "sentry",
    name: "sentry",
    timeoutMs: 45_000,
    disabledTools: ["delete_project"],
    transport: route,
    directTransport: route,
  };
  const helpersRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-mcp-test-"));
    roots.push(root);
    for (const name of ["mcp-relay.mjs", "mcp-filter.mjs"]) writeFileSync(join(root, name), "");
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
    return root;
  };

  it("relays host endpoints through the SDK-free helper and keeps the direct transport", async () => {
    const root = helpersRoot();
    const [wrapped] = await prepareMcpToolFilters(
      [endpoint],
      { kind: "posix", path: "/project" },
      { remoteViaStdio: true },
    );
    if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
    expect(wrapped!.transport.args).toEqual([join(root, "mcp-relay.mjs")]);
    expect(wrapped!.directTransport).toEqual(route);
    expect(wrapped!.disabledTools).toEqual(["delete_project"]);
    expect(readMcpHttpRelayConfig(wrapped!.transport.env)).toEqual({
      version: 1,
      url: route.url,
      headers: route.headers,
      timeoutMs: 45_000,
      disabledTools: ["delete_project"],
    });
    expect(wrapped!.transport.args.join(" ")).not.toContain("route-secret");
  });

  it("does not relay host endpoints when only their tool policy is set", async () => {
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", "/missing");
    expect(await prepareMcpToolFilters([endpoint], { kind: "posix", path: "/project" })).toEqual([
      endpoint,
    ]);
  });

  it("keeps the failure-isolating proxy, whose diagnostics a direct connection matches", async () => {
    const root = helpersRoot();
    const [wrapped] = await prepareMcpToolFilters(
      [endpoint],
      { kind: "posix", path: "/project" },
      { remoteViaStdio: true, isolateConnectionFailures: true },
    );
    if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
    expect(wrapped!.transport.args).toEqual([join(root, "mcp-filter.mjs")]);
    expect(wrapped!.directTransport).toEqual(route);
  });

  it("never offers a direct connection that would skip schema normalization", async () => {
    const root = helpersRoot();
    const [wrapped] = await prepareMcpToolFilters(
      [endpoint],
      { kind: "posix", path: "/project" },
      { remoteViaStdio: true, omitInvalidSchemaPatterns: true },
    );
    if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
    expect(wrapped!.transport.args).toEqual([join(root, "mcp-filter.mjs")]);
    expect(wrapped!.directTransport).toBeUndefined();
  });

  it("does not wrap a relayed server again for a second launch pass", async () => {
    helpersRoot();
    const location = { kind: "posix" as const, path: "/project" };
    const external: ResolvedMcpServer = {
      id: "remote",
      name: "remote",
      timeoutMs: 15_000,
      disabledTools: ["restricted"],
      transport: { type: "http", url: "https://example.test/mcp", headers: {} },
    };
    const first = await prepareMcpToolFilters([endpoint, external], location, {
      remoteViaStdio: true,
    });
    const second = await prepareMcpToolFilters(first, location, { remoteViaStdio: true });
    expect(second).toEqual(first);
  });

  describe("native relay", () => {
    const nativeBinary = (root: string, helperVersion?: string) => {
      const id =
        process.platform === "darwin"
          ? "darwin-universal"
          : process.platform === "win32"
            ? `win32-${process.arch}`
            : "linux-x64";
      const dir = join(root, "mcp-relay", id);
      mkdirSync(dir, { recursive: true });
      const path = join(
        dir,
        process.platform === "win32" ? "poracode-mcp-relay.exe" : "poracode-mcp-relay",
      );
      writeFileSync(path, "");
      if (helperVersion) {
        writeFileSync(
          join(root, "mcp-relay", "manifest.json"),
          JSON.stringify({ helper: "poracode-mcp-relay", helperVersion, relayConfigVersion: 1 }),
        );
      }
      return path;
    };

    const wslLinuxBinary = (root: string, helperVersion = "0.2.0") => {
      const dir = join(root, "mcp-relay", "linux-x64");
      mkdirSync(dir, { recursive: true });
      const path = join(dir, "poracode-mcp-relay");
      writeFileSync(path, "");
      writeFileSync(
        join(root, "mcp-relay", "manifest.json"),
        JSON.stringify({ helper: "poracode-mcp-relay", helperVersion, relayConfigVersion: 1 }),
      );
      return path;
    };

    it("launches the staged native binary for local http endpoints", async () => {
      const root = helpersRoot();
      const binary = nativeBinary(root);
      const [wrapped] = await prepareMcpToolFilters(
        [endpoint],
        { kind: "posix", path: "/project" },
        { remoteViaStdio: true },
      );
      if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(wrapped!.transport.command).toBe(binary);
      expect(wrapped!.transport.args).toEqual([]);
      expect(wrapped!.transport.cwd).toBe("/project");
      expect(wrapped!.transport.env).toEqual({
        [MCP_HTTP_RELAY_CONFIG_ENV]: expect.any(String),
      });
      expect(wrapped!.transport.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(readMcpHttpRelayConfig(wrapped!.transport.env).url).toBe(route.url);
      expect(wrapped!.directTransport).toEqual(route);
    });

    it("uses the 0.2.0 native binary for stdio cwd, schema-only, and filtering while keeping https/sse/isolation on JS", async () => {
      const root = helpersRoot();
      writeFileSync(join(root, "mcp-stdio.mjs"), "");
      const binary = nativeBinary(root, "0.2.0");
      const location = { kind: "posix" as const, path: "/project" };

      const [stdioCwd] = await prepareMcpToolFilters([server], location, { proxyStdioCwd: true });
      if (stdioCwd!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(stdioCwd!.transport.command).toBe(binary);
      expect(stdioCwd!.transport.args).toEqual([]);
      expect(stdioCwd!.transport.env[MCP_STDIO_CONFIG_ENV]).toEqual(expect.any(String));

      const [schemaOnly] = await prepareMcpToolFilters([server], location, {
        omitInvalidSchemaPatterns: true,
        proxyStdioCwd: true,
      });
      if (schemaOnly!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(schemaOnly!.transport.command).toBe(binary);
      expect(schemaOnly!.transport.env.FIXTURE).toBe("private");
      expect(readMcpToolFilterConfig(schemaOnly!.transport.env).schemaOnly).toBe(true);

      const [filteredStdio, filteredHttp, httpsServer, sseServer] = await prepareMcpToolFilters(
        [
          { ...server, disabledTools: ["restricted"] },
          {
            ...server,
            disabledTools: ["restricted"],
            transport: { type: "http", url: "http://127.0.0.1:8123/mcp", headers: {} },
          },
          {
            ...server,
            disabledTools: ["restricted"],
            transport: { type: "http", url: "https://example.test/mcp", headers: {} },
          },
          {
            ...server,
            disabledTools: ["restricted"],
            transport: { type: "sse", url: "http://127.0.0.1:8123/sse", headers: {} },
          },
        ],
        location,
        { remoteViaStdio: true },
      );
      if (
        filteredStdio!.transport.type !== "stdio" ||
        filteredHttp!.transport.type !== "stdio" ||
        httpsServer!.transport.type !== "stdio" ||
        sseServer!.transport.type !== "stdio"
      ) {
        throw new Error("expected stdio");
      }
      expect(filteredStdio!.transport.command).toBe(binary);
      expect(filteredStdio!.transport.env.FIXTURE).toBeUndefined();
      expect(filteredHttp!.transport.command).toBe(binary);
      expect(httpsServer!.transport.args).toEqual([join(root, "mcp-filter.mjs")]);
      expect(sseServer!.transport.args).toEqual([join(root, "mcp-filter.mjs")]);

      const [isolated] = await prepareMcpToolFilters([server], location, {
        isolateConnectionFailures: true,
      });
      if (isolated!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(isolated!.transport.args).toEqual([join(root, "mcp-filter.mjs")]);
    });

    it("falls back to JS for stdio and filter modes when an older 0.1.0 relay binary is staged", async () => {
      const root = helpersRoot();
      writeFileSync(join(root, "mcp-stdio.mjs"), "");
      const binary = nativeBinary(root, "0.1.0");
      const location = { kind: "posix" as const, path: "/project" };

      const [httpRelay] = await prepareMcpToolFilters([endpoint], location, {
        remoteViaStdio: true,
      });
      const [stdioCwd] = await prepareMcpToolFilters([server], location, { proxyStdioCwd: true });
      const [filtered] = await prepareMcpToolFilters(
        [{ ...server, disabledTools: ["restricted"] }],
        location,
      );
      if (
        httpRelay!.transport.type !== "stdio" ||
        stdioCwd!.transport.type !== "stdio" ||
        filtered!.transport.type !== "stdio"
      ) {
        throw new Error("expected stdio");
      }
      expect(httpRelay!.transport.command).toBe(binary);
      expect(stdioCwd!.transport.args).toEqual([join(root, "mcp-stdio.mjs")]);
      expect(filtered!.transport.args).toEqual([join(root, "mcp-filter.mjs")]);
    });

    it("falls back to the JavaScript relay when the binary is missing or the URL is https", async () => {
      const root = helpersRoot();
      const httpsEndpoint: ResolvedMcpServer = {
        ...endpoint,
        transport: { type: "http", url: "https://example.test/mcp", headers: {} },
        directTransport: { type: "http", url: "https://example.test/mcp", headers: {} },
      };
      nativeBinary(root);
      const [httpsWrapped] = await prepareMcpToolFilters(
        [httpsEndpoint],
        { kind: "posix", path: "/project" },
        { remoteViaStdio: true },
      );
      if (httpsWrapped!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(httpsWrapped!.transport.args).toEqual([join(root, "mcp-relay.mjs")]);
      const missing = helpersRoot();
      const [jsWrapped] = await prepareMcpToolFilters(
        [endpoint],
        { kind: "posix", path: "/project" },
        { remoteViaStdio: true },
      );
      expect(missing).not.toBe(root);
      if (jsWrapped!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(jsWrapped!.transport.args).toEqual([join(missing, "mcp-relay.mjs")]);
    });

    it("deploys and executes the static linux-x64 binary inside x64 WSL without resolving Node", async () => {
      const root = helpersRoot();
      wslLinuxBinary(root, "0.2.0");
      const wslLocation = {
        kind: "wsl" as const,
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl$\\Ubuntu\\repo",
      };
      const [relayedEndpoint, filteredServer] = await prepareMcpToolFilters(
        [endpoint, { ...server, disabledTools: ["restricted"] }],
        wslLocation,
        { remoteViaStdio: true },
      );
      if (
        relayedEndpoint!.transport.type !== "stdio" ||
        filteredServer!.transport.type !== "stdio"
      ) {
        throw new Error("expected stdio");
      }
      const expectedPath =
        "/home/u/.poracode/poracode-mcp-filter-test/mcp-filter/poracode-mcp-relay";
      expect(relayedEndpoint!.transport.command).toBe(expectedPath);
      expect(relayedEndpoint!.transport.args).toEqual([]);
      expect(relayedEndpoint!.transport.cwd).toBe("/repo");
      expect(filteredServer!.transport.command).toBe(expectedPath);
      expect(wslMocks.markDistroBinaryExecutable).toHaveBeenCalledWith("Ubuntu", expectedPath);
      expect(wslMocks.resolveNodeForDistro).not.toHaveBeenCalled();
    });

    it("falls back to the deployed JavaScript helper in WSL on arm64, missing linux-x64 binary, or chmod failure", async () => {
      const wslLocation = {
        kind: "wsl" as const,
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl$\\Ubuntu\\repo",
      };

      // Missing linux-x64 binary.
      helpersRoot();
      const [missingBin] = await prepareMcpToolFilters([endpoint], wslLocation, {
        remoteViaStdio: true,
      });
      if (missingBin!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(missingBin!.transport.command).toBe("/opt/node/bin/node");
      expect(missingBin!.transport.args).toEqual([
        "/home/u/.poracode/poracode-mcp-filter-test/mcp-filter/mcp-relay.mjs",
      ]);

      // arm64 WSL distro.
      const armRoot = helpersRoot();
      wslLinuxBinary(armRoot, "0.2.0");
      wslMocks.resolveDistroArch.mockResolvedValueOnce("arm64");
      const [armWrapped] = await prepareMcpToolFilters([endpoint], wslLocation, {
        remoteViaStdio: true,
      });
      if (armWrapped!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(armWrapped!.transport.command).toBe("/opt/node/bin/node");

      // chmod / executable check failure.
      const chmodFailRoot = helpersRoot();
      wslLinuxBinary(chmodFailRoot, "0.2.0");
      wslMocks.markDistroBinaryExecutable.mockResolvedValueOnce(false);
      const [chmodFallback] = await prepareMcpToolFilters(
        [{ ...server, disabledTools: ["restricted"] }],
        wslLocation,
      );
      if (chmodFallback!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(chmodFallback!.transport.command).toBe("/opt/node/bin/node");
      expect(chmodFallback!.transport.args).toEqual([
        "/home/u/.poracode/poracode-mcp-filter-test/mcp-filter/mcp-filter.mjs",
      ]);
    });

    it("does not re-wrap a native relay entry on a second pass", async () => {
      const root = helpersRoot();
      nativeBinary(root);
      const location = { kind: "posix" as const, path: "/project" };
      const first = await prepareMcpToolFilters([endpoint], location, {
        remoteViaStdio: true,
      });
      const second = await prepareMcpToolFilters(first, location, { remoteViaStdio: true });
      expect(second).toEqual(first);
    });
  });

  it("rejects relay envelopes from another version", () => {
    const encoded = encodeMcpHttpRelayConfig({
      url: route.url,
      headers: {},
      timeoutMs: 1_000,
      disabledTools: [],
    });
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const reencode = (fields: Record<string, unknown>) => ({
      [MCP_HTTP_RELAY_CONFIG_ENV]: Buffer.from(JSON.stringify({ ...decoded, ...fields })).toString(
        "base64url",
      ),
    });
    expect(readMcpHttpRelayConfig({ [MCP_HTTP_RELAY_CONFIG_ENV]: encoded }).url).toBe(route.url);
    expect(() => readMcpHttpRelayConfig(reencode({ version: 2 }))).toThrow("Unsupported");
    expect(() => readMcpHttpRelayConfig(reencode({ url: "file:///etc/passwd" }))).toThrow(
      "Unsupported",
    );
    // Non-string header values fail closed like the native relay's parser.
    expect(() => readMcpHttpRelayConfig(reencode({ headers: { "x-a": 5 } }))).toThrow(
      "Unsupported",
    );
    expect(() => readMcpHttpRelayConfig(reencode({ headers: ["x-a"] }))).toThrow("Unsupported");
    expect(() => readMcpHttpRelayConfig({})).toThrow("Missing");
  });

  it("still wraps a user stdio server that merely carries a helper env key", async () => {
    const root = helpersRoot();
    const userServer: ResolvedMcpServer = {
      id: "user",
      name: "user",
      timeoutMs: 15_000,
      disabledTools: ["restricted"],
      transport: {
        type: "stdio",
        command: "user-mcp",
        args: [],
        env: { PORACODE_MCP_STDIO_CONFIG: "user-supplied" },
      },
    };
    const [wrapped] = await prepareMcpToolFilters([userServer], {
      kind: "posix",
      path: "/project",
    });
    if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
    expect(wrapped!.transport.args).toEqual([join(root, "mcp-filter.mjs")]);
  });
});

it("refuses schema-only envelopes that would bypass filtering or failure isolation", () => {
  const encode = (fields: Record<string, unknown>) => ({
    [MCP_FILTER_CONFIG_V2_ENV]: Buffer.from(
      JSON.stringify({ version: 2, server, disabledTools: [], schemaOnly: true, ...fields }),
    ).toString("base64url"),
  });
  expect(() => readMcpToolFilterConfig(encode({ disabledTools: ["blocked"] }))).toThrow(
    "cannot filter tools",
  );
  expect(() => readMcpToolFilterConfig(encode({ isolateConnectionFailures: true }))).toThrow(
    "cannot filter tools",
  );
});
