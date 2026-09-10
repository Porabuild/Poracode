import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { mergeDevinMcpConfig, prepareDevinMcpConfig } from "./mcpConfig";
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
