import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildDevinProfileSeedConfig,
  devinConfigNeedsVariantMapping,
  DevinCatalogUnavailableError,
  effectiveDevinUserConfigPath,
  prepareDevinProfileLaunch,
  prepareDevinProfileMcpOverlay,
  resolveDevinLaunchModel as resolveLaunchForOwner,
  resolveDevinOneShotModel as resolveOneShotForOwner,
} from "./launchContext";
import { parseDevinModelCatalog } from "./models";
import type { DevinExecutionContext } from "./profileContext";
import type { DevinModelFamily } from "./models";

const terminalOwner = { agentKind: "devin", presentationMode: "terminal" as const };
const resolveDevinLaunchModel = (
  families: Parameters<typeof resolveLaunchForOwner>[0],
  config: Parameters<typeof resolveLaunchForOwner>[1],
) => resolveLaunchForOwner(families, config, terminalOwner);
const resolveDevinOneShotModel = (
  families: Parameters<typeof resolveOneShotForOwner>[0],
  selection: Parameters<typeof resolveOneShotForOwner>[1],
) => resolveOneShotForOwner(families, selection, terminalOwner);

// Exact fixture rows from models.test.ts. The variant ids are opaque UIDs —
// only the loaded catalog classifies them, never id syntax.
const regularFamilies = parseDevinModelCatalog(
  JSON.stringify({
    families: [
      {
        family_label: "GPT-5.6 Sol",
        slug: "gpt-5.6-sol",
        variants: [
          { model_uid: "gpt-5-6-sol-medium", label: "GPT-5.6 Sol Medium Thinking" },
          { model_uid: "gpt-5-6-sol-none", label: "GPT-5.6 Sol No Thinking" },
          { model_uid: "gpt-5-6-sol-medium-priority", label: "GPT-5.6 Sol Medium Thinking Fast" },
          { model_uid: "gpt-5-6-sol-none-priority", label: "GPT-5.6 Sol No Thinking Fast" },
        ],
      },
      {
        family_label: "Claude Opus 4.5",
        slug: "claude-opus-4.5",
        variants: [
          { model_uid: "MODEL_CLAUDE_4_5_OPUS", label: "Claude Opus 4.5" },
          { model_uid: "MODEL_CLAUDE_4_5_OPUS_THINKING", label: "Claude Opus 4.5 Thinking" },
        ],
      },
      {
        family_label: "GLM-5.2",
        slug: "glm-5.2",
        variants: [
          { model_uid: "glm-5-2", label: "GLM-5.2 High" },
          { model_uid: "glm-5-2-max", label: "GLM-5.2 Max" },
          { model_uid: "glm-5-2-max-1m", label: "GLM-5.2 Max 1M" },
        ],
      },
    ],
  }),
);

// A catalog-proven composite pair (Fusion): the `composite` label is positive
// evidence that the pair id is the complete selection for inert seeds.
const fusionFamilies: DevinModelFamily[] = [
  {
    id: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
    label: "Fusion",
    variants: [
      {
        id: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
        label: "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)",
        effort: "",
        fast: false,
        thinking: false,
        context: "default",
        composite: "(Claude Fable 5.1 Medium + SWE-2 Medium)",
      },
    ],
  },
];

const family = (
  id: string,
  variants: Array<Partial<DevinModelFamily["variants"][number]>>,
): DevinModelFamily => ({
  id,
  label: id,
  variants: variants.map((variant) => ({
    id: variant.id ?? id,
    effort: variant.effort ?? "",
    fast: variant.fast ?? false,
    thinking: variant.thinking ?? false,
    context: variant.context ?? "default",
  })),
});

describe("catalog launch fallback policy", () => {
  it("needs mapping only when an unresolved control accompanies a model", () => {
    expect(devinConfigNeedsVariantMapping({ model: "fam" })).toBe(false);
    expect(devinConfigNeedsVariantMapping({ model: "fam", effort: "high" })).toBe(true);
    expect(devinConfigNeedsVariantMapping({ model: "fam", fast: false })).toBe(true);
    expect(devinConfigNeedsVariantMapping({ model: "fam", thinking: true })).toBe(true);
    expect(devinConfigNeedsVariantMapping({ model: "fam", contextSize: "1m" })).toBe(true);
    // OFF/default seeds count too: on regular families they are real pins.
    expect(devinConfigNeedsVariantMapping({ model: "fam", effort: "default" })).toBe(true);
    expect(devinConfigNeedsVariantMapping({ model: "fam", thinking: false })).toBe(true);
    expect(devinConfigNeedsVariantMapping({ model: "fam", contextSize: "default" })).toBe(true);
    // Empty strings inherit the selected variant warm — never a "default".
    expect(devinConfigNeedsVariantMapping({ model: "fam", effort: "" })).toBe(false);
    expect(devinConfigNeedsVariantMapping({ model: "fam", contextSize: "" })).toBe(false);
    expect(devinConfigNeedsVariantMapping({ model: "", effort: "high" })).toBe(false);
  });

  it("passes raw ids through when the catalog is unavailable and nothing needs mapping", () => {
    expect(resolveDevinLaunchModel(undefined, { model: "swe-1-6-fast" })).toBe("swe-1-6-fast");
    expect(resolveDevinLaunchModel([], { model: "family-alias" })).toBe("family-alias");
  });

  it("fails visibly instead of silently downgrading explicit effort on a cold catalog", () => {
    expect(() => resolveDevinLaunchModel(undefined, { model: "swe", effort: "high" })).toThrowError(
      DevinCatalogUnavailableError,
    );
    expect(() => resolveDevinOneShotModel(undefined, { model: "swe", fast: true })).toThrowError(
      DevinCatalogUnavailableError,
    );
  });

  it("still fails visibly for every unresolved control shape on a cold catalog", () => {
    for (const config of [
      { model: "swe", effort: "high" },
      { model: "swe", effort: "default" },
      { model: "swe", fast: true },
      { model: "swe", fast: false },
      { model: "swe", thinking: true },
      { model: "swe", thinking: false },
      { model: "swe", contextSize: "1m" },
      { model: "swe", contextSize: "default" },
    ]) {
      expect(() => resolveDevinLaunchModel(undefined, config)).toThrowError(
        DevinCatalogUnavailableError,
      );
    }
    expect(() => resolveDevinOneShotModel(undefined, { model: "swe", effort: "max" })).toThrowError(
      DevinCatalogUnavailableError,
    );
    expect(() => resolveDevinOneShotModel(undefined, { model: "swe", fast: false })).toThrowError(
      DevinCatalogUnavailableError,
    );
  });

  it("passes raw ids with no unresolved controls through a cold catalog (plan Q35)", () => {
    // The catalog-outage fix stays scoped to selections that are fully
    // concrete without any control: a raw id or alias launches verbatim, a
    // native-default (empty) model still resolves to nothing for the caller
    // to omit, and empty-string effort/context inherit the selected variant
    // warm so they never demand the catalog. "" and "default" are distinct
    // values; only "" inherits.
    expect(resolveDevinLaunchModel(undefined, { model: "swe-1-6-fast" })).toBe("swe-1-6-fast");
    expect(resolveDevinLaunchModel([], { model: "family-alias" })).toBe("family-alias");
    expect(resolveDevinLaunchModel(undefined, { model: "" })).toBeUndefined();
    expect(resolveDevinLaunchModel([], { model: "" })).toBeUndefined();
    expect(
      resolveDevinLaunchModel(undefined, { model: "opaque-raw", effort: "", contextSize: "" }),
    ).toBe("opaque-raw");
    expect(resolveDevinOneShotModel(undefined, { model: "swe-1-6-fast", effort: "" })).toBe(
      "swe-1-6-fast",
    );
  });

  it.each([
    [
      "thinking off",
      { model: "MODEL_CLAUDE_4_5_OPUS_THINKING", thinking: false },
      "MODEL_CLAUDE_4_5_OPUS",
    ],
    ["fast off", { model: "gpt-5-6-sol-medium-priority", fast: false }, "gpt-5-6-sol-medium"],
    ["context default", { model: "glm-5-2-max-1m", contextSize: "default" }, "glm-5-2-max"],
  ] as const)(
    "resolves an explicit %s pin to its plain sibling warm and fails typed cold (plan Q35 correction)",
    (_name, config, sibling) => {
      // models.test.ts pins an explicit `false`/`"default"` as a REAL
      // selection on a regular family: warm it lands on the plain sibling.
      expect(resolveDevinLaunchModel(regularFamilies, config)).toBe(sibling);
      // Without the catalog the pin cannot be honored, so the launch fails
      // typed for both outage shapes instead of silently running the stored
      // id, whose semantics differ from what was picked.
      for (const unavailable of [undefined, []]) {
        expect(() => resolveDevinLaunchModel(unavailable, config)).toThrowError(
          DevinCatalogUnavailableError,
        );
      }
    },
  );

  it("resolves a Fast-off one-shot to the plain variant warm and fails typed cold", () => {
    const input = { model: "gpt-5-6-sol-medium-priority", fast: false };
    expect(resolveDevinOneShotModel(regularFamilies, input)).toBe("gpt-5-6-sol-medium");
    for (const unavailable of [undefined, []]) {
      expect(() => resolveDevinOneShotModel(unavailable, input)).toThrowError(
        DevinCatalogUnavailableError,
      );
    }
  });

  it("treats nonempty 'default' effort as unresolved, never as an inert seed", () => {
    const config = { model: "gpt-5-6-sol-medium", effort: "default" };
    for (const unavailable of [undefined, []]) {
      expect(() => resolveDevinLaunchModel(unavailable, config)).toThrowError(
        DevinCatalogUnavailableError,
      );
    }
    expect(() => resolveDevinLaunchModel(regularFamilies, config)).toThrowError(
      /Unsupported model configuration/,
    );
    expect(() =>
      resolveDevinOneShotModel(undefined, { model: "swe-1-6-fast", effort: "default" }),
    ).toThrowError(DevinCatalogUnavailableError);
  });

  it("resolves a catalog-proven composite verbatim for inert seeds and fails typed cold", () => {
    // Positive catalog evidence: the composite branch returns the exact pair.
    const config = {
      model: "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
    };
    expect(resolveDevinLaunchModel(fusionFamilies, config)).toBe(
      "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium",
    );
    // Without the catalog the opaque UID cannot be classified: the OFF seeds
    // stay unresolved controls, so a restored composite pick fails typed
    // instead of launching an unverified selection.
    for (const unavailable of [undefined, []]) {
      expect(() => resolveDevinLaunchModel(unavailable, config)).toThrowError(
        DevinCatalogUnavailableError,
      );
    }
  });

  it("resolves known variants when the catalog is warm", () => {
    const families = [
      family("fam", [
        { id: "fam-medium", effort: "medium" },
        { id: "fam-high", effort: "high" },
      ]),
    ];
    expect(resolveDevinLaunchModel(families, { model: "fam", effort: "high" })).toBe("fam-high");
    // Unmappable explicit combos keep throwing (typed, visible).
    expect(() =>
      resolveDevinLaunchModel([family("fam", [{ id: "fam-medium", effort: "medium" }])], {
        model: "fam",
        effort: "max",
      }),
    ).toThrowError(/Unsupported model configuration/);
  });
});

describe("profile config view seeding", () => {
  it("preserves unknown keys and sets the org under devin", () => {
    const seeded = buildDevinProfileSeedConfig(
      JSON.stringify({ version: 1, theme_mode: "dark", devin: { org_id: "org-old", keep: 1 } }),
      "org-new",
    );
    const parsed = JSON.parse(seeded);
    expect(parsed).toMatchObject({
      version: 1,
      theme_mode: "dark",
      devin: { org_id: "org-new", keep: 1 },
    });
  });

  it("fails closed on a default config that exists but does not parse", () => {
    // A malformed policy is never silently replaced by a minimal `{}` view:
    // the seed throws and the launch reports it instead of running with the
    // user's effective settings stripped out.
    expect(() => buildDevinProfileSeedConfig("{ not json !!!", "org-x")).toThrowError(
      /JSON|object/i,
    );
    expect(() => buildDevinProfileSeedConfig("[1, 2]", "org-x")).toThrowError(/not a JSON object/);
    // Only a missing file legitimately seeds a minimal
    // config — there is no policy to lose.
    expect(JSON.parse(buildDevinProfileSeedConfig(undefined, "org-y")).devin).toEqual({
      org_id: "org-y",
    });
    for (const content of ["   ", '{"devin":null}', '{"devin":[]}', '{"version":"1"}']) {
      expect(() => buildDevinProfileSeedConfig(content, "org-z")).toThrowError(/config/);
    }
  });

  it("writes the seeded view into the context's config root and stays idempotent", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-seed-"));
    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = join(base, "default-config");
    await mkdir(join(base, "default-config", "devin"), { recursive: true });
    await writeFile(
      join(base, "default-config", "devin", "config.json"),
      '// user comment\n{ "theme_mode": "dark" }',
    );
    try {
      const context = {
        orgId: "org-7",
        requiresConfigSeed: true,
        location: { kind: "posix" as const, path: "/p" },
        roots: {
          configRoot: join(base, "view"),
          dataRoot: join(base, "data"),
          credentialsPath: join(base, "data", "devin", "credentials.toml"),
          nativeConfigPath: join(base, "view", "devin", "config.json"),
          manifestPath: "",
        },
      } as DevinExecutionContext;
      await prepareDevinProfileLaunch(context);
      const seeded = JSON.parse(await readFile(join(base, "view", "devin", "config.json"), "utf8"));
      expect(seeded).toMatchObject({ theme_mode: "dark", devin: { org_id: "org-7" } });
      // The user's native default config is never rewritten.
      const raw = await readFile(join(base, "default-config", "devin", "config.json"), "utf8");
      expect(raw).toContain("// user comment");
      // Second launch with the same org does not rewrite the view.
      const first = await readFile(join(base, "view", "devin", "config.json"), "utf8");
      await prepareDevinProfileLaunch(context);
      expect(await readFile(join(base, "view", "devin", "config.json"), "utf8")).toBe(first);
      // A no-seed context is a no-op.
      await prepareDevinProfileLaunch({
        ...context,
        requiresConfigSeed: false,
      } as DevinExecutionContext);
    } finally {
      if (original === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = original;
    }
  });

  it("links the source root's resources into the view so redirection hides nothing", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-mirror-"));
    try {
      const sourceRoot = join(base, "native-config");
      await mkdir(join(sourceRoot, "devin", "skills"), { recursive: true });
      await mkdir(join(sourceRoot, "cognition"), { recursive: true });
      await writeFile(join(sourceRoot, "devin", "config.json"), JSON.stringify({ version: 1 }));
      await writeFile(join(sourceRoot, "devin", "skills", "SKILL.md"), "native skill");
      await writeFile(join(sourceRoot, "cognition", "keep.txt"), "cognition resource");
      const context = {
        orgId: "org-2",
        requiresConfigSeed: true,
        configViewSource: sourceRoot,
        location: { kind: "posix" as const, path: "/p" },
        roots: {
          configRoot: join(base, "view"),
          dataRoot: base,
          credentialsPath: join(base, "devin", "credentials.toml"),
          nativeConfigPath: join(base, "view", "devin", "config.json"),
          manifestPath: "",
        },
      } as DevinExecutionContext;
      await prepareDevinProfileLaunch(context);
      // Sibling directories and devin subresources are linked in verbatim.
      expect(await readFile(join(base, "view", "cognition", "keep.txt"), "utf8")).toBe(
        "cognition resource",
      );
      expect(await readFile(join(base, "view", "devin", "skills", "SKILL.md"), "utf8")).toBe(
        "native skill",
      );
      // The seeded config stays a real file, not a link to the user's config.
      const seeded = await readFile(join(base, "view", "devin", "config.json"), "utf8");
      expect(JSON.parse(seeded)).toMatchObject({ version: 1, devin: { org_id: "org-2" } });
      // Idempotent: re-seeding does not duplicate or remove the links.
      await prepareDevinProfileLaunch(context);
      expect((await readdir(join(base, "view"))).sort()).toEqual(["cognition", "devin"]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("effective user config path", () => {
  it("prefers the explicit config, then the redirected view, then the native default", () => {
    const context = (
      env: Record<string, string> | undefined,
      configPath?: string,
      location: DevinExecutionContext["location"] = { kind: "posix", path: "/project" },
    ) =>
      ({
        env,
        location,
        ...(configPath !== undefined ? { configPath } : {}),
        roots: {},
      }) as unknown as DevinExecutionContext;
    expect(effectiveDevinUserConfigPath(undefined)).toContain(
      join(".config", "devin", "config.json"),
    );
    expect(effectiveDevinUserConfigPath(context({ XDG_CONFIG_HOME: "/view" }))).toBe(
      join("/view", "devin", "config.json"),
    );
    // A WSL profile's redirected view is a Linux path: joined POSIX-style even
    // when this test runs on any host (never backslashed).
    expect(
      effectiveDevinUserConfigPath(
        context({ XDG_CONFIG_HOME: "/home/u/.local/share/Poracode/x/config" }, undefined, {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/u/proj",
          uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\proj",
        }),
      ),
    ).toBe("/home/u/.local/share/Poracode/x/config/devin/config.json");
    expect(effectiveDevinUserConfigPath(context({ APPDATA: "C:\\root" }))).toBe(
      join("C:\\root", "devin", "config.json"),
    );
    expect(effectiveDevinUserConfigPath(context({ XDG_CONFIG_HOME: "/view" }, "~/own.json"))).toBe(
      "~/own.json",
    );
  });

  it("resolves a WSL default account to the distro-side XDG expression, never the host root", () => {
    // The native default inside the distro is resolved by the DISTRO's own
    // XDG_CONFIG_HOME/HOME: the controlled shell-expansion expression from
    // devinDefaultRoots. A HOST-resolved default root would read the wrong
    // machine's config (effective-org binding and volatile catalog scope
    // both consume this path).
    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/host-sentinel/.config";
    try {
      const context = {
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/u/proj",
          uncPath: "\\\\wsl$\\Ubuntu\\home\\u\\proj",
        },
        roots: {},
      } as unknown as DevinExecutionContext;
      expect(effectiveDevinUserConfigPath(context)).toBe(
        "${XDG_CONFIG_HOME:-$HOME/.config}/devin/config.json",
      );
      // An explicit user path still wins and stays a literal.
      expect(effectiveDevinUserConfigPath({ ...context, configPath: "/home/u/own.json" })).toBe(
        "/home/u/own.json",
      );
    } finally {
      if (original === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = original;
    }
  });
});

describe("private profile MCP overlay", () => {
  it("mirrors the redirected config root and merges injected servers", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-overlay-"));
    try {
      const configRoot = join(base, "account", "config");
      await mkdir(join(configRoot, "devin", "skills"), { recursive: true });
      await writeFile(join(configRoot, "devin", "skills", "S.md"), "account skill");
      await writeFile(
        join(configRoot, "devin", "mcp_config.json"),
        JSON.stringify({ mcpServers: { existing: { command: "echo" } } }),
      );
      const context = {
        env: { XDG_CONFIG_HOME: configRoot, XDG_DATA_HOME: join(base, "account", "data") },
        roots: {},
      } as unknown as DevinExecutionContext;
      const overlay = await prepareDevinProfileMcpOverlay({ kind: "posix", path: "/p" }, context, [
        { name: "injected", transport: { type: "stdio", command: "run" } } as never,
      ]);
      expect(overlay).toBeDefined();
      if (!overlay) return;
      expect(overlay.env.XDG_CONFIG_HOME).not.toBe(configRoot);
      const merged = JSON.parse(
        await readFile(join(overlay.env.XDG_CONFIG_HOME!, "devin", "mcp_config.json"), "utf8"),
      );
      expect(Object.keys(merged.mcpServers).sort()).toEqual(["existing", "injected"]);
      // Account resources survive the redirect.
      expect(
        await readFile(join(overlay.env.XDG_CONFIG_HOME!, "devin", "skills", "S.md"), "utf8"),
      ).toBe("account skill");
      // The credential root is untouched: only XDG_CONFIG_HOME is overlaid.
      expect(overlay.env.XDG_DATA_HOME).toBeUndefined();
      await overlay.cleanup();
      await expect(
        readFile(join(overlay.env.XDG_CONFIG_HOME!, "devin", "mcp_config.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("is unavailable without a redirected root or on WSL", async () => {
    const context = { roots: {} } as unknown as DevinExecutionContext;
    expect(
      await prepareDevinProfileMcpOverlay({ kind: "posix", path: "/p" }, context, []),
    ).toBeUndefined();
    expect(
      await prepareDevinProfileMcpOverlay(
        { kind: "wsl", distro: "Ubuntu", linuxPath: "/p", uncPath: "\\\\wsl$" },
        { env: { XDG_CONFIG_HOME: "/view" }, roots: {} } as unknown as DevinExecutionContext,
        [],
      ),
    ).toBeUndefined();
  });

  it("fails the seed as a policy error when the account's MCP catalog is unparseable", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-overlay-bad-"));
    try {
      const configRoot = join(base, "account", "config");
      await mkdir(join(configRoot, "devin"), { recursive: true });
      await writeFile(join(configRoot, "devin", "mcp_config.json"), "{ not json !!!");
      const context = {
        env: { XDG_CONFIG_HOME: configRoot },
        roots: {},
      } as unknown as DevinExecutionContext;
      await expect(
        prepareDevinProfileMcpOverlay({ kind: "posix", path: "/p" }, context, []),
      ).rejects.toMatchObject({ name: "DevinProfilePolicyError" });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("config read absence policy", () => {
  const seedContext = (base: string, configViewSource?: string) =>
    ({
      orgId: "org-9",
      requiresConfigSeed: true,
      ...(configViewSource !== undefined ? { configViewSource } : {}),
      location: { kind: "posix" as const, path: "/p" },
      roots: {
        configRoot: join(base, "view"),
        dataRoot: join(base, "data"),
        credentialsPath: join(base, "data", "devin", "credentials.toml"),
        nativeConfigPath: join(base, "view", "devin", "config.json"),
        manifestPath: "",
      },
    }) as DevinExecutionContext;

  it("treats only ENOENT as absent: an unreadable existing view fails instead of reseeding", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-enoent-"));
    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = join(base, "default-config");
    try {
      const context = seedContext(base);
      await mkdir(join(base, "view", "devin"), { recursive: true });
      await writeFile(join(base, "view", "devin", "config.json"), "{ broken policy");
      await chmod(join(base, "view", "devin", "config.json"), 0o000);
      // An existing view that cannot be READ is not an absent view: seeding
      // over it would replace the account's effective policy with a minimal
      // org-only file. The launch fails visibly instead.
      await expect(prepareDevinProfileLaunch(context)).rejects.toMatchObject({
        name: "DevinProfilePolicyError",
      });
      await chmod(join(base, "view", "devin", "config.json"), 0o644);
      expect(await readFile(join(base, "view", "devin", "config.json"), "utf8")).toBe(
        "{ broken policy",
      );
    } finally {
      if (original === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = original;
      await rm(base, { recursive: true, force: true });
    }
  });

  it("treats an unreadable snapshot source as a policy failure, not an empty account", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-src-"));
    try {
      const sourceRoot = join(base, "owner-config");
      await mkdir(join(sourceRoot, "devin"), { recursive: true });
      await writeFile(join(sourceRoot, "devin", "config.json"), '{"theme_mode":"dark"}');
      await chmod(join(sourceRoot, "devin", "config.json"), 0o000);
      await expect(prepareDevinProfileLaunch(seedContext(base, sourceRoot))).rejects.toMatchObject({
        name: "DevinProfilePolicyError",
      });
      // Nothing was seeded over the unreadable source.
      await expect(readdir(join(base, "view"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("seeds from an absent source file without inventing policy", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-absent-"));
    const original = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = join(base, "default-config");
    try {
      await prepareDevinProfileLaunch(seedContext(base));
      const seeded = JSON.parse(await readFile(join(base, "view", "devin", "config.json"), "utf8"));
      expect(seeded).toEqual({ version: 1, devin: { org_id: "org-9" } });
    } finally {
      if (original === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = original;
      await rm(base, { recursive: true, force: true });
    }
  });

  it("retains native edits in an existing view when changing its organization", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-org-policy-"));
    try {
      const sourceRoot = join(base, "source");
      const target = join(base, "view", "devin", "config.json");
      await mkdir(join(sourceRoot, "devin"), { recursive: true });
      await mkdir(join(base, "view", "devin"), { recursive: true });
      await writeFile(join(sourceRoot, "devin", "config.json"), '{"permissions":{"deny":[]}}');
      await writeFile(
        target,
        JSON.stringify({
          version: 1,
          permissions: { deny: ["fixture-policy"] },
          extra: { preserve: true },
          devin: { org_id: "old-org", native_setting: "keep" },
        }),
      );
      await prepareDevinProfileLaunch(seedContext(base, sourceRoot));
      expect(JSON.parse(await readFile(target, "utf8"))).toEqual({
        version: 1,
        permissions: { deny: ["fixture-policy"] },
        extra: { preserve: true },
        devin: { org_id: "org-9", native_setting: "keep" },
      });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("never overwrites a readable corrupt or type-invalid derived view", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-corrupt-view-"));
    try {
      const target = join(base, "view", "devin", "config.json");
      await mkdir(join(base, "view", "devin"), { recursive: true });
      for (const content of [
        "{ corrupt",
        "",
        '{"devin":false}',
        '{"version":"1","devin":{"org_id":"org-9"}}',
      ]) {
        await writeFile(target, content);
        await expect(prepareDevinProfileLaunch(seedContext(base))).rejects.toMatchObject({
          name: "DevinProfilePolicyError",
        });
        expect(await readFile(target, "utf8")).toBe(content);
      }
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

it("resolves a complete one-shot tuple warm and fails typed cold for thinking and context pins", () => {
  // The one-shot resolver consumes the same complete carrier set as the
  // launch lane: present thinking/context pins land on the plain sibling
  // warm and refuse typed cold — never a silent reduction.
  const withThinking = { model: "MODEL_CLAUDE_4_5_OPUS_THINKING", thinking: false };
  expect(resolveDevinOneShotModel(regularFamilies, withThinking)).toBe("MODEL_CLAUDE_4_5_OPUS");
  for (const unavailable of [undefined, []]) {
    expect(() => resolveDevinOneShotModel(unavailable, withThinking)).toThrowError(
      DevinCatalogUnavailableError,
    );
  }
  const withContext = { model: "glm-5-2-max-1m", contextSize: "default" };
  expect(resolveDevinOneShotModel(regularFamilies, withContext)).toBe("glm-5-2-max");
  for (const unavailable of [undefined, []]) {
    expect(() => resolveDevinOneShotModel(unavailable, withContext)).toThrowError(
      DevinCatalogUnavailableError,
    );
  }
  // An empty context string inherits and needs nothing cold.
  expect(resolveDevinOneShotModel(undefined, { model: "swe-1-6-fast", contextSize: "" })).toBe(
    "swe-1-6-fast",
  );
});
