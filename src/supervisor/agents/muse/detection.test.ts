import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const readAgentCommandOutputMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>>(),
);

const probeMuseModelCatalogMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(),
);

vi.mock("../base", async () => {
  const actual = await vi.importActual<typeof import("../base")>("../base");
  return { ...actual, readAgentCommandOutput: readAgentCommandOutputMock };
});

vi.mock("./msp/probe", async () => {
  const actual = await vi.importActual<typeof import("./msp/probe")>("./msp/probe");
  return { ...actual, probeMuseModelCatalog: probeMuseModelCatalogMock };
});

import {
  buildMuseCatalogCapabilities,
  buildMuseProbedCapabilities,
  humanizeMuseModelLabel,
  MUSE_DEFAULT_MODEL_ID,
  museAuthJsonIsAuthenticated,
  museDefaultCapabilities,
  museDetectionSpec,
  museHasStoredCredentials,
  parseMuseHelpEfforts,
  parseMuseHelpModelIds,
  parseMuseSkillCommands,
} from "./detection";

describe("museAuthJsonIsAuthenticated", () => {
  it("returns true when providers is a non-empty object", () => {
    expect(
      museAuthJsonIsAuthenticated(
        JSON.stringify({ schema_version: 1, providers: { meta: { api_key: "secret" } } }),
      ),
    ).toBe(true);
  });

  it("returns false when providers is empty or missing", () => {
    expect(museAuthJsonIsAuthenticated(JSON.stringify({ schema_version: 1, providers: {} }))).toBe(
      false,
    );
    expect(museAuthJsonIsAuthenticated(JSON.stringify({ schema_version: 1 }))).toBe(false);
    expect(museAuthJsonIsAuthenticated(undefined)).toBe(false);
    expect(museAuthJsonIsAuthenticated("")).toBe(false);
    expect(museAuthJsonIsAuthenticated("not-json")).toBe(false);
  });

  it("never depends on config-dir existence alone", () => {
    // An empty providers map is the never-signed-in shape after first run.
    expect(museAuthJsonIsAuthenticated('{"schema_version":1,"providers":{}}')).toBe(false);
  });
});

describe("museHasStoredCredentials (temp dir, never touches ~/.config/muse)", () => {
  let configRoot: string;
  let previousXdg: string | undefined;
  let previousAuthPath: string | undefined;
  const location = { kind: "posix", path: "/tmp/muse-proj" } as ProjectLocation;

  beforeEach(() => {
    configRoot = mkdtempSync(join(tmpdir(), "muse-config-"));
    previousXdg = process.env["XDG_CONFIG_HOME"];
    previousAuthPath = process.env["MUSE_AUTH_PATH"];
    delete process.env["MUSE_AUTH_PATH"];
    process.env["XDG_CONFIG_HOME"] = configRoot;
  });

  afterEach(() => {
    if (previousXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
    else process.env["XDG_CONFIG_HOME"] = previousXdg;
    if (previousAuthPath === undefined) delete process.env["MUSE_AUTH_PATH"];
    else process.env["MUSE_AUTH_PATH"] = previousAuthPath;
    rmSync(configRoot, { recursive: true, force: true });
  });

  it("reports missing when auth.json is absent", () => {
    expect(museHasStoredCredentials(location)).toBe(false);
  });

  it("reports missing when providers is empty", () => {
    mkdirSync(join(configRoot, "muse"), { recursive: true });
    writeFileSync(
      join(configRoot, "muse", "auth.json"),
      JSON.stringify({ schema_version: 1, providers: {} }),
    );
    expect(museHasStoredCredentials(location)).toBe(false);
  });

  it("reports authenticated when providers has an entry (key names only)", () => {
    mkdirSync(join(configRoot, "muse"), { recursive: true });
    writeFileSync(
      join(configRoot, "muse", "auth.json"),
      JSON.stringify({
        schema_version: 1,
        providers: { meta: { obtained_via: "login" } },
      }),
    );
    expect(museHasStoredCredentials(location)).toBe(true);
  });

  it("honors the launcher's MUSE_AUTH_PATH override", () => {
    const authPath = join(configRoot, "custom", "credentials.json");
    mkdirSync(join(configRoot, "custom"), { recursive: true });
    writeFileSync(authPath, JSON.stringify({ schema_version: 1, providers: { meta: {} } }));
    process.env["MUSE_AUTH_PATH"] = authPath;

    expect(museHasStoredCredentials(location)).toBe(true);
  });
});

describe("museDetectionSpec", () => {
  beforeEach(() => {
    readAgentCommandOutputMock.mockResolvedValue({ ok: true, stdout: "", stderr: "" });
    probeMuseModelCatalogMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });
  it("declares identity, login, and version probe", () => {
    expect(museDetectionSpec.kind).toBe("muse");
    expect(museDetectionSpec.label).toBe("Muse Code");
    expect(museDetectionSpec.binary).toBe("muse");
    expect(museDetectionSpec.loginCommand).toBe("muse login");
    expect(museDetectionSpec.versionArgs).toEqual(["--version"]);
    expect(museDetectionSpec.baseSpawnEnv).toEqual({ MUSE_NO_AUTO_UPDATE: "1" });
  });

  it("ships installer-only update (no npm, no builtIn)", () => {
    expect(museDetectionSpec.update?.npm).toBeUndefined();
    expect(museDetectionSpec.update?.builtIn).toBeUndefined();
    expect(museDetectionSpec.update?.installer?.posix).toEqual({
      binary: "sh",
      args: ["-c", "curl -fsSL https://dev.meta.ai/install.sh | bash"],
    });
    expect(museDetectionSpec.update?.installer?.windows).toEqual({
      binary: "wsl.exe",
      args: [
        "--exec",
        "bash",
        "-lc",
        "if command -v curl >/dev/null 2>&1; then set -o pipefail; curl -fsSL https://dev.meta.ai/install.sh | bash; else exit 127; fi",
      ],
    });
  });

  it("advertises a terminal login method via capabilitiesProbe", async () => {
    expect(typeof museDetectionSpec.capabilitiesProbe).toBe("function");
    const result = await museDetectionSpec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/tmp" },
      executablePath: "/usr/bin/muse",
    });
    expect(result?.authMethods).toEqual([
      { id: "muse-terminal-login", name: "Login", type: "terminal" },
    ]);
    expect(
      await museDetectionSpec.capabilitiesProbe?.({
        location: { kind: "posix", path: "/tmp" },
        executablePath: undefined,
      }),
    ).toBeUndefined();
  });

  it("registers auth probes for META_API_KEY and stored credentials", () => {
    expect(museDetectionSpec.authProbes).toHaveLength(2);
  });

  it("falls back to auth methods only when the help probe fails", async () => {
    readAgentCommandOutputMock.mockRejectedValueOnce(new Error("spawn ENOENT"));
    const result = await museDetectionSpec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/tmp" },
      executablePath: "/usr/bin/muse",
    });
    expect(result).toEqual({
      authMethods: [{ id: "muse-terminal-login", name: "Login", type: "terminal" }],
      // `muse logout` exists independently of the help probe.
      authLogoutSupported: true,
    });
  });

  it("probes muse --help with the detection env and overlays new models", async () => {
    readAgentCommandOutputMock.mockResolvedValueOnce({
      ok: true,
      stdout: FUTURE_MUSE_HELP,
      stderr: "",
    });
    const location = { kind: "posix", path: "/tmp" } as ProjectLocation;
    const result = await museDetectionSpec.capabilitiesProbe?.({
      location,
      executablePath: "/usr/bin/muse",
      probeEnv: { MUSE_NO_AUTO_UPDATE: "1" },
    });
    expect(readAgentCommandOutputMock).toHaveBeenCalledWith(location, "/usr/bin/muse", ["--help"], {
      timeoutMs: 8_000,
      env: { MUSE_NO_AUTO_UPDATE: "1" },
    });
    expect(result?.authMethods).toEqual([
      { id: "muse-terminal-login", name: "Login", type: "terminal" },
    ]);
    // Default stays curated-first; the discovered id is appended, never moved up.
    expect(result?.models?.[0]?.id).toBe(MUSE_DEFAULT_MODEL_ID);
    expect(result?.models?.map((m) => m.id)).toContain("muse-spark-1.4");
    expect(result?.efforts).toContain("max");
  });

  it("uses the live catalog as the authoritative model list", async () => {
    probeMuseModelCatalogMock.mockResolvedValueOnce({
      models: [
        { id: "muse-spark-1.3", label: "Muse Spark 1.3", contextLimit: 1_048_576, isDefault: true },
        {
          id: "muse-spark-1.9",
          label: "Muse Spark 1.9",
          contextLimit: 2_000_000,
          isDefault: false,
        },
      ],
      source: "providerCatalog",
      providerId: "meta",
      profileId: null,
    });
    const location = { kind: "posix", path: "/tmp" } as ProjectLocation;
    const result = await museDetectionSpec.capabilitiesProbe?.({
      location,
      executablePath: "/usr/bin/muse",
      probeEnv: { MUSE_NO_AUTO_UPDATE: "1" },
    });
    expect(probeMuseModelCatalogMock).toHaveBeenCalledWith(
      location,
      expect.objectContaining({ executablePath: "/usr/bin/muse" }),
    );
    expect(result?.models).toEqual([
      { id: MUSE_DEFAULT_MODEL_ID, label: "Muse Spark 1.3" },
      { id: "muse-spark-1.9", label: "Muse Spark 1.9" },
    ]);
    // Context comes from the catalog limits.
    expect(result?.modelContextSizes?.["muse-spark-1.9"]).toEqual(["2M"]);
    expect(result?.modelContextSizes?.["muse-spark-1.3"]).toEqual(["1M"]);
  });

  it("ignores an empty live catalog", async () => {
    probeMuseModelCatalogMock.mockResolvedValueOnce({
      models: [],
      source: "bundledCatalog",
      providerId: "meta",
      profileId: "tbh",
    });
    const result = await museDetectionSpec.capabilitiesProbe?.({
      location: { kind: "posix", path: "/tmp" },
      executablePath: "/usr/bin/muse",
    });
    // Empty help output parses to nothing and the empty catalog adds nothing.
    expect(result).toEqual({
      authMethods: [{ id: "muse-terminal-login", name: "Login", type: "terminal" }],
      authLogoutSupported: true,
    });
  });
});

describe("museDefaultCapabilities", () => {
  it("lists the static Muse models with 1.3 as default-first", () => {
    expect(museDefaultCapabilities.models[0]?.id).toBe(MUSE_DEFAULT_MODEL_ID);
    expect(museDefaultCapabilities.models.map((m) => m.id)).toEqual([
      "muse-spark-1.3",
      "muse-spark-1.3-contributor",
      "muse-spark-1.2",
      "muse-spark-1.2-contributor",
      "muse-spark-1.1",
    ]);
  });

  it("declares the full effort ladder with default high", () => {
    expect(museDefaultCapabilities.efforts).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "ultra",
    ]);
    expect(museDefaultCapabilities.defaultEffort).toBe("high");
  });

  it("maps approval policies and a yolo bypass posture", () => {
    expect(museDefaultCapabilities.approvalPolicies.map((p) => p.id)).toEqual([
      "untrusted",
      "on-request",
      "never",
      "yolo",
    ]);
    expect(museDefaultCapabilities.defaultApprovalPolicy).toBe("on-request");
    expect(museDefaultCapabilities.bypassPermissions).toEqual({ approvalPolicy: "yolo" });
  });

  it("advertises terminal and GUI presentations with resume, direct input, and exec one-shots", () => {
    expect(museDefaultCapabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(museDefaultCapabilities.presentationMode).toBe("terminal");
    expect(museDefaultCapabilities.liveInputMode).toBe("terminal");
    expect(museDefaultCapabilities.supportsResume).toBe(true);
    expect(museDefaultCapabilities.supportsDirectInput).toBe(true);
    expect(museDefaultCapabilities.supportsOneShot).toBe(true);
    expect(museDefaultCapabilities.modes).toEqual(["agent"]);
  });
});

// Help fixtures: DOCUMENTED_MUSE_HELP is the real `muse --help` output captured
// from Muse Code 1.0.2 in WSL Ubuntu (2026-09-02). FUTURE_MUSE_HELP derives a
// hypothetical CLI that shipped `max` effort and mentions a new model id, with
// every other byte identical to reality.
const DOCUMENTED_MUSE_HELP = `muse — interactive terminal coding agent

If no subcommand is given, options run the interactive TUI; pass a prompt to start
a session, or use a command below.

Usage: muse [OPTIONS] [PROMPT]
       muse [OPTIONS] <COMMAND>

Commands:
  resume           Resume a previous session (--last or <session-uuid>)
  exec             Run one prompt non-interactively (headless)
  config           Validate enterprise configuration documents
  export           Export a session transcript to a file
  trace            Inspect a recorded session or run trace
  skills           List, inspect, enable, or disable skills
  sandbox          Check or set up the OS sandbox
  schema           Export the MSP wire schema (JSON Schema or TypeScript)
  serve            Serve an MSP session host over stdio
  session-message  List or send cross-session messages
  auth             Store provider API credentials
  login            Log in to a provider
  logout           Remove stored provider credentials
  init             Scaffold agent config in this workspace

Options:
  -h, --help
          Print help
  -V, --version
          Print version
      --agents <JSON>
          Supply one ephemeral agent-definition overlay
      --provider <MODE>
          Startup provider: echo or meta (default: meta)
      --preset <NAME>
          Run a built-in preset: native-basic, miniswe
      --model <MODEL>
          Model id for non-echo providers
      --reasoning-effort <EFFORT>
          Meta reasoning effort: none|minimal|low|medium|high|xhigh|ultra
          (default: high)
      --base-url <URL>
          Override the Meta provider base URL
      --approval-mode <MODE>
          Tool approval mode: untrusted|on-request|never (default: on-request)
      --yolo
          Disable approval and sandboxing and trust this workspace for this run
      --trust-workspace
          Trust this workspace for this run (load its skills and rules); does
          not save trust

Run \`muse <command> --help\` for command-specific options.`;

// A future CLI that shipped `max` effort and mentions a new model id.
const FUTURE_MUSE_HELP = DOCUMENTED_MUSE_HELP.replace(
  "none|minimal|low|medium|high|xhigh|ultra",
  "none|minimal|low|medium|high|xhigh|max|ultra",
).replace(
  "Model id for non-echo providers",
  "Model id for non-echo providers (e.g. muse-spark-1.4)",
);

describe("parseMuseHelpEfforts", () => {
  it("parses the wrapped effort enum from real 1.0.2 help output", () => {
    expect(parseMuseHelpEfforts(DOCUMENTED_MUSE_HELP)).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "ultra",
    ]);
  });

  it("accepts bracketed enums", () => {
    expect(parseMuseHelpEfforts("--reasoning-effort [low|medium|high]")).toEqual([
      "low",
      "medium",
      "high",
    ]);
  });

  it("still parses the inline 0.1.0 enum shape", () => {
    expect(
      parseMuseHelpEfforts(
        "--reasoning-effort <none|minimal|low|medium|high|xhigh|ultra>  default: high",
      ),
    ).toEqual(["none", "minimal", "low", "medium", "high", "xhigh", "ultra"]);
  });

  it("never adopts a neighboring flag's enum across the flag boundary", () => {
    const help = [
      "      --reasoning-effort <EFFORT>",
      "          Tune reasoning depth",
      "  -w, --worktree [<MODE>]",
      "          Session Git worktree: off|create|existing",
    ].join("\n");
    expect(parseMuseHelpEfforts(help)).toBeUndefined();
  });

  it("returns undefined when the flag is absent", () => {
    expect(parseMuseHelpEfforts("Usage: muse [OPTIONS]\n  --model <MODEL_ID>")).toBeUndefined();
  });

  it("rejects enums without a known ladder value (sentinel gate)", () => {
    expect(parseMuseHelpEfforts("--reasoning-effort <foo|bar>")).toBeUndefined();
    expect(parseMuseHelpEfforts("--reasoning-effort <turbo>")).toBeUndefined();
  });

  it("parses ANSI-colored help", () => {
    const colored = `\u001b[1m--reasoning-effort\u001b[0m \u001b[33m<low|medium|high>\u001b[0m`;
    expect(parseMuseHelpEfforts(colored)).toEqual(["low", "medium", "high"]);
  });
});

describe("parseMuseHelpModelIds", () => {
  it("collects muse-spark ids deduped in order of appearance", () => {
    expect(
      parseMuseHelpModelIds("try muse-spark-1.4 or muse-spark-1.4-contributor, not muse-spark-1.4"),
    ).toEqual(["muse-spark-1.4", "muse-spark-1.4-contributor"]);
  });

  it("rejects patch-suffixed lookalikes instead of extracting a prefix", () => {
    // Without the trailing guard, `muse-spark-1.4.1` yields phantom `1.4`.
    expect(parseMuseHelpModelIds("muse-spark-1.4.1 and muse-spark-1.4")).toEqual([
      "muse-spark-1.4",
    ]);
  });

  it("rejects hyphen-suffixed lookalikes instead of extracting a prefix", () => {
    expect(parseMuseHelpModelIds("muse-spark-1.4-preview")).toEqual([]);
  });

  it("returns an empty list when help mentions no model ids", () => {
    expect(parseMuseHelpModelIds(DOCUMENTED_MUSE_HELP)).toEqual([]);
  });
});

describe("humanizeMuseModelLabel", () => {
  it("derives labels from id segments", () => {
    expect(humanizeMuseModelLabel("muse-spark-1.4")).toBe("Muse Spark 1.4");
    expect(humanizeMuseModelLabel("muse-spark-1.4-contributor")).toBe("Muse Spark 1.4 Contributor");
  });
});

describe("buildMuseProbedCapabilities", () => {
  it("returns null when help adds nothing new", () => {
    // Same ladder as static, no unknown model ids.
    expect(buildMuseProbedCapabilities(DOCUMENTED_MUSE_HELP)).toBeNull();
    expect(buildMuseProbedCapabilities("")).toBeNull();
  });

  it("adopts a newly shipped ladder and appends discovered models additively", () => {
    const probed = buildMuseProbedCapabilities(FUTURE_MUSE_HELP);
    expect(probed?.efforts).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ]);
    // Curated entries keep their order and the default stays first.
    expect(probed?.models.map((m) => m.id).slice(0, 5)).toEqual([
      "muse-spark-1.3",
      "muse-spark-1.3-contributor",
      "muse-spark-1.2",
      "muse-spark-1.2-contributor",
      "muse-spark-1.1",
    ]);
    expect(probed?.models.at(-1)).toEqual({ id: "muse-spark-1.4", label: "Muse Spark 1.4" });
    expect(probed?.modelEfforts["muse-spark-1.4"]).toContain("max");
    expect(probed?.modelContextSizes?.["muse-spark-1.4"]).toEqual(["1M"]);
  });

  it("keeps the static ladder when help drops a curated effort", () => {
    // A truncated enum must neither shrink the picker nor orphan defaultEffort.
    const partial = FUTURE_MUSE_HELP.replace(
      "none|minimal|low|medium|high|xhigh|max|ultra",
      "low|medium|high|max",
    );
    const probed = buildMuseProbedCapabilities(partial);
    expect(probed?.efforts).toEqual(["none", "minimal", "low", "medium", "high", "xhigh", "ultra"]);
    // ...but the discovered model is still appended, on the static ladder.
    expect(probed?.models.at(-1)?.id).toBe("muse-spark-1.4");
    expect(probed?.modelEfforts["muse-spark-1.4"]).toEqual(probed?.efforts);
  });

  it("adopts a reordered superset ladder in help order", () => {
    const reordered = DOCUMENTED_MUSE_HELP.replace(
      "none|minimal|low|medium|high|xhigh|ultra",
      "ultra|high|xhigh|medium|low|minimal|none",
    );
    expect(buildMuseProbedCapabilities(reordered)?.efforts).toEqual([
      "ultra",
      "high",
      "xhigh",
      "medium",
      "low",
      "minimal",
      "none",
    ]);
  });
});

describe("buildMuseCatalogCapabilities", () => {
  const base = [
    { id: "muse-spark-1.3", label: "Muse Spark 1.3" },
    { id: "muse-spark-1.1", label: "Muse Spark 1.1" },
  ];
  const efforts = ["low", "medium", "high"];

  it("returns the accepted live subset and ignores only an empty catalog", () => {
    expect(
      buildMuseCatalogCapabilities(
        base,
        {
          models: [
            {
              id: "muse-spark-1.3",
              label: "muse-spark-1.3",
              contextLimit: null,
              isDefault: false,
            },
          ],
          source: "providerCatalog",
          providerId: "meta",
          profileId: null,
        },
        efforts,
      )?.models,
    ).toEqual([{ id: "muse-spark-1.3", label: "Muse Spark 1.3" }]);
    expect(
      buildMuseCatalogCapabilities(
        base,
        { models: [], source: "bundledCatalog", providerId: "meta", profileId: "tbh" },
        efforts,
      ),
    ).toBeNull();
  });

  it("uses catalog ids with catalog labels and limits on the given ladder", () => {
    const probed = buildMuseCatalogCapabilities(
      base,
      {
        models: [
          {
            id: "muse-spark-1.9",
            label: "Muse Spark 1.9",
            contextLimit: 2_000_000,
            isDefault: true,
          },
          { id: "", label: "blank", contextLimit: null, isDefault: false },
        ],
        source: "providerCatalog",
        providerId: "meta",
        profileId: null,
      },
      efforts,
    );
    expect(probed?.models.map((m) => m.id)).toEqual(["muse-spark-1.9"]);
    expect(probed?.modelEfforts["muse-spark-1.9"]).toEqual(efforts);
    expect(probed?.modelContextSizes?.["muse-spark-1.9"]).toEqual(["2M"]);
    expect(probed?.modelContextSizes?.["muse-spark-1.3"]).toBeUndefined();
  });

  it("humanizes blank catalog labels and prefers catalog limits for known ids", () => {
    const probed = buildMuseCatalogCapabilities(
      base,
      {
        models: [
          {
            id: "muse-spark-1.3",
            label: "Muse Spark 1.3",
            contextLimit: 2_000_000,
            isDefault: false,
          },
          { id: "muse-spark-1.9-contributor", label: "", contextLimit: null, isDefault: false },
        ],
        source: "providerCatalog",
        providerId: "meta",
        profileId: null,
      },
      efforts,
    );
    expect(probed?.models.at(-1)).toEqual({
      id: "muse-spark-1.9-contributor",
      label: "Muse Spark 1.9 Contributor",
    });
    expect(probed?.modelContextSizes?.["muse-spark-1.3"]).toEqual(["2M"]);
  });
});

describe("parseMuseSkillCommands", () => {
  it("maps enabled muse skills to composer skill commands", () => {
    expect(
      parseMuseSkillCommands(
        JSON.stringify({
          skills: [
            {
              name: "plan",
              activation: "on",
              scope: "built-in",
              description: "Create a grounded, decision-complete plan.",
            },
            {
              name: "workspace-lint",
              activation: "on",
              scope: "project",
              short_description: "Lint the workspace.",
            },
            { name: "retired", activation: "off", scope: "user" },
            { name: "", activation: "on", scope: "user" },
          ],
        }),
      ),
    ).toEqual([
      {
        id: "muse-skill-plan",
        label: "plan",
        description: "Create a grounded, decision-complete plan.",
        section: "skills",
        skillName: "plan",
        skillInvocation: "/skill plan",
        skillProvider: "muse",
        skillScope: "global",
      },
      {
        id: "muse-skill-workspace-lint",
        label: "workspace-lint",
        description: "Lint the workspace.",
        section: "skills",
        skillName: "workspace-lint",
        skillInvocation: "/skill workspace-lint",
        skillProvider: "muse",
        skillScope: "project",
      },
    ]);
  });

  it("returns nothing for malformed or empty output", () => {
    expect(parseMuseSkillCommands("not json")).toEqual([]);
    expect(parseMuseSkillCommands(JSON.stringify({ skills: [] }))).toEqual([]);
    expect(parseMuseSkillCommands("")).toEqual([]);
  });
});
