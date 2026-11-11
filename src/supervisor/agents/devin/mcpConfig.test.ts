import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  mergeDevinMcpConfig,
  planDevinMcpConfigForRoots,
  prepareDevinMcpConfig,
  prepareDevinMcpConfigForRoots,
} from "./mcpConfig";
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const servers = [
  {
    id: "poracode",
    timeoutMs: 15000,
    name: "poracode",
    transport: {
      type: "stdio" as const,
      command: "node",
      args: ["relay.js"],
      env: { TOKEN: "fixture-token" },
    },
  },
];
it("overlays the session catalog without modifying existing config or losing other apps", async () => {
  const original = await mkdtemp(join(tmpdir(), "devin-config-test-"));
  roots.push(original);
  vi.stubEnv(process.platform === "win32" ? "APPDATA" : "XDG_CONFIG_HOME", original);
  await mkdir(join(original, "devin"));
  await mkdir(join(original, "devin", "cli"));
  await writeFile(join(original, "devin", "cli", "sessions.db"), "persistent");
  await mkdir(join(original, "other-app"));
  await writeFile(join(original, "other-app", "settings.json"), "other");
  await writeFile(join(original, "devin", "config.json"), "original-settings");
  const existing = JSON.stringify({
    mcpServers: { personal: { command: "personal" } },
    version: 1,
  });
  await writeFile(join(original, "devin", "mcp_config.json"), existing);
  const overlay = await prepareDevinMcpConfig({ kind: "posix", path: original }, servers);
  const root = Object.values(overlay.env!)[0]!;
  expect(await readFile(join(root, "devin", "config.json"), "utf8")).toBe("original-settings");
  expect(await readFile(join(root, "other-app", "settings.json"), "utf8")).toBe("other");
  expect(JSON.parse(await readFile(join(root, "devin", "mcp_config.json"), "utf8"))).toMatchObject({
    version: 1,
    mcpServers: {
      personal: { command: "personal" },
      poracode: { command: "node", env: { TOKEN: "fixture-token" } },
    },
  });
  const privatePermissions =
    process.platform === "win32" || ((await stat(root)).mode & 0o777) === 0o700;
  expect(privatePermissions).toBe(true);
  await writeFile(join(root, "devin", "cli", "sessions.db"), "session-written");
  await overlay.cleanup();
  expect(await readFile(join(original, "devin", "cli", "sessions.db"), "utf8")).toBe(
    "session-written",
  );
  await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(original, "devin", "mcp_config.json"), "utf8")).toBe(existing);
});
it("rejects malformed existing catalogs rather than discarding user configuration", () => {
  expect(() => mergeDevinMcpConfig('{"mcpServers":[]}', servers)).toThrow(
    "Invalid Devin MCP server catalog",
  );
});

it("serializes hosted http servers in the proven disk shape and keeps stdio unchanged", () => {
  // devin 3000.12.28 (2026-11-08, tmp/devin-http-probe/): the disk remote
  // shape {url, transport:"http", headers?: map} completed real
  // tools/list + tools/call round trips inside a prompt turn.
  const httpServers = [
    {
      id: "poracode",
      timeoutMs: 15000,
      name: "poracode",
      transport: {
        type: "http" as const,
        url: "http://127.0.0.1:8080/mcp",
        headers: { Authorization: "Bearer fixture-token" },
      },
    },
    {
      id: "poracode-plain",
      timeoutMs: 15000,
      name: "poracode-plain",
      transport: { type: "http" as const, url: "http://127.0.0.1:8081/mcp", headers: {} },
    },
  ];
  expect(JSON.parse(mergeDevinMcpConfig('{"mcpServers":{}}', httpServers))).toMatchObject({
    mcpServers: {
      poracode: {
        url: "http://127.0.0.1:8080/mcp",
        transport: "http",
        headers: { Authorization: "Bearer fixture-token" },
      },
      "poracode-plain": { url: "http://127.0.0.1:8081/mcp", transport: "http" },
    },
  });
  const plain = JSON.parse(mergeDevinMcpConfig('{"mcpServers":{}}', httpServers)).mcpServers[
    "poracode-plain"
  ];
  expect(plain).not.toHaveProperty("headers");
  expect(JSON.parse(mergeDevinMcpConfig('{"mcpServers":{}}', servers))).toMatchObject({
    mcpServers: { poracode: { command: "node", env: { TOKEN: "fixture-token" } } },
  });
});

it("rejects sse transports: the disk SSE shape is documented but unproven", () => {
  expect(() =>
    mergeDevinMcpConfig('{"mcpServers":{}}', [
      {
        id: "poracode",
        timeoutMs: 15000,
        name: "poracode",
        transport: {
          type: "sse" as const,
          url: "https://fixture.test/sse",
          headers: {},
        },
      },
    ]),
  ).toThrow("Devin session MCP does not support the sse transport");
});

it("accepts the CLI's JSONC catalog format", () => {
  expect(
    JSON.parse(
      mergeDevinMcpConfig(
        '{ // user config\n "mcpServers": {"personal": {"command":"node",},},}',
        servers,
      ),
    ),
  ).toMatchObject({ mcpServers: { personal: { command: "node" }, poracode: { command: "node" } } });
});

it("keeps the first native session database outside the temporary overlay", async () => {
  const original = await mkdtemp(join(tmpdir(), "devin-first-session-"));
  roots.push(original);
  vi.stubEnv(process.platform === "win32" ? "APPDATA" : "XDG_CONFIG_HOME", original);
  const overlay = await prepareDevinMcpConfig({ kind: "posix", path: original }, servers);
  await writeFile(
    join(Object.values(overlay.env!)[0]!, "devin", "cli", "sessions.db"),
    "first session",
  );
  await overlay.cleanup();
  expect(await readFile(join(original, "devin", "cli", "sessions.db"), "utf8")).toBe(
    "first session",
  );
});

it("overlays a profile context's roots without touching them and cleans only the private overlay", async () => {
  // Profile context: an isolated account root (config + data siblings) plus a
  // private overlay parent. Nothing outside the overlay dir may be written.
  const accountRoot = await mkdtemp(join(tmpdir(), "devin-account-"));
  roots.push(accountRoot);
  const configRoot = join(accountRoot, "config");
  const overlayParent = join(accountRoot, "tmp");
  await mkdir(join(configRoot, "devin"), { recursive: true });
  await writeFile(join(configRoot, "devin", "mcp_config.json"), '{"mcpServers":{}}');
  await writeFile(join(configRoot, "devin", "config.json"), "account-settings");
  await mkdir(overlayParent);
  const overlay = await prepareDevinMcpConfigForRoots(
    { kind: "posix", path: accountRoot },
    { root: configRoot, variable: "XDG_CONFIG_HOME", overlayParent },
    servers,
  );
  const overlayDir = overlay.env!.XDG_CONFIG_HOME!;
  expect(overlayDir.startsWith(overlayParent)).toBe(true);
  // Resources inside the account config root are preserved through the overlay…
  expect(await readFile(join(overlayDir, "devin", "config.json"), "utf8")).toBe("account-settings");
  expect(
    JSON.parse(await readFile(join(overlayDir, "devin", "mcp_config.json"), "utf8")),
  ).toMatchObject({ mcpServers: { poracode: { command: "node" } } });
  // …the original root is never modified…
  expect(await readFile(join(configRoot, "devin", "mcp_config.json"), "utf8")).toBe(
    '{"mcpServers":{}}',
  );
  // …and cleanup removes only the private overlay dir.
  await overlay.cleanup();
  await expect(stat(overlayDir)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(join(overlayParent, "devin"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(configRoot, "devin", "config.json"), "utf8")).toBe("account-settings");
});

it("deletes same-named native catalog entries a per-session route owns", () => {
  // Shared-process overlays must not let a hosted route's name resolve to the
  // user's own disk entry inside the pooled agent.
  const merged = JSON.parse(
    mergeDevinMcpConfig(
      '{"mcpServers":{"browser":{"command":"native-browser"},"personal":{"command":"keep"}}}',
      servers,
      ["browser"],
    ),
  );
  expect(merged.mcpServers).not.toHaveProperty("browser");
  expect(merged.mcpServers.personal).toEqual({ command: "keep" });
  expect(merged.mcpServers.poracode).toBeDefined();
});

it("plans a shared-process overlay once and materializes the private root per process", async () => {
  const original = await mkdtemp(join(tmpdir(), "devin-plan-test-"));
  roots.push(original);
  const overlayParent = await mkdtemp(join(tmpdir(), "devin-plan-parent-"));
  roots.push(overlayParent);
  await mkdir(join(original, "devin"), { recursive: true });
  await writeFile(
    join(original, "devin", "mcp_config.json"),
    '{"mcpServers":{"browser":{"command":"native-browser"},"personal":{"command":"keep"}}}',
  );
  const plan = await planDevinMcpConfigForRoots(
    { root: original, variable: "XDG_CONFIG_HOME", overlayParent },
    servers,
    ["browser"],
  );
  // Planning reads+merges eagerly: each materialize() builds a fresh private
  // root carrying the already-merged catalog.
  const first = await plan.materialize();
  const second = await plan.materialize();
  const firstRoot = first.env?.XDG_CONFIG_HOME;
  const secondRoot = second.env?.XDG_CONFIG_HOME;
  expect(firstRoot).toBeDefined();
  expect(secondRoot).toBeDefined();
  expect(firstRoot).not.toBe(secondRoot);
  expect(firstRoot!.startsWith(overlayParent)).toBe(true);
  const merged = JSON.parse(await readFile(join(firstRoot!, "devin", "mcp_config.json"), "utf8"));
  expect(merged.mcpServers).not.toHaveProperty("browser");
  expect(merged.mcpServers.poracode).toBeDefined();
  // Identical plan inputs produce identical keys; different inputs differ.
  const samePlan = await planDevinMcpConfigForRoots(
    { root: original, variable: "XDG_CONFIG_HOME", overlayParent },
    servers,
    ["browser"],
  );
  expect(samePlan.key).toBe(plan.key);
  const differentPlan = await planDevinMcpConfigForRoots(
    { root: original, variable: "XDG_CONFIG_HOME", overlayParent },
    servers,
    ["browser", "personal"],
  );
  expect(differentPlan.key).not.toBe(plan.key);
  await first.cleanup();
  await second.cleanup();
});
