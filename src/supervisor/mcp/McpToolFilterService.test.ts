import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ResolvedMcpServer } from "@/shared/contracts";
import { prepareMcpToolFilters } from "./McpToolFilterService";

vi.mock("../wsl/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../wsl/runtime")>()),
  resolveNodeForDistro: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    nodePath: "/opt/node/bin/node",
  })),
}));
vi.mock("../wsl/wslDeploy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../wsl/wslDeploy")>()),
  deployFilesToWslTempBase: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    home: "/home/u",
    linuxBaseDir: "/home/u/.poracode/poracode-mcp-filter-test",
  })),
}));
import {
  MCP_FILTER_CONFIG_ENV,
  MCP_FILTER_CONFIG_V1_ENV,
  MCP_FILTER_CONFIG_V2_ENV,
  MCP_FILTER_CONFIG_V3_ENV,
  MCP_HTTP_RELAY_CONFIG_ENV,
  encodeMcpHttpRelayConfig,
  readMcpHttpRelayConfig,
  readMcpToolFilterConfig,
} from "./mcpToolFilterConfig";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
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

it("versions depth limits separately and continues to read v2 helper configurations", async () => {
  const root = mkdtempSync(join(tmpdir(), "poracode-mcp-test-"));
  roots.push(root);
  writeFileSync(join(root, "mcp-filter.mjs"), "");
  vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
  const [wrapped] = await prepareMcpToolFilters(
    [server],
    { kind: "posix", path: "/project" },
    { omitInvalidSchemaPatterns: true, maxSchemaDepth: 10 },
  );
  if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
  const env = wrapped!.transport.env;
  expect(env[MCP_FILTER_CONFIG_V2_ENV]).toBeUndefined();
  expect(readMcpToolFilterConfig(env)).toEqual({
    version: 3,
    omitInvalidSchemaPatterns: true,
    maxSchemaDepth: 10,
    schemaOnly: true,
    server,
    disabledTools: [],
  });
  const previous = { version: 2, server, disabledTools: [], omitInvalidSchemaPatterns: true };
  expect(
    readMcpToolFilterConfig({
      [MCP_FILTER_CONFIG_V2_ENV]: Buffer.from(JSON.stringify(previous)).toString("base64url"),
    }),
  ).toEqual(previous);
  expect(() =>
    readMcpToolFilterConfig({
      [MCP_FILTER_CONFIG_V3_ENV]: Buffer.from(
        JSON.stringify({ ...previous, version: 3, maxSchemaDepth: 0 }),
      ).toString("base64url"),
    }),
  ).toThrow("Unsupported MCP schema depth limit");
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
    const nativeBinary = (root: string) => {
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

    it("keeps WSL endpoints on the deployed JavaScript relay", async () => {
      const root = helpersRoot();
      nativeBinary(root);
      const [wrapped] = await prepareMcpToolFilters(
        [endpoint],
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl$\\Ubuntu\\repo",
        },
        { remoteViaStdio: true },
      );
      if (wrapped!.transport.type !== "stdio") throw new Error("expected stdio");
      expect(wrapped!.transport.command).toBe("/opt/node/bin/node");
      expect(wrapped!.transport.args).toEqual([
        "/home/u/.poracode/poracode-mcp-filter-test/mcp-filter/mcp-relay.mjs",
      ]);
      expect(wrapped!.transport.cwd).toBe("/repo");
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
