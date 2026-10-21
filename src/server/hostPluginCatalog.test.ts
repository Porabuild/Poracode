import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  cpSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { PluginRegistry } from "@/supervisor/plugins/PluginRegistry";
import { PluginCatalogService } from "@/supervisor/plugins/PluginCatalogService";
import {
  AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
  AGENT_PLUGINS_MCP_SCHEMA_URL,
} from "@/shared/plugins/spec";
import { pluginCatalogPayloadSchema } from "@/shared/contracts/pluginCatalog";
import {
  hostAdminCatalogResultSchema,
  type HostAdminCatalogCommand,
} from "@/shared/contracts/hostPluginCatalog";
import { SettingsAuthority } from "@/backend/settings/SettingsAuthority";
import { SettingsCompatWriter } from "@/backend/settings/settingsCompatWrites";
import type { AdminSupervisorCall } from "./hostProviderAuth";
import { administerPluginCatalog } from "./hostPluginCatalog";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "poracode-catalog-admin-"));
  cleanups.push(async () => rmSync(root, { recursive: true, force: true }));
  const marketplace = join(root, "marketplace"),
    pkg = join(marketplace, "plugins", "notes"),
    user = join(root, "plugins");
  mkdirSync(join(pkg, "skills", "summarize"), { recursive: true });
  writeFileSync(
    join(pkg, "plugin.json"),
    JSON.stringify({ $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL, name: "notes", version: "1.0.0" }),
  );
  writeFileSync(
    join(pkg, "skills", "summarize", "SKILL.md"),
    "---\nname: summarize\ndescription: Summarize notes\n---\nSummarize.",
  );
  writeFileSync(
    join(pkg, "mcp.json"),
    JSON.stringify({
      $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
      mcpServers: {
        local: {
          type: "stdio",
          command: "fixture-never-run",
          args: ["synthetic-private-argument"],
          env: { PRIVATE_KEY: "synthetic-private-env" },
        },
        remote: {
          type: "streamable-http",
          url: "https://fixture.invalid/mcp?key=synthetic-private-url",
          headers: { Authorization: "synthetic-private-header" },
        },
      },
    }),
  );
  writeFileSync(
    join(marketplace, "marketplace.json"),
    JSON.stringify({
      name: "example",
      plugins: [{ name: "notes", source: "./plugins/notes", version: "1.0.0" }],
    }),
  );
  writeFileSync(join(root, "plugin-catalogs.json"), JSON.stringify({ version: 2, catalogs: [] }));
  const controller = new AbortController(),
    generation = randomUUID();
  // This test uses the real settings CAS writer with a unit lease capability;
  // bundled runtime QA separately qualifies actual host-root/SQLite ownership.
  const authority = await SettingsAuthority.open({
    lease: {
      paths: { dataRoot: root },
      generation,
      assertActive: () => controller.signal.throwIfAborted(),
    },
    assertPreparedDatabaseForWrite: () => {},
  });
  cleanups.push(() => authority.close());
  const writes = new SettingsCompatWriter(authority);
  const registry = new PluginRegistry({
    bundledPluginsDir: () => join(root, "bundled"),
    userPluginsDir: () => user,
  });
  const removeAccounts = vi.fn<(name: string) => void>();
  const service = new PluginCatalogService({ baseDir: root, registry, removeAccounts });
  const call = vi.fn<AdminSupervisorCall>(async (name, payload) => {
    if (name === "pluginCatalog")
      return (await service.manage(pluginCatalogPayloadSchema.parse(payload))) as never;
    if (name === "listPlugins")
      return { plugins: registry.listPlugins(), userPluginsDir: user } as never;
    throw new Error("Unexpected supervisor operation");
  });
  const options = {
    call,
    settings: writes,
    readSettings: () => authority.readSettings(),
    assertCanPersistSecrets: vi.fn<() => void>(),
  };
  const context = {
    signal: controller.signal,
    assertActive: () => controller.signal.throwIfAborted(),
  };
  const run = async (command: HostAdminCatalogCommand) =>
    hostAdminCatalogResultSchema.parse(await administerPluginCatalog(command, context, options));
  const add = () => run({ action: "catalogs-add", source: { type: "local", path: marketplace } });
  return {
    root,
    marketplace,
    pkg,
    user,
    service,
    registry,
    removeAccounts,
    call,
    options,
    writes,
    authority,
    controller,
    run,
    add,
  };
}

it("inspects public package metadata without exposing executable arguments or transport values", async () => {
  const f = await fixture(),
    added = await f.add(),
    catalogId = added.catalogs[0]!.id;
  const result = await f.run({ action: "package-inspect", catalogId, entryName: "notes" });
  expect(result.inspection).toMatchObject({
    name: "notes",
    hostSupported: true,
    defaultEnabled: false,
    skills: ["summarize"],
    mcpServers: [
      { name: "local", environmentNames: ["PRIVATE_KEY"] },
      { name: "remote", headerNames: ["Authorization"] },
    ],
  });
  expect(JSON.stringify(result)).not.toContain("synthetic-private");
  expect(JSON.stringify(result)).not.toContain("fixture-never-run");
  expect(f.registry.listPlugins()).toEqual([]);
  const browse = await f.run({ action: "catalogs-inspect", catalogId });
  expect(browse.catalogs[0]!.entries).toEqual([expect.objectContaining({ name: "notes" })]);
  expect((await f.run({ action: "catalogs-list" })).catalogs[0]).not.toHaveProperty("entries");
});

it("uses reviewed bytes and preserves concurrent unrelated enable policy through install/update/disable/removal", async () => {
  const f = await fixture(),
    catalogId = (await f.add()).catalogs[0]!.id;
  const reviewed = (await f.run({ action: "package-inspect", catalogId, entryName: "notes" }))
    .inspection!;
  const original = f.service.manage.bind(f.service);
  vi.spyOn(f.service, "manage").mockImplementation(async (payload) => {
    const value = await original(payload);
    if (payload.action === "install")
      await f.writes.editSettingsField("installedPlugins", (current) => ({
        ...current.installedPlugins,
        other: {
          version: "7",
          enabled: false,
          disabledSkillIds: ["retained"],
          disabledMcpServerNames: [],
        },
      }));
    return value;
  });
  const installed = await f.run({
    action: "package-install",
    catalogId,
    entryName: "notes",
    reviewDigest: reviewed.digest,
  });
  expect(installed.installations[0]).toMatchObject({
    pluginName: "notes",
    enabled: false,
    digest: reviewed.digest,
  });
  await f.writes.editSettingsField("installedPlugins", (current) => ({
    ...current.installedPlugins,
    notes: {
      ...current.installedPlugins.notes!,
      disabledSkillIds: ["summarize"],
      disabledMcpServerNames: ["remote"],
    },
  }));
  await f.run({ action: "plugin-enabled", pluginName: "notes", enabled: false });
  writeFileSync(
    join(f.pkg, "skills", "summarize", "SKILL.md"),
    "---\nname: summarize\ndescription: Updated\n---\nUpdated content.",
  );
  const next = (await f.run({ action: "package-inspect", catalogId, entryName: "notes" }))
    .inspection!;
  expect(next.digest).not.toBe(reviewed.digest);
  await expect(
    f.run({
      action: "package-update",
      catalogId,
      entryName: "notes",
      reviewDigest: reviewed.digest,
    }),
  ).rejects.toThrow("changed after review");
  await f.run({
    action: "package-update",
    catalogId,
    entryName: "notes",
    reviewDigest: next.digest,
  });
  expect(f.authority.readSettings().installedPlugins.notes).toMatchObject({
    enabled: false,
    disabledSkillIds: ["summarize"],
    disabledMcpServerNames: ["remote"],
  });
  await f.run({ action: "catalogs-remove", catalogId });
  expect(existsSync(join(f.user, "notes"))).toBe(true);
  expect(f.removeAccounts).not.toHaveBeenCalled();
  await f.run({ action: "package-remove", pluginName: "notes" });
  expect(existsSync(join(f.user, "notes"))).toBe(false);
  expect(f.removeAccounts).toHaveBeenCalledExactlyOnceWith("notes");
  expect(f.authority.readSettings().installedPlugins.notes).toBeUndefined();
  expect(f.authority.readSettings().installedPlugins.other).toMatchObject({
    version: "7",
    enabled: false,
    disabledSkillIds: ["retained"],
  });
});

it("refuses stale digests before copying and local edits before update or removal", async () => {
  const f = await fixture(),
    catalogId = (await f.add()).catalogs[0]!.id;
  await expect(
    f.run({
      action: "package-install",
      catalogId,
      entryName: "notes",
      reviewDigest: "0".repeat(64),
    }),
  ).rejects.toThrow("changed after review");
  expect(existsSync(join(f.user, "notes"))).toBe(false);
  const review = (await f.run({ action: "package-inspect", catalogId, entryName: "notes" }))
    .inspection!;
  await f.run({
    action: "package-install",
    catalogId,
    entryName: "notes",
    reviewDigest: review.digest,
  });
  const edited = join(f.user, "notes", "plugin.json");
  writeFileSync(edited, readFileSync(edited, "utf8") + "\n");
  await expect(f.run({ action: "package-remove", pluginName: "notes" })).rejects.toThrow(
    "local changes",
  );
  expect(f.removeAccounts).not.toHaveBeenCalled();
  expect(f.authority.readSettings().installedPlugins.notes).toBeDefined();
});

it("refuses unsafe source/subject, missing catalog and unavailable credential custody without mutations", async () => {
  const f = await fixture();
  await expect(
    f.run({
      action: "catalogs-add",
      source: { type: "git", url: "https://user:secret@fixture.invalid/repo" },
    }),
  ).rejects.toThrow("without credentials");
  await expect(
    f.run({ action: "catalogs-add", source: { type: "local", path: "relative" } }),
  ).rejects.toThrow("absolute host path");
  await expect(
    f.run({ action: "plugin-enabled", pluginName: "constructor", enabled: true }),
  ).rejects.toThrow("Reserved");
  expect(f.call).not.toHaveBeenCalled();
  await expect(f.run({ action: "catalogs-remove", catalogId: randomUUID() })).rejects.toThrow(
    "not found",
  );
  expect(f.call.mock.calls.map((call) => call[0])).toEqual(["pluginCatalog"]);
  f.options.assertCanPersistSecrets.mockImplementation(() => {
    throw new Error("No persistent credential custody");
  });
  await expect(f.run({ action: "package-remove", pluginName: "notes" })).rejects.toThrow(
    "credential custody",
  );
  expect(f.removeAccounts).not.toHaveBeenCalled();
});

it("keeps future catalog store bytes and reports partial file installation when CAS refuses activation", async () => {
  const f = await fixture(),
    catalogId = (await f.add()).catalogs[0]!.id;
  const reviewed = (await f.run({ action: "package-inspect", catalogId, entryName: "notes" }))
    .inspection!;
  vi.spyOn(f.writes, "editSettingsField").mockResolvedValueOnce({
    status: "conflict",
    authorityId: randomUUID(),
    sequence: 1,
    reason: "revision-changed",
    current: [],
    revisions: {},
  });
  await expect(
    f.run({
      action: "package-install",
      catalogId,
      entryName: "notes",
      reviewDigest: reviewed.digest,
    }),
  ).rejects.toThrow("Package files were installed, but activation policy was not saved");
  expect(existsSync(join(f.user, "notes"))).toBe(true);
  expect(f.authority.readSettings().installedPlugins.notes).toBeUndefined();
  await f.run({ action: "plugin-enabled", pluginName: "notes", enabled: false });
  expect(f.authority.readSettings().installedPlugins.notes?.enabled).toBe(false);
  const file = join(f.root, "plugin-catalogs.json"),
    future = '{"version":99,"catalogs":[],"opaque":"retain"}';
  writeFileSync(file, future);
  await expect(f.run({ action: "catalogs-list" })).rejects.toThrow(/Invalid|version/u);
  expect(readFileSync(file, "utf8")).toBe(future);
});

it("refuses unsupported host packages before copying/enabling and keeps always-on bundled policy", async () => {
  const f = await fixture();
  const other = process.platform === "win32" ? "linux" : "win32";
  writeFileSync(
    join(f.pkg, "plugin.json"),
    JSON.stringify({
      $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
      name: "notes",
      version: "1.0.0",
      extensions: { "com.poracode.client": { platforms: [other] } },
    }),
  );
  const catalogId = (await f.add()).catalogs[0]!.id;
  const reviewed = (await f.run({ action: "package-inspect", catalogId, entryName: "notes" }))
    .inspection!;
  expect(reviewed.hostSupported).toBe(false);
  await expect(
    f.run({
      action: "package-install",
      catalogId,
      entryName: "notes",
      reviewDigest: reviewed.digest,
    }),
  ).rejects.toThrow("selected host OS");
  expect(existsSync(join(f.user, "notes"))).toBe(false);
  cpSync(f.pkg, join(f.user, "notes"), { recursive: true });
  await expect(
    f.run({ action: "plugin-enabled", pluginName: "notes", enabled: true }),
  ).rejects.toThrow("selected host OS");
  expect(f.authority.readSettings().installedPlugins.notes).toBeUndefined();
  const bundled = join(f.root, "bundled", "fixed");
  mkdirSync(bundled, { recursive: true });
  writeFileSync(
    join(bundled, "plugin.json"),
    JSON.stringify({
      $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
      name: "fixed",
      extensions: { "com.poracode.client": { alwaysEnabled: true } },
    }),
  );
  await expect(
    f.run({ action: "plugin-enabled", pluginName: "fixed", enabled: false }),
  ).rejects.toThrow("always enabled");
  expect(f.authority.readSettings().installedPlugins.fixed).toBeUndefined();
});
