import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  mergeDevinMcpConfig,
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
  const root = Object.values(overlay.env)[0]!;
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

it("keeps remote servers on the tool-filter stdio relay even though native injection is proven", () => {
  // Corrected live evidence (devin 3000.11.3, tmp/devin/probe/results/):
  // native session/new injection DOES work — stdio entries and spec-exact
  // `{type:"http"|"sse", name, url, headers:[{name,value}]}` entries all
  // completed real tools/list + tools/call round trips inside prompt turns.
  // The overlay still serializes remote servers to the stdio relay for a
  // different reason: Poracode's per-server `disabledTools` filtering is
  // enforced by its stdio tool-filter proxy, and a natively injected remote
  // server would bypass it. Direct native injection must not be adopted per
  // server until that filter guarantee is re-established.
  const remote = (transport: {
    type: "http" | "sse";
    url: string;
    headers: Record<string, string>;
  }) => [{ id: "poracode", timeoutMs: 15000, name: "poracode", transport }];
  expect(() =>
    mergeDevinMcpConfig(
      '{"mcpServers":{}}',
      remote({ type: "http", url: "https://fixture.test/mcp", headers: {} }),
    ),
  ).toThrow("Devin session MCP requires a stdio relay");
  expect(() =>
    mergeDevinMcpConfig(
      '{"mcpServers":{}}',
      remote({ type: "sse", url: "https://fixture.test/sse", headers: {} }),
    ),
  ).toThrow("Devin session MCP requires a stdio relay");
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
    join(Object.values(overlay.env)[0]!, "devin", "cli", "sessions.db"),
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
  const overlayDir = overlay.env.XDG_CONFIG_HOME!;
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
