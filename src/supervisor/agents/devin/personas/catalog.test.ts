import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  devinPersonaRootsForContext,
  scanDevinPersonaCatalog,
  scanDevinPersonasForContext,
  type DevinPersonaReader,
} from "./catalog";
import type { DevinExecutionContext } from "../profileContext";

const context = (overrides: Partial<DevinExecutionContext> = {}): DevinExecutionContext =>
  Object.freeze({
    instanceId: "p",
    label: "P",
    account: { kind: "default" },
    location: { kind: "posix", path: "/project" },
    binaryIdentity: "devin",
    runtimeTarget: "local",
    configGeneration: "gen",
    roots: {
      configRoot: "/cfg",
      dataRoot: "/data",
      credentialsPath: "/data/devin/credentials.toml",
      nativeConfigPath: "/cfg/devin/config.json",
      manifestPath: "",
    },
    requiresConfigSeed: false,
    prefixArgs: [],
    generation: "gen",
    ...overrides,
  } as DevinExecutionContext);

function reader(files: Record<string, string>): DevinPersonaReader {
  return {
    async listDir(path) {
      const prefix = `${path}/`;
      const direct = new Set<string>();
      for (const key of Object.keys(files)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        direct.add(rest.includes("/") ? `${rest.split("/")[0]}/` : rest);
      }
      return [...direct];
    },
    async readFile(path) {
      const content = files[path];
      if (content === undefined) throw new Error("missing");
      return content;
    },
  };
}

const definition = (name: string, extra = "") =>
  `---\nname: ${name}\ndescription: ${name} persona\n${extra}---\nBody.`;

describe("persona catalog scan", () => {
  it("reads flat files and directory AGENT.md forms", async () => {
    const catalog = await scanDevinPersonaCatalog(
      [
        {
          origin: "project",
          scope: "project",
          path: "/repo/.devin/agents",
          precedence: 0,
        },
      ],
      reader({
        "/repo/.devin/agents/reviewer.md": definition("reviewer"),
        "/repo/.devin/agents/scout/AGENTS.md": definition("scout"),
      }),
    );
    expect(catalog.entries.map((entry) => entry.definition.id).sort()).toEqual([
      "reviewer",
      "scout",
    ]);
    // A scan is a candidate list, never a provider-confirmed load.
    expect(catalog.entries.every((entry) => entry.confirmed === false)).toBe(true);
  });

  it("prefers AGENT.md over the other directory file names", async () => {
    const catalog = await scanDevinPersonaCatalog(
      [{ origin: "project", scope: "project", path: "/r/.devin/agents", precedence: 0 }],
      reader({
        "/r/.devin/agents/duo/agents.md": definition("wrong"),
        "/r/.devin/agents/duo/AGENT.md": definition("right"),
      }),
    );
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]?.definition.id).toBe("right");
  });

  it("shadows lower-precedence same-name definitions instead of merging", async () => {
    const catalog = await scanDevinPersonaCatalog(
      [
        { origin: "project", scope: "project", path: "/r/project-agents", precedence: 0 },
        { origin: "global", scope: "global", path: "/r/global-agents", precedence: 1 },
      ],
      reader({
        "/r/project-agents/poly.md": definition("poly", "model: project-model\n"),
        "/r/global-agents/poly.md": definition("poly", "model: global-model\n"),
      }),
    );
    expect(catalog.entries).toHaveLength(2);
    const winner = catalog.entries.find((entry) => entry.root.precedence === 0);
    expect(winner?.definition.frontmatter.model).toBe("project-model");
    expect(catalog.crossRootIssues).toEqual([expect.objectContaining({ code: "duplicate-name" })]);
  });

  it("keeps malformed definitions visible with validation errors", async () => {
    const catalog = await scanDevinPersonaCatalog(
      [{ origin: "project", scope: "project", path: "/r/agents", precedence: 0 }],
      reader({ "/r/agents/broken.md": "no frontmatter here" }),
    );
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]?.validation).toEqual([
      expect.objectContaining({ severity: "error" }),
    ]);
  });

  it("marks a read-only root's entries as not editable in place", async () => {
    const catalog = await scanDevinPersonaCatalog(
      [
        {
          origin: "global",
          scope: "global",
          path: "/r/shared-agents",
          precedence: 2,
          readOnly: true,
        },
      ],
      reader({ "/r/shared-agents/ported.md": definition("ported") }),
    );
    expect(catalog.entries[0]?.root.readOnly).toBe(true);
  });

  it("scans only the documented native roots (no invented import/global roots)", () => {
    // Verified against docs.devin.ai/cli/subagents: project `.devin/agents`
    // and `.agents/agents`, global `<config>/devin/agents`. A `.claude/agents`
    // import claim has NO native loading evidence in read-config-from or the
    // subagents docs, and no `agents/agents` global root exists — both are
    // absent here rather than invented.
    const roots = devinPersonaRootsForContext(context());
    expect(roots.map((root) => [root.origin, root.path])).toEqual([
      ["global", "/cfg/devin/agents"],
      ["project", "/project/.devin/agents"],
      ["project", "/project/.agents/agents"],
    ]);
    const windows = devinPersonaRootsForContext(
      context({ location: { kind: "windows", path: "C:\\p" }, env: { APPDATA: "C:\\acct" } }),
    );
    expect(windows.map((root) => root.path)).toEqual([
      join("C:\\acct", "devin", "agents"),
      join("C:\\p", ".devin", "agents"),
      join("C:\\p", ".agents", "agents"),
    ]);
  });

  it("fails closed on WSL contexts instead of reading host paths", async () => {
    // The context's roots are Linux paths inside the distro; the host node
    // reader must never touch them. Without an injected distro-side reader
    // the scan reports unsupported instead of an empty catalog.
    const wsl = context({
      location: { kind: "wsl", distro: "Ubuntu", linuxPath: "/proj", uncPath: "\\\\wsl$" },
      env: { XDG_CONFIG_HOME: "/home/u/.local/share/Poracode/x/config" },
    });
    const outcome = await scanDevinPersonasForContext(wsl);
    expect(outcome).toMatchObject({ status: "unsupported-environment" });
    // An explicit reader (a future qualified distro-side reader, or a test
    // double) is allowed through.
    const withReader = await scanDevinPersonasForContext(
      wsl,
      reader({ "/proj/.devin/agents/pair.md": definition("pair") }),
    );
    expect(withReader).toMatchObject({ status: "ok" });
    if (withReader.status !== "ok") return;
    expect(withReader.catalog.entries[0]?.definition.id).toBe("pair");
    // POSIX contexts scan with the node reader normally.
    const posix = await scanDevinPersonasForContext(context());
    expect(posix.status).toBe("ok");
  });

  it("resolves scan roots from the context's own redirected environment", () => {
    const roots = devinPersonaRootsForContext(context({ env: { XDG_CONFIG_HOME: "/acct/cfg" } }));
    expect(roots.find((r) => r.origin === "global")?.path).toBe("/acct/cfg/devin/agents");
    const windows = devinPersonaRootsForContext(
      context({
        location: { kind: "windows", path: "C:\\p" },
        env: { APPDATA: "C:\\acct" },
      }),
    );
    expect(windows.find((r) => r.origin === "global")?.path).toBe(
      join("C:\\acct", "devin", "agents"),
    );
  });

  it("uses the native global, project, then standard-root collision order", async () => {
    // Real native children were run with conflicting read-only/empty tool
    // restrictions: global wins over both project roots, and .devin wins
    // over .agents when no global definition exists.
    const roots = devinPersonaRootsForContext(context());
    const files = {
      "/cfg/devin/agents/shared.md": definition("shared", "model: global-model\n"),
      "/project/.devin/agents/shared.md": definition("shared", "model: project-model\n"),
      "/project/.agents/agents/shared.md": definition("shared", "model: standard-model\n"),
    };
    const catalog = await scanDevinPersonaCatalog(roots, reader(files));
    expect(catalog.entries.map((entry) => entry.definition.frontmatter.model)).toEqual([
      "global-model",
      "project-model",
      "standard-model",
    ]);
    expect(catalog.crossRootIssues).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("shadowed by /cfg/devin/agents/shared.md"),
      }),
      expect.objectContaining({
        message: expect.stringContaining("shadowed by /cfg/devin/agents/shared.md"),
      }),
    ]);
    const projectOnly = await scanDevinPersonaCatalog(
      roots,
      reader({
        "/project/.devin/agents/shared.md": files["/project/.devin/agents/shared.md"],
        "/project/.agents/agents/shared.md": files["/project/.agents/agents/shared.md"],
      }),
    );
    expect(projectOnly.entries[0]?.definition.frontmatter.model).toBe("project-model");
    expect(projectOnly.crossRootIssues).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("shadowed by /project/.devin/agents/shared.md"),
      }),
    ]);
  });

  it("keeps the truncation flag honest for an exactly-fitting catalog", async () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 6; index += 1) {
      files[`/r/agents/p${index}.md`] = definition(`p${index}`);
    }
    const catalog = await scanDevinPersonaCatalog(
      [{ origin: "project", scope: "project", path: "/r/agents", precedence: 0 }],
      reader(files),
    );
    // Everything fit inside the bounds: no projected truncation, no warning —
    // the flag must never be a constant true.
    expect(catalog.truncated).toBe(false);
    expect(catalog.crossRootIssues.some((issue) => issue.code === "scan-truncated")).toBe(false);
  });

  it("refuses to read an oversized definition when stat is available first", async () => {
    const oversized = "x".repeat(300 * 1024);
    let reads = 0;
    const catalog = await scanDevinPersonaCatalog(
      [{ origin: "project", scope: "project", path: "/r/agents", precedence: 0 }],
      {
        listDir: async () => ["huge.md"],
        readFile: async () => {
          reads += 1;
          return oversized;
        },
        byteLength: async () => oversized.length,
      },
    );
    // The byte bound is checked BEFORE the content read materializes.
    expect(reads).toBe(0);
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]?.validation).toEqual([
      expect.objectContaining({ severity: "error" }),
    ]);
    expect(catalog.truncated).toBe(false);
  });

  it("stops scanning at the name and read bounds and marks the remainder", async () => {
    // Drive the internal bounds through a stress fixture: 5001 names exceed
    // MAX_SCANNED_NAMES (4000), so the scan must stop and report the remainder
    // instead of silently listing a shorter catalog.
    const names = Array.from({ length: 4200 }, (_, index) => `p${index}.md`);
    const catalog = await scanDevinPersonaCatalog(
      [{ origin: "project", scope: "project", path: "/r/agents", precedence: 0 }],
      {
        listDir: async () => names,
        readFile: async () => definition("bulk"),
      },
    );
    expect(catalog.truncated).toBe(true);
    expect(catalog.entries.length).toBeLessThanOrEqual(500);
    // The truncation warning is present; the identical bulk names also
    // surface as cross-root duplicates beside it.
    expect(catalog.crossRootIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "scan-truncated", severity: "warning" }),
      ]),
    );
  });

  it("stops at the read bound before materializing unbounded bytes", async () => {
    // Directories with no persona files burn read attempts (4 per name); the
    // read cap must stop the scan and report the remainder.
    const names = Array.from({ length: 600 }, (_, index) => `dir${index}/`);
    let reads = 0;
    const catalog = await scanDevinPersonaCatalog(
      [{ origin: "project", scope: "project", path: "/r/agents", precedence: 0 }],
      {
        listDir: async () => names,
        readFile: async () => {
          reads += 1;
          throw new Error("missing");
        },
      },
    );
    expect(reads).toBeLessThanOrEqual(1000);
    expect(catalog.truncated).toBe(true);
    expect(catalog.crossRootIssues).toEqual([expect.objectContaining({ code: "scan-truncated" })]);
  });
});
