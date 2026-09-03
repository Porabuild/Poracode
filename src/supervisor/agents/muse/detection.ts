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
  liveInputMode: "terminal",
  presentationMode: "terminal",
  // Although `muse exec --json` exists, it has no headless approval wire.
  // Keep Muse terminal-only until it ships a real structured/ACP mode.
  presentationModes: ["terminal"],
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

const MUSE_HELP_MODEL_RE = /\bmuse-spark-\d+\.\d+(?:-contributor)?(?![\w.])/g;

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
    // One cheap, unauthenticated `muse --help` spawn: adopt the installed
    // binary's effort ladder and any newly shipped model ids it mentions.
    // The overlay is additive-only (see buildMuseProbedCapabilities), so a
    // failed spawn or unparseable help falls back to the static list above
    // with zero behavior change. probeEnv carries baseSpawnEnv
    // (MUSE_NO_AUTO_UPDATE) so the probe never triggers the CLI's updater.
    const help = await readAgentCommandOutput(ctx.location, ctx.executablePath, ["--help"], {
      timeoutMs: 8_000,
      ...(ctx.probeEnv ? { env: ctx.probeEnv } : {}),
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    }).catch((error) => {
      console.warn("[muse] help probe failed:", error);
      return undefined;
    });
    const helpText = help ? `${help.stdout}\n${help.stderr}` : "";
    // `muse logout` clears the saved Meta credential (verified on 1.0.2), so
    // the Settings logout action is always available once installed.
    return {
      authMethods: [MUSE_TERMINAL_AUTH],
      authLogoutSupported: true,
      ...(helpText.trim() ? (buildMuseProbedCapabilities(helpText) ?? {}) : {}),
    };
  },
  // Muse ships via Meta's installer script only — no npm package, no
  // `muse update` / self-updater. Re-run the official install script for
  // updates. The script uses bash-isms (`set -o pipefail`), so it must be
  // piped to `bash`, not `sh` (dash aborts with "Illegal option -o pipefail"
  // and curl then fails with SIGPIPE). Windows has no Muse build; the windows
  // installer entry surfaces a clear message (schema requires both platforms
  // when `installer` is set).
  update: {
    installer: {
      posix: {
        binary: "sh",
        args: ["-c", "curl -fsSL https://dev.meta.ai/install.sh | bash"],
      },
      windows: {
        binary: "powershell.exe",
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Write-Host 'Muse Code is not available on Windows. Install it inside WSL or on macOS/Linux.'",
        ],
      },
    },
  },
};
