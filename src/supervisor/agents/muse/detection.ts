import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { stripAnsi } from "@/shared/ansi";
import type { AgentCapability, AgentTerminalAuthMethod, ProjectLocation } from "@/shared/contracts";
import {
  batchWslCommandsAsync,
  envVarAuthProbe,
  readAgentCommandOutput,
  type AuthProbe,
  type DetectionSpec,
} from "../base";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { nativeMuseAuthPath, WSL_MUSE_AUTH_PATH } from "./paths";
import { probeMuseModelCatalog, type MuseProbedCatalog } from "./msp/probe";

// Curated static fallback — Muse ships no `list-models` command, so this is
// the model/effort source of truth when the `--help` probe below yields
// nothing new. All ship with a 1M context window (1.1/1.2 verified against
// Muse Code 0.1.0 docs/binary; 1.3 confirmed at 1,048,576 tokens via Model API
// catalogs on release day, 2026-09-02).
const MUSE_DISABLE_AUTO_UPDATE_ENV: Record<string, string> = {
  MUSE_NO_AUTO_UPDATE: "1",
};

export const MUSE_DEFAULT_MODEL_ID = "muse-spark-1.3";

// Single source for the curated static models: ids, picker labels, context
// map, and per-model efforts below all derive from this array.
const MUSE_STATIC_MODELS: Array<{ id: string; label: string }> = [
  { id: MUSE_DEFAULT_MODEL_ID, label: "Muse Spark 1.3" },
  { id: "muse-spark-1.3-contributor", label: "Muse Spark 1.3 Contributor" },
  { id: "muse-spark-1.2", label: "Muse Spark 1.2" },
  { id: "muse-spark-1.2-contributor", label: "Muse Spark 1.2 Contributor" },
  { id: "muse-spark-1.1", label: "Muse Spark 1.1" },
];

const MUSE_MODEL_IDS: string[] = MUSE_STATIC_MODELS.map((model) => model.id);

/** Static effort ladder (also the MSP `ReasoningEffort` closed enum — see msp/schemaFixture.test.ts). */
export const MUSE_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "ultra"] as const;

// Muse approval modes: untrusted | on-request | never (CLI default on-request).
// `--yolo` is the true full bypass (approval + sandbox + trust) and is the
// bypassPermissions target.
const MUSE_APPROVAL_POLICIES = [
  { id: "untrusted", label: "Untrusted" },
  { id: "on-request", label: "On Request" },
  { id: "never", label: "Never Ask" },
  { id: "yolo", label: "Bypass Approvals" },
] as const;

const contextCaps = buildContextSizeCapabilities(
  new Map(MUSE_MODEL_IDS.map((id) => [id, 1_000_000])),
);

export const museDefaultCapabilities: AgentCapability = {
  models: MUSE_STATIC_MODELS.map((model) => ({ ...model })),
  efforts: [...MUSE_EFFORTS],
  defaultEffort: "high",
  modelEfforts: Object.fromEntries(MUSE_MODEL_IDS.map((id) => [id, [...MUSE_EFFORTS]])),
  modes: ["agent"],
  approvalPolicies: [...MUSE_APPROVAL_POLICIES],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  // Muse's model routes reject image content carried in the session history
  // ("retained media history is unsupported"), so MSP turn input references
  // attachments by path instead of inlining image bytes. Muse reads the file
  // itself — the same contract as its terminal `@path` mentions.
  readsImageAttachmentsFromHost: false,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "on-request",
  bypassPermissions: { approvalPolicy: "yolo" },
  mcpScope: { terminal: "none", gui: "none" },
  settingDefs: [],
  ...contextCaps,
};

/**
 * Parse the `--reasoning-effort` enum out of `muse --help` output. Two shapes
 * seen in the wild: the inline enum (`--reasoning-effort <none|...|ultra>`,
 * documented for 0.1.0) and the wrapped description form (real 1.0.2 output):
 * `      --reasoning-effort <EFFORT>`
 * `          Meta reasoning effort: none|minimal|low|medium|high|xhigh|ultra`
 *
 * Sentinel-gated: the enum must hold 2+ lowercase tokens and include a known
 * ladder value (`high`/`medium`), so an unrelated similarly-named flag or a
 * truncated line can never shrink the picker to garbage. Returns the ladder
 * in help order, or undefined when the help text doesn't parse.
 */
export function parseMuseHelpEfforts(output: string): string[] | undefined {
  const effortToken = /^[a-z][a-z0-9]*$/;
  const enumRun = /[a-z][a-z0-9]*(?:\|[a-z][a-z0-9]*)+/;
  const validLadder = (tokens: string[]): string[] | undefined => {
    const deduped = [...new Set(tokens.map((token) => token.trim()))].filter((token) =>
      effortToken.test(token),
    );
    if (deduped.length < 2) return undefined;
    if (!deduped.includes("high") && !deduped.includes("medium")) return undefined;
    return deduped;
  };
  const lines = stripAnsi(output).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    if (!rawLine.includes("--reasoning-effort")) continue;
    // Inline enum first; a lone placeholder (`<EFFORT>`) carries no values and
    // falls through to the description lines below the flag.
    const inline = /<([^<>]+)>/.exec(rawLine)?.[1] ?? /\[([^[\]]+)\]/.exec(rawLine)?.[1];
    if (inline) {
      const ladder = validLadder(inline.split("|"));
      if (ladder) return ladder;
    }
    // Wrapped enum on the following description lines. Stop at the next flag
    // so a neighboring option's enum (e.g. `--worktree off|create|existing`)
    // can never leak in.
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const next = lines[j] ?? "";
      if (next.trimStart().startsWith("-")) break;
      const run = enumRun.exec(next)?.[0];
      if (!run) continue;
      const ladder = validLadder(run.split("|"));
      if (ladder) return ladder;
    }
  }
  return undefined;
}

const MUSE_HELP_MODEL_RE = /\bmuse-spark-\d+\.\d+(?:-contributor)?(?![\w.-])/g;

/**
 * Collect `muse-spark-X.Y(-contributor)?` ids mentioned in `muse --help`
 * output, deduped in order of first appearance. The CLI never enumerates its
 * models, so help mentions are the only installed-binary signal for newly
 * shipped ids — the caller overlays these additively onto the curated list.
 */
export function parseMuseHelpModelIds(output: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const match of stripAnsi(output).matchAll(MUSE_HELP_MODEL_RE)) {
    const id = match[0];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Display label derived from the id's own segments
 * (`muse-spark-1.4-contributor` → `Muse Spark 1.4 Contributor`) — no
 * provider-owned name table to go stale.
 */
export function humanizeMuseModelLabel(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) =>
      /^\d+(\.\d+)?$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

function museStaticModelEntries(): Array<{ id: string; label: string }> {
  return MUSE_STATIC_MODELS.map((model) => ({ ...model }));
}

/**
 * Convert a non-empty live `model/list` catalog into picker capabilities.
 * The host documents this as the models it accepts in `session/setModel`, so
 * it is authoritative rather than an additive overlay on the static fallback.
 * Context limits come from the catalog when declared, else the 1M all Muse
 * models ship with. Empty catalogs return null so unauthenticated detection
 * can keep the static fallback.
 */
export function buildMuseCatalogCapabilities(
  baseModels: ReadonlyArray<{ id: string; label: string }>,
  catalog: MuseProbedCatalog,
  efforts: string[],
): Pick<AgentCapability, "models" | "modelEfforts" | "contextSizes" | "modelContextSizes"> | null {
  const liveModels = catalog.models.filter((model) => model.id);
  if (liveModels.length === 0) return null;
  const baseLabels = new Map(baseModels.map((model) => [model.id, model.label]));
  const models = liveModels.map((model) => ({
    id: model.id,
    label:
      (model.label !== model.id ? model.label : "") ||
      baseLabels.get(model.id) ||
      humanizeMuseModelLabel(model.id),
  }));
  const limits = new Map<string, number>();
  for (const model of catalog.models) {
    if (typeof model.contextLimit === "number" && model.contextLimit > 0) {
      limits.set(model.id, model.contextLimit);
    }
  }
  return {
    models,
    modelEfforts: Object.fromEntries(models.map((model) => [model.id, [...efforts]])),
    ...buildContextSizeCapabilities(
      new Map(models.map((model) => [model.id, limits.get(model.id) ?? 1_000_000])),
    ),
  };
}

/**
 * Overlay the installed binary's `--help` onto the curated static
 * capabilities: adopt a newly shipped effort ladder, and append newly
 * mentioned model ids (1M context, full ladder — every Muse model to date).
 *
 * Strictly additive on both axes: curated models are never removed and the
 * probed ladder is adopted only when it keeps every curated effort (so a
 * truncated help enum can neither shrink the picker nor orphan
 * `defaultEffort`). The default model (first entry) never moves, and the
 * result is null when help adds nothing — so the probe result stays minimal
 * and failures fall back to the static list with zero behavior change.
 */
export function buildMuseProbedCapabilities(
  helpOutput: string,
): Pick<
  AgentCapability,
  "models" | "efforts" | "modelEfforts" | "contextSizes" | "modelContextSizes"
> | null {
  const probed = parseMuseHelpEfforts(helpOutput);
  const knownIds: Set<string> = new Set(MUSE_MODEL_IDS);
  const discovered = parseMuseHelpModelIds(helpOutput).filter((id) => !knownIds.has(id));
  const ladderAdopted =
    probed !== undefined &&
    MUSE_EFFORTS.every((effort) => probed.includes(effort)) &&
    (probed.length !== MUSE_EFFORTS.length ||
      probed.some((effort, index) => effort !== MUSE_EFFORTS[index]));
  if (!ladderAdopted && discovered.length === 0) return null;

  const efforts = ladderAdopted && probed !== undefined ? [...probed] : [...MUSE_EFFORTS];
  const models = [
    ...museStaticModelEntries(),
    ...discovered.map((id) => ({ id, label: humanizeMuseModelLabel(id) })),
  ];
  return {
    models,
    efforts,
    modelEfforts: Object.fromEntries(models.map((model) => [model.id, [...efforts]])),
    ...buildContextSizeCapabilities(new Map(models.map((model) => [model.id, 1_000_000]))),
  };
}

/**
 * True when `auth.json` has a non-empty `providers` object. Key *names* only —
 * never inspect credential values. Split out so unit tests can cover the rule
 * without touching a real `~/.config/muse`.
 */
export function museAuthJsonIsAuthenticated(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const providers = (parsed as { providers?: unknown }).providers;
    if (!providers || typeof providers !== "object" || Array.isArray(providers)) return false;
    return Object.keys(providers as Record<string, unknown>).length > 0;
  } catch {
    return false;
  }
}

/** Native (non-WSL) credential check against the resolved auth.json path. */
export function museHasStoredCredentials(location: ProjectLocation): boolean {
  if (location.kind === "wsl") return false;
  const authFile = nativeMuseAuthPath();
  if (!existsSync(authFile)) return false;
  try {
    return museAuthJsonIsAuthenticated(readFileSync(authFile, "utf8"));
  } catch {
    return false;
  }
}

const storedCredentialsAuthProbe: AuthProbe = async (ctx) => {
  if (ctx.location.kind === "wsl") {
    const [result] = await batchWslCommandsAsync(ctx.location.distro, [
      `cat "${WSL_MUSE_AUTH_PATH}" 2>/dev/null || true`,
    ]);
    return museAuthJsonIsAuthenticated(result?.ok ? result.stdout : undefined)
      ? "authenticated"
      : "missing";
  }
  try {
    const raw = await readFile(nativeMuseAuthPath(), "utf8");
    return museAuthJsonIsAuthenticated(raw) ? "authenticated" : "missing";
  } catch {
    return "missing";
  }
};

// Muse authenticates via `muse login` (browser code approval / Meta account).
// No ACP probe — synthesize a terminal auth method so Settings shows Login.
const MUSE_TERMINAL_AUTH: AgentTerminalAuthMethod = {
  id: "muse-terminal-login",
  name: "Login",
  type: "terminal",
};

/**
 * Parse `muse skills list --json` into composer skill commands. Muse skills
 * are invoked as `/skill <name>` (the same convention the CLI documents), and
 * `scope` mirrors the CLI's user|project|built-in|plugin — only "project" is
 * workspace-scoped. Off (disabled) skills are omitted. Best-effort: anything
 * malformed yields no commands and the composer falls back to the shared
 * local skill scan.
 *
 * This CLI probe is the only enumeration surface: the public docs
 * (dev.meta.ai/docs/muse-code, current through 0.2.1) list no skills method in
 * any session protocol — MSP is undocumented there — and define plugins purely
 * as a skill source ("skills contributed by enabled plugin bundles"), so
 * plugin contributions arrive through this same list. `--json` itself is
 * undocumented in the docs but verified against the installed 1.0.2 binary.
 */
export function parseMuseSkillCommands(
  output: string,
): NonNullable<AgentCapability["slashCommands"]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return [];
  }
  const skills =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { skills?: unknown }).skills)
      ? ((parsed as { skills: unknown[] }).skills ?? [])
      : [];
  const commands: NonNullable<AgentCapability["slashCommands"]> = [];
  for (const skill of skills) {
    if (!skill || typeof skill !== "object") continue;
    const entry = skill as Record<string, unknown>;
    if (entry.activation !== undefined && entry.activation !== "on") continue;
    const name = typeof entry.name === "string" ? entry.name : "";
    if (!name) continue;
    const description =
      typeof entry.short_description === "string" && entry.short_description
        ? entry.short_description
        : typeof entry.description === "string"
          ? entry.description
          : undefined;
    const scope = entry.scope === "project" ? ("project" as const) : ("global" as const);
    commands.push({
      id: `muse-skill-${name}`,
      label: name,
      ...(description ? { description } : {}),
      section: "skills",
      skillName: name,
      skillInvocation: `/skill ${name}`,
      skillProvider: "muse",
      skillScope: scope,
    });
  }
  return commands;
}

/** Probe Muse's skill catalog for the composer's slash-command surface. */
async function probeMuseSkillCommands(ctx: {
  location: ProjectLocation;
  executablePath?: string | undefined;
  probeEnv?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
}): Promise<NonNullable<AgentCapability["slashCommands"]> | undefined> {
  if (!ctx.executablePath) return undefined;
  const result = await readAgentCommandOutput(
    ctx.location,
    ctx.executablePath,
    ["skills", "list", "--json", "--trust-workspace"],
    {
      timeoutMs: 12_000,
      ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    },
  ).catch(() => undefined);
  const text = result ? `${result.stdout}\n${result.stderr}` : "";
  if (!text.trim()) return undefined;
  const commands = parseMuseSkillCommands(text);
  return commands.length > 0 ? commands : undefined;
}

export const museDetectionSpec: DetectionSpec = {
  kind: "muse",
  label: "Muse Code",
  binary: "muse",
  loginCommand: "muse login",
  capabilities: museDefaultCapabilities,
  versionArgs: ["--version"],
  // The installed `muse` command is a launcher that otherwise checks for and
  // starts a background update. Detection must stay read-only and predictable;
  // explicit updates still use the installer spec below.
  baseSpawnEnv: MUSE_DISABLE_AUTO_UPDATE_ENV,
  // META_API_KEY takes priority over stored credentials at the CLI; treat either
  // as signed-in. The file probe keys off a non-empty `providers` object, not
  // mere config-dir existence (the dir appears on first run regardless).
  authProbes: [envVarAuthProbe(["META_API_KEY"]), storedCredentialsAuthProbe],
  async capabilitiesProbe(ctx) {
    if (!ctx.executablePath) return undefined;
    // Two dynamic sources, one static fallback. First the cheap,
    // unauthenticated `muse --help` spawn (effort ladder + mentioned model
    // ids, additive-only). Then the `muse serve` model catalog when the host
    // answers — live when logged in, empty otherwise. probeEnv carries
    // baseSpawnEnv (MUSE_NO_AUTO_UPDATE) so neither probe triggers the CLI's
    // updater. Anything missing falls back to the static list above with zero
    // behavior change.
    const help = await readAgentCommandOutput(ctx.location, ctx.executablePath, ["--help"], {
      timeoutMs: 8_000,
      ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    }).catch((error) => {
      console.warn("[muse] help probe failed:", error);
      return undefined;
    });
    const helpText = help ? `${help.stdout}\n${help.stderr}` : "";
    const helpCaps = helpText.trim() ? buildMuseProbedCapabilities(helpText) : null;
    const catalog = await probeMuseModelCatalog(ctx.location, {
      executablePath: ctx.executablePath,
      ...(ctx.probeEnv ? { probeEnv: ctx.probeEnv } : {}),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    // A non-empty catalog is authoritative; an empty/failed probe keeps the
    // help/static fallback.
    const catalogCaps =
      catalog && catalog.models.length > 0
        ? buildMuseCatalogCapabilities(
            helpCaps?.models ?? museStaticModelEntries(),
            catalog,
            helpCaps?.efforts ?? [...MUSE_EFFORTS],
          )
        : null;
    const overlay = catalogCaps ?? helpCaps;
    const skillCommands = await probeMuseSkillCommands(ctx);
    // `muse logout` clears the saved Meta credential (verified on 1.0.2), so
    // the Settings logout action is always available once installed.
    return {
      authMethods: [MUSE_TERMINAL_AUTH],
      authLogoutSupported: true,
      ...(skillCommands ? { slashCommands: skillCommands } : {}),
      ...(overlay ?? {}),
    };
  },
  // Muse ships via Meta's installer script only — no npm package, no
  // `muse update` / self-updater. Re-run the official install script for
  // updates. The script uses bash-isms (`set -o pipefail`), so it must be
  // piped to `bash`, not `sh` (dash aborts with "Illegal option -o pipefail"
  // and curl then fails with SIGPIPE). Windows runs the same installer in its
  // default WSL distro (schema requires both platforms when `installer` is set).
  update: {
    installer: {
      posix: {
        binary: "sh",
        args: ["-c", "curl -fsSL https://dev.meta.ai/install.sh | bash"],
      },
      windows: {
        binary: "wsl.exe",
        args: [
          "--exec",
          "bash",
          "-lc",
          "if command -v curl >/dev/null 2>&1; then set -o pipefail; curl -fsSL https://dev.meta.ai/install.sh | bash; else exit 127; fi",
        ],
      },
    },
  },
};
