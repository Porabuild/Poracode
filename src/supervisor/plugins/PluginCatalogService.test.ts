import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  cpSync,
  renameSync,
  symlinkSync,
  utimesSync,
  chmodSync,
  statSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pluginCatalogPayloadSchema,
  pluginCatalogResultSchema,
} from "@/shared/contracts/pluginCatalog";
import { AGENT_PLUGINS_MANIFEST_SCHEMA_URL } from "@/shared/plugins/spec";
import { parsePluginMarketplace, RECOMMENDED_PLUGIN_CATALOGS } from "@/shared/plugins/marketplaces";
import { PluginRegistry } from "./PluginRegistry";
import { PluginCatalogService, pluginPackageDigest } from "./PluginCatalogService";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "poracode-plugin-catalog-"));
  roots.push(root);
  const user = join(root, "user");
  const marketplace = join(root, "marketplace");
  const pkg = join(marketplace, "plugins", "notes");
  mkdirSync(join(pkg, "skills", "summarize"), { recursive: true });
  writeFileSync(
    join(pkg, "plugin.json"),
    JSON.stringify({ $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL, name: "notes", version: "1.0.0" }),
  );
  writeFileSync(
    join(pkg, "skills", "summarize", "SKILL.md"),
    "---\nname: summarize\ndescription: Summarize notes\n---\nSummarize the notes.",
  );
  writeFileSync(
    join(marketplace, "marketplace.json"),
    JSON.stringify({
      name: "example",
      plugins: [{ name: "notes", source: "./plugins/notes", version: "1.0.0" }],
    }),
  );
  writeFileSync(join(root, "plugin-catalogs.json"), JSON.stringify({ version: 2, catalogs: [] }));
  const registry = new PluginRegistry({
    bundledPluginsDir: () => undefined,
    userPluginsDir: () => user,
  });
  const removeAccounts = vi.fn<(pluginName: string) => void>();
  const service = new PluginCatalogService({ baseDir: root, registry, removeAccounts });
  return { root, user, marketplace, pkg, registry, service, removeAccounts };
}

describe("plugin catalog installation", () => {
  it("keeps artwork scoped to same-named project plugins and refuses unknown artwork versions", async () => {
    const fixture = setup();
    const icons = [];
    for (const [name, color] of [
      ["first", "red"],
      ["second", "blue"],
    ]) {
      const project = join(fixture.root, name!);
      const pkg = join(project, ".poracode", "plugins", "notes");
      cpSync(fixture.pkg, pkg, { recursive: true });
      rmSync(join(pkg, "plugin.json"));
      mkdirSync(join(pkg, ".codex-plugin"));
      writeFileSync(
        join(pkg, ".codex-plugin", "plugin.json"),
        JSON.stringify({ name: "notes", interface: { logo: "icon.svg" } }),
      );
      writeFileSync(
        join(pkg, "icon.svg"),
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="${color}" d="M0 0h24v24H0z"/></svg>`,
      );
      const result = await fixture.service.manage({
        action: "artwork",
        version: 1,
        target: { type: "plugin", pluginName: "notes", projectFsPath: project },
      });
      icons.push(result.artwork!.dataUrl);
    }
    expect(icons[0]).toMatch(/^data:image\/png;base64,/u);
    expect(icons[0]).not.toBe(icons[1]);
    expect(
      (
        await fixture.service.manage({
          action: "artwork",
          version: 1,
          target: { type: "plugin", pluginName: "notes" },
        })
      ).artwork!.dataUrl,
    ).toBeUndefined();
    const request = {
      action: "artwork",
      version: 1,
      target: { type: "plugin", pluginName: "notes" },
    };
    expect(pluginCatalogPayloadSchema.safeParse({ ...request, version: 2 }).success).toBe(false);
    expect(pluginCatalogPayloadSchema.safeParse({ ...request, version: undefined }).success).toBe(
      false,
    );
    expect(
      pluginCatalogResultSchema.safeParse({
        catalogs: [],
        installations: [],
        artwork: { version: 2 },
      }).success,
    ).toBe(false);
    expect(
      pluginCatalogResultSchema.safeParse({
        catalogs: [],
        installations: [],
        artwork: { version: 1, dataUrl: "https://example.org/tracker" },
      }).success,
    ).toBe(false);
  });

  it("loads actual package artwork without inspecting/installing or changing catalog storage", async () => {
    const fixture = setup();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M0 0h24v24H0z"/></svg>';
    writeFileSync(join(fixture.pkg, "icon.svg"), svg);
    mkdirSync(join(fixture.pkg, ".codex-plugin"));
    rmSync(join(fixture.pkg, "plugin.json"));
    writeFileSync(
      join(fixture.pkg, ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "notes", interface: { logo: "./icon.svg" } }),
    );
    const added = await fixture.service.manage({
      action: "add",
      source: { type: "local", path: fixture.marketplace },
    });
    const before = readFileSync(join(fixture.root, "plugin-catalogs.json"));
    const result = await fixture.service.manage({
      action: "artwork",
      version: 1,
      target: { type: "catalog", catalogId: added.catalogs[0]!.id, entryName: "notes" },
    });
    expect(result.artwork).toMatchObject({
      version: 1,
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/u),
    });
    expect(result.catalogs).toEqual([]);
    expect(readFileSync(join(fixture.root, "plugin-catalogs.json"))).toEqual(before);
    expect(fixture.registry.listPlugins()).toEqual([]);
    expect(fixture.removeAccounts).not.toHaveBeenCalled();
  });

  it("registers all defaults on a fresh store and migrates v1 without overwriting until a mutation", async () => {
    const fixture = setup();
    const path = join(fixture.root, "plugin-catalogs.json");
    rmSync(path);
    const fresh = await fixture.service.manage({ action: "list" });
    expect(fresh.catalogs.map((catalog) => catalog.source)).toEqual(
      RECOMMENDED_PLUGIN_CATALOGS.map((catalog) => ({ type: "git", url: catalog.url })),
    );
    expect(fresh.catalogs.every((catalog) => catalog.refreshedAt === 0)).toBe(true);
    expect(existsSync(path)).toBe(false);
    const before = JSON.stringify({ version: 1, catalogs: [] });
    writeFileSync(path, before);
    const migrated = await fixture.service.manage({ action: "list" });
    expect(migrated).toEqual(fresh);
    expect(readFileSync(path, "utf8")).toBe(before);
    const removed = migrated.catalogs[0]!;
    await fixture.service.manage({ action: "remove-source", catalogId: removed.id });
    expect(JSON.parse(readFileSync(path, "utf8")).version).toBe(3);
    const reopened = new PluginCatalogService({
      baseDir: fixture.root,
      registry: fixture.registry,
      removeAccounts: fixture.removeAccounts,
    });
    expect(
      (await reopened.manage({ action: "list" })).catalogs.map((catalog) => catalog.id),
    ).toEqual(migrated.catalogs.slice(1).map((catalog) => catalog.id));
  });

  it("upgrades a v2 store in memory, keeping category-less entries readable until a mutation persists v3", async () => {
    const fixture = setup();
    const path = join(fixture.root, "plugin-catalogs.json");
    const catalogId = randomUUID();
    const before = JSON.stringify({
      version: 2,
      catalogs: [
        {
          id: catalogId,
          name: "existing",
          source: { type: "local", path: fixture.marketplace },
          root: fixture.marketplace,
          revision: "existing",
          refreshedAt: 1,
          entries: [
            {
              name: "notes",
              description: "Notes",
              source: { type: "path", path: "./plugins/notes" },
              unavailable: [],
            },
          ],
        },
      ],
    });
    writeFileSync(path, before);
    const listed = await fixture.service.manage({ action: "list" });
    expect(listed.catalogs[0]?.entries[0]).toMatchObject({ name: "notes" });
    expect(listed.catalogs[0]?.entries[0]?.category).toBeUndefined();
    // A read must not rewrite the file; the first mutation persists v3.
    expect(readFileSync(path, "utf8")).toBe(before);
    await fixture.service.manage({ action: "remove-source", catalogId });
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ version: 3, catalogs: [] });
  });

  it("refuses a newer catalog store version without overwriting it", async () => {
    const fixture = setup();
    const path = join(fixture.root, "plugin-catalogs.json");
    const future = JSON.stringify({ version: 4, catalogs: [], future: "keep" });
    writeFileSync(path, future);
    await expect(fixture.service.manage({ action: "list" })).rejects.toThrow(
      "Plugin catalog store version 4 is not supported",
    );
    await expect(
      fixture.service.manage({ action: "remove-source", catalogId: randomUUID() }),
    ).rejects.toThrow("Plugin catalog store version 4 is not supported");
    expect(readFileSync(path, "utf8")).toBe(future);
  });

  it("keeps an existing default snapshot and appends only missing defaults on v1 migration", async () => {
    const fixture = setup();
    const snapshot = {
      id: randomUUID(),
      name: "Existing",
      source: { type: "git", url: RECOMMENDED_PLUGIN_CATALOGS[0].url },
      root: fixture.marketplace,
      revision: "existing",
      refreshedAt: 123,
      entries: [],
    };
    writeFileSync(
      join(fixture.root, "plugin-catalogs.json"),
      JSON.stringify({ version: 1, catalogs: [snapshot] }),
    );
    const result = await fixture.service.manage({ action: "list" });
    expect(result.catalogs).toHaveLength(4);
    expect(result.catalogs[0]).toMatchObject({
      id: snapshot.id,
      revision: "existing",
      refreshedAt: 123,
    });
    expect(
      result.catalogs.filter(
        (catalog) => catalog.source.type === "git" && catalog.source.url === snapshot.source.url,
      ),
    ).toHaveLength(1);
  });

  it.each([undefined, ".", "./"])(
    "installs a repository-root package with path %s",
    async (path) => {
      const fixture = setup();
      const snapshot = join(fixture.root, "plugin-catalogs", randomUUID());
      vi.spyOn(
        fixture.service as unknown as {
          clone: () => Promise<{ root: string; revision: string }>;
        },
        "clone",
      ).mockImplementation(async () => {
        cpSync(fixture.pkg, snapshot, { recursive: true });
        return { root: snapshot, revision: "a".repeat(40) };
      });
      writeFileSync(
        join(fixture.marketplace, "marketplace.json"),
        JSON.stringify({
          name: "example",
          plugins: [
            {
              name: "notes",
              source: {
                source: "git",
                url: "https://example.org/notes.git",
                ...(path === undefined ? {} : { path }),
              },
            },
          ],
        }),
      );
      const catalogId = (
        await fixture.service.manage({
          action: "add",
          source: { type: "local", path: fixture.marketplace },
        })
      ).catalogs[0]!.id;
      const review = await fixture.service.manage({
        action: "inspect",
        catalogId,
        entryName: "notes",
      });
      expect(review.inspection?.plugin.name).toBe("notes");
      const installed = await fixture.service.manage({
        action: "install",
        catalogId,
        entryName: "notes",
        reviewDigest: review.inspection!.digest,
      });
      expect(installed.installations[0]?.packageSource).toMatchObject({
        type: "git",
        path: path ?? ".",
      });
    },
  );

  it.each(["missing", "malformed"])(
    "cleans an owned clone after %s marketplace discovery",
    async (kind) => {
      const fixture = setup();
      const snapshot = join(fixture.root, "plugin-catalogs", randomUUID());
      mkdirSync(snapshot, { recursive: true });
      if (kind === "malformed") writeFileSync(join(snapshot, "marketplace.json"), "{ truncated");
      vi.spyOn(
        fixture.service as unknown as {
          clone: () => Promise<{ root: string; revision: string }>;
        },
        "clone",
      ).mockResolvedValue({ root: snapshot, revision: "a".repeat(40) });
      await expect(
        fixture.service.manage({
          action: "add",
          source: { type: "git", url: "https://example.org/not-a-marketplace.git" },
        }),
      ).rejects.toThrow(kind === "missing" ? "No supported marketplace manifest" : /JSON/u);
      expect(existsSync(snapshot)).toBe(false);
      expect(existsSync(fixture.pkg)).toBe(true);
      expect((await fixture.service.manage({ action: "list" })).catalogs).toEqual([]);
    },
  );

  it("preserves malformed neighboring receipts while returning completed catalog mutations", async () => {
    const fixture = setup();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const neighbor = join(fixture.user, "unrelated");
    mkdirSync(neighbor, { recursive: true });
    const receipt = join(neighbor, ".poracode-install.json");
    const bytes = "{ truncated neighbor receipt";
    writeFileSync(receipt, bytes);
    expect((await fixture.service.manage({ action: "list" })).installations).toEqual([]);
    const catalogId = (
      await fixture.service.manage({
        action: "add",
        source: { type: "local", path: fixture.marketplace },
      })
    ).catalogs[0]!.id;
    const review = await fixture.service.manage({
      action: "inspect",
      catalogId,
      entryName: "notes",
    });
    const installed = await fixture.service.manage({
      action: "install",
      catalogId,
      entryName: "notes",
      reviewDigest: review.inspection!.digest,
    });
    expect(installed.inspection?.plugin.name).toBe("notes");
    expect(installed.installations.map((entry) => entry.pluginName)).toEqual(["notes"]);
    expect(
      (await fixture.service.manage({ action: "remove-package", pluginName: "notes" }))
        .installations,
    ).toEqual([]);
    expect(readFileSync(receipt, "utf8")).toBe(bytes);
  });

  it("invalidates cached packages when an installation receipt changes to a future version", async () => {
    const fixture = setup();
    const catalogId = (
      await fixture.service.manage({
        action: "add",
        source: { type: "local", path: fixture.marketplace },
      })
    ).catalogs[0]!.id;
    const review = await fixture.service.manage({
      action: "inspect",
      catalogId,
      entryName: "notes",
    });
    await fixture.service.manage({
      action: "install",
      catalogId,
      entryName: "notes",
      reviewDigest: review.inspection!.digest,
    });
    expect(fixture.registry.getPlugin("notes")).toBeDefined();
    const receipt = join(fixture.user, "notes", ".poracode-install.json");
    const future = JSON.stringify({
      ...JSON.parse(readFileSync(receipt, "utf8")),
      formatVersion: 99,
    });
    writeFileSync(receipt, future);
    utimesSync(receipt, 1_000, 1_000);
    expect(fixture.registry.getPlugin("notes")).toBeUndefined();
    expect(readFileSync(receipt, "utf8")).toBe(future);
  });

  it("removes owned Git snapshots with read-only objects without following directory links", async () => {
    const fixture = setup();
    const catalogId = randomUUID();
    const snapshot = join(fixture.root, "plugin-catalogs", randomUUID());
    const objects = join(snapshot, ".git", "objects", "pack");
    mkdirSync(objects, { recursive: true });
    const objectFile = join(objects, "pack-fixture.pack");
    writeFileSync(objectFile, "Git object");
    chmodSync(objectFile, 0o444);
    const outsideFile = join(fixture.marketplace, "preserve.txt");
    writeFileSync(outsideFile, "User source");
    chmodSync(outsideFile, 0o444);
    const outsideMode = statSync(outsideFile).mode;
    symlinkSync(
      fixture.marketplace,
      join(snapshot, "linked-source"),
      process.platform === "win32" ? "junction" : "dir",
    );
    writeFileSync(
      join(fixture.root, "plugin-catalogs.json"),
      JSON.stringify({
        version: 2,
        catalogs: [
          {
            id: catalogId,
            name: "example",
            source: { type: "git", url: "https://example.org/catalog.git" },
            root: snapshot,
            revision: "a".repeat(40),
            refreshedAt: 1,
            entries: [],
          },
        ],
      }),
    );
    expect((await fixture.service.manage({ action: "remove-source", catalogId })).catalogs).toEqual(
      [],
    );
    expect(existsSync(snapshot)).toBe(false);
    expect(readFileSync(outsideFile, "utf8")).toBe("User source");
    expect(statSync(outsideFile).mode).toBe(outsideMode);
  });

  it("reviews, copies, reloads, updates, and removes a real package without modifying its source", async () => {
    const fixture = setup();
    const added = await fixture.service.manage({
      action: "add",
      source: { type: "local", path: fixture.marketplace },
    });
    const catalogId = added.catalogs[0]!.id;
    const review = await fixture.service.manage({
      action: "inspect",
      catalogId,
      entryName: "notes",
    });
    expect(fixture.registry.listPlugins()).toEqual([]);
    expect(review.inspection?.plugin.poracode.defaultEnabled).toBe(false);
    const installed = await fixture.service.manage({
      action: "install",
      catalogId,
      entryName: "notes",
      reviewDigest: review.inspection!.digest,
    });
    expect(installed.installations[0]).toMatchObject({
      pluginName: "notes",
      catalogName: "example",
      formatVersion: 1,
    });
    expect(fixture.registry.getPlugin("notes")?.skills[0]?.path).toBe(
      join(fixture.user, "notes", "skills", "summarize"),
    );
    writeFileSync(
      join(fixture.pkg, "plugin.json"),
      JSON.stringify({
        $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
        name: "notes",
        version: "2.0.0",
      }),
    );
    const updatedReview = await fixture.service.manage({
      action: "inspect",
      catalogId,
      entryName: "notes",
    });
    await fixture.service.manage({
      action: "update",
      catalogId,
      entryName: "notes",
      reviewDigest: updatedReview.inspection!.digest,
    });
    expect(fixture.registry.getPlugin("notes")?.manifest.version).toBe("2.0.0");
    await fixture.service.manage({ action: "remove-source", catalogId });
    expect((await fixture.service.manage({ action: "list" })).installations[0]).toMatchObject({
      catalogSource: { type: "local", path: fixture.marketplace },
      packageSource: { type: "path", path: "./plugins/notes" },
    });
    expect(fixture.registry.getPlugin("notes")).toBeDefined();
    await fixture.service.manage({ action: "remove-package", pluginName: "notes" });
    expect(fixture.registry.getPlugin("notes")).toBeUndefined();
    expect(existsSync(fixture.pkg)).toBe(true);
    expect(fixture.removeAccounts).toHaveBeenCalledWith("notes");
  });

  it("rejects changed review contents and preserves user edits on update/removal", async () => {
    const fixture = setup();
    const catalogId = (
      await fixture.service.manage({
        action: "add",
        source: { type: "local", path: fixture.marketplace },
      })
    ).catalogs[0]!.id;
    const review = await fixture.service.manage({
      action: "inspect",
      catalogId,
      entryName: "notes",
    });
    writeFileSync(join(fixture.pkg, "extra.txt"), "changed after review");
    await expect(
      fixture.service.manage({
        action: "install",
        catalogId,
        entryName: "notes",
        reviewDigest: review.inspection!.digest,
      }),
    ).rejects.toThrow("changed after review");
    const fresh = await fixture.service.manage({
      action: "inspect",
      catalogId,
      entryName: "notes",
    });
    await fixture.service.manage({
      action: "install",
      catalogId,
      entryName: "notes",
      reviewDigest: fresh.inspection!.digest,
    });
    writeFileSync(join(fixture.user, "notes", "extra.txt"), "local user change");
    await expect(
      fixture.service.manage({
        action: "update",
        catalogId,
        entryName: "notes",
        reviewDigest: fresh.inspection!.digest,
      }),
    ).rejects.toThrow("local changes");
    await expect(
      fixture.service.manage({ action: "remove-package", pluginName: "notes" }),
    ).rejects.toThrow("local changes");
    expect(fixture.removeAccounts).not.toHaveBeenCalled();
  });

  it("rejects catalog path traversal, blocked policy, mismatched identity, and future stores", async () => {
    const fixture = setup();
    const manifest = join(fixture.marketplace, "marketplace.json");
    writeFileSync(
      manifest,
      JSON.stringify({ name: "example", plugins: [{ name: "notes", source: "../outside" }] }),
    );
    const catalogId = (
      await fixture.service.manage({
        action: "add",
        source: { type: "local", path: fixture.marketplace },
      })
    ).catalogs[0]!.id;
    await expect(
      fixture.service.manage({ action: "inspect", catalogId, entryName: "notes" }),
    ).rejects.toThrow("inside");
    const future = JSON.stringify({ version: 99, catalogs: [] });
    writeFileSync(join(fixture.root, "plugin-catalogs.json"), future);
    await expect(
      fixture.service.manage({
        action: "add",
        source: { type: "local", path: fixture.marketplace },
      }),
    ).rejects.toThrow(/version/u);
    expect(readFileSync(join(fixture.root, "plugin-catalogs.json"), "utf8")).toBe(future);
  });

  it("resolves a manifest file relative to the repository root", async () => {
    const fixture = setup();
    mkdirSync(join(fixture.marketplace, ".agents", "plugins"), { recursive: true });
    const file = join(fixture.marketplace, ".agents", "plugins", "marketplace.json");
    writeFileSync(file, readFileSync(join(fixture.marketplace, "marketplace.json")));
    const catalogId = (
      await fixture.service.manage({ action: "add", source: { type: "local", path: file } })
    ).catalogs[0]!.id;
    expect(
      (await fixture.service.manage({ action: "inspect", catalogId, entryName: "notes" }))
        .inspection?.plugin.name,
    ).toBe("notes");
  });
});

describe("interrupted and linked installations", () => {
  it.each(["future journal", "partial backup"])(
    "isolates %s recovery refusal from supervisor construction",
    async (kind) => {
      const fixture = setup();
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const catalogId = (
        await fixture.service.manage({
          action: "add",
          source: { type: "local", path: fixture.marketplace },
        })
      ).catalogs[0]!.id;
      const review = await fixture.service.manage({
        action: "inspect",
        catalogId,
        entryName: "notes",
      });
      await fixture.service.manage({
        action: "install",
        catalogId,
        entryName: "notes",
        reviewDigest: review.inspection!.digest,
      });
      const target = join(fixture.user, "notes");
      const digest = pluginPackageDigest(target);
      const backup = `.previous-${randomUUID()}`;
      const backupRoot = join(fixture.user, backup);
      cpSync(target, backupRoot, { recursive: true });
      if (kind === "partial backup") rmSync(join(backupRoot, "skills", "summarize", "SKILL.md"));
      const journal = join(fixture.root, "plugin-install-transaction.json");
      const bytes = JSON.stringify({
        version: kind === "future journal" ? 99 : 1,
        pluginName: "notes",
        staging: `.install-${randomUUID()}`,
        backup,
        digest,
        previousDigest: digest,
      });
      writeFileSync(journal, bytes);
      const beforeBackup = pluginPackageDigest(backupRoot);
      const recovered = new PluginCatalogService({
        baseDir: fixture.root,
        registry: fixture.registry,
        removeAccounts: fixture.removeAccounts,
      });
      expect(fixture.registry.getPlugin("notes")).toBeDefined();
      await expect(recovered.manage({ action: "list" })).rejects.toThrow(
        kind === "future journal" ? /version/u : "Preserving modified",
      );
      expect(readFileSync(journal, "utf8")).toBe(bytes);
      expect(pluginPackageDigest(target)).toBe(digest);
      expect(pluginPackageDigest(backupRoot)).toBe(beforeBackup);
    },
  );

  it("recovers a replacement interrupted between directory renames", async () => {
    const fixture = setup();
    const catalogId = (
      await fixture.service.manage({
        action: "add",
        source: { type: "local", path: fixture.marketplace },
      })
    ).catalogs[0]!.id;
    const review = await fixture.service.manage({
      action: "inspect",
      catalogId,
      entryName: "notes",
    });
    await fixture.service.manage({
      action: "install",
      catalogId,
      entryName: "notes",
      reviewDigest: review.inspection!.digest,
    });
    const target = join(fixture.user, "notes");
    const staging = `.install-${randomUUID()}`;
    const backup = `.previous-${randomUUID()}`;
    cpSync(target, join(fixture.user, staging), { recursive: true });
    chmodSync(join(fixture.user, staging, "skills", "summarize", "SKILL.md"), 0o444);
    const digest = pluginPackageDigest(target);
    writeFileSync(
      join(fixture.root, "plugin-install-transaction.json"),
      JSON.stringify({
        version: 1,
        pluginName: "notes",
        staging,
        backup,
        digest,
        previousDigest: digest,
      }),
    );
    renameSync(target, join(fixture.user, backup));
    fixture.registry.refresh();
    expect(fixture.registry.getPlugin("notes")).toBeUndefined();
    const recovered = new PluginCatalogService({
      baseDir: fixture.root,
      registry: fixture.registry,
      removeAccounts: fixture.removeAccounts,
    });
    expect((await recovered.manage({ action: "list" })).installations).toHaveLength(1);
    expect(fixture.registry.getPlugin("notes")?.manifest.version).toBe("1.0.0");
    expect(existsSync(join(fixture.user, staging))).toBe(false);
    expect(existsSync(join(fixture.user, backup))).toBe(false);
    expect(existsSync(join(fixture.root, "plugin-install-transaction.json"))).toBe(false);
  });

  it("rejects a linked package root without writing into the source", async () => {
    const fixture = setup();
    const linked = join(fixture.marketplace, "linked");
    symlinkSync(fixture.pkg, linked, process.platform === "win32" ? "junction" : "dir");
    writeFileSync(
      join(fixture.marketplace, "marketplace.json"),
      JSON.stringify({ name: "linked", plugins: [{ name: "notes", source: "./linked" }] }),
    );
    const catalogId = (
      await fixture.service.manage({
        action: "add",
        source: { type: "local", path: fixture.marketplace },
      })
    ).catalogs[0]!.id;
    await expect(
      fixture.service.manage({ action: "inspect", catalogId, entryName: "notes" }),
    ).rejects.toThrow("Linked package roots");
    expect(existsSync(join(fixture.pkg, ".poracode-install.json"))).toBe(false);
  });

  it("preserves an interrupted update when the target was manually replaced", async () => {
    const fixture = setup();
    const catalogId = (
      await fixture.service.manage({
        action: "add",
        source: { type: "local", path: fixture.marketplace },
      })
    ).catalogs[0]!.id;
    const review = await fixture.service.manage({
      action: "inspect",
      catalogId,
      entryName: "notes",
    });
    await fixture.service.manage({
      action: "install",
      catalogId,
      entryName: "notes",
      reviewDigest: review.inspection!.digest,
    });
    const target = join(fixture.user, "notes");
    const staging = `.install-${randomUUID()}`;
    const backup = `.previous-${randomUUID()}`;
    cpSync(target, join(fixture.user, staging), { recursive: true });
    const digest = pluginPackageDigest(target);
    const journal = join(fixture.root, "plugin-install-transaction.json");
    writeFileSync(
      journal,
      JSON.stringify({
        version: 1,
        pluginName: "notes",
        staging,
        backup,
        digest,
        previousDigest: digest,
      }),
    );
    renameSync(target, join(fixture.user, backup));
    cpSync(join(fixture.user, backup), target, { recursive: true });
    writeFileSync(join(target, "manual.txt"), "user replacement");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const recovered = new PluginCatalogService({
      baseDir: fixture.root,
      registry: fixture.registry,
      removeAccounts: fixture.removeAccounts,
    });
    await expect(recovered.manage({ action: "list" })).rejects.toThrow("Preserving modified");
    expect(readFileSync(join(target, "manual.txt"), "utf8")).toBe("user replacement");
    expect(existsSync(join(fixture.user, staging))).toBe(true);
    expect(existsSync(join(fixture.user, backup))).toBe(true);
    expect(existsSync(journal)).toBe(true);
  });

  it("identifies documented archive sources as unsupported", () => {
    const catalog = parsePluginMarketplace({
      name: "example",
      plugins: [
        {
          name: "archive",
          source: {
            source: "url",
            type: "zip",
            url: "https://example.org/plugin.zip",
            sha256: "a".repeat(64),
          },
        },
      ],
    });
    expect(catalog.entries[0]).toMatchObject({
      source: { type: "unsupported", kind: "archive" },
      unavailable: ["archive"],
    });
  });
});

describe("marketplace source normalization", () => {
  it("normalizes documented local, GitHub, and git-subdir source forms", () => {
    const catalog = parsePluginMarketplace({
      name: "example",
      plugins: [
        {
          name: "local",
          category: "  Developer   Tools  ",
          source: { source: "local", path: "./plugins/local" },
          policy: { authentication: "ON_INSTALL", installation: "AVAILABLE" },
        },
        {
          name: "repo",
          source: { source: "github", repo: "example/plugin", path: "plugins/repo", ref: "main" },
        },
        {
          name: "pinned",
          source: {
            source: "git-subdir",
            url: "https://example.org/plugin.git",
            path: "./plugin",
            sha: "a".repeat(40),
          },
        },
        { name: "registry", source: { source: "npm", package: "example" } },
        { name: "blocked", source: "./blocked", policy: { installation: "NOT_AVAILABLE" } },
      ],
    });
    expect(catalog.entries.map((entry) => entry.source.type)).toEqual([
      "path",
      "git",
      "git",
      "unsupported",
      "path",
    ]);
    expect(catalog.entries[0]?.category).toBe("Developer Tools");
    expect(catalog.entries[1]?.category).toBeUndefined();
    expect(catalog.entries[4]?.unavailable).toContain("installation-policy");
    expect(() =>
      parsePluginMarketplace({
        name: "bad",
        plugins: [
          {
            name: "bad",
            source: { source: "url", url: "https://user:password@example.org/repo.git" },
          },
        ],
      }),
    ).toThrow("credentials");
  });

  it("uses a catalog display name when the source format provides one", () => {
    expect(
      parsePluginMarketplace({
        name: "parser-id",
        interface: { displayName: "  Human Market  " },
        plugins: [{ name: "one", source: "./one" }],
      }).name,
    ).toBe("Human Market");
    expect(
      parsePluginMarketplace({
        name: "parser-id",
        displayName: "Top Level",
        plugins: [{ name: "one", source: "./one" }],
      }).name,
    ).toBe("Top Level");
    expect(
      parsePluginMarketplace({ name: "parser-id", plugins: [{ name: "one", source: "./one" }] })
        .name,
    ).toBe("parser-id");
  });
  it("bounds and ignores non-string categories instead of failing the catalog", () => {
    const catalog = parsePluginMarketplace({
      name: "example",
      plugins: [
        { name: "long", category: `  ${"x".repeat(120)}  `, source: "./long" },
        { name: "numeric", category: 42, source: "./numeric" },
        { name: "blank", category: "   ", source: "./blank" },
      ],
    });
    expect(catalog.entries[0]?.category).toHaveLength(80);
    expect(catalog.entries[1]?.category).toBeUndefined();
    expect(catalog.entries[2]?.category).toBeUndefined();
  });
});
