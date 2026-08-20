import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { AgentCapability, AgentTerminalAuthMethod, ProjectLocation } from "@/shared/contracts";
import {
  batchWslCommandsAsync,
  envVarAuthProbe,
  type AuthProbe,
  type DetectionSpec,
} from "../base";
import { buildContextSizeCapabilities } from "../contextWindowLabel";
import { nativeMuseAuthPath, WSL_MUSE_AUTH_PATH } from "./paths";

// Models are static — Muse has no `list-models` command. All three ship with a
// 1M context window (verified against Muse Code 0.1.0 docs/binary).
const MUSE_DISABLE_AUTO_UPDATE_ENV: Record<string, string> = {
  MUSE_NO_AUTO_UPDATE: "1",
};

export const MUSE_DEFAULT_MODEL_ID = "muse-spark-1.2";

const MUSE_MODEL_IDS = [
  MUSE_DEFAULT_MODEL_ID,
  "muse-spark-1.2-contributor",
  "muse-spark-1.1",
] as const;

const MUSE_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "ultra"] as const;

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
  models: [
    { id: MUSE_DEFAULT_MODEL_ID, label: "Muse Spark 1.2" },
    { id: "muse-spark-1.2-contributor", label: "Muse Spark 1.2 Contributor" },
    { id: "muse-spark-1.1", label: "Muse Spark 1.1" },
  ],
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
    return { authMethods: [MUSE_TERMINAL_AUTH] };
  },
  // Muse ships via Meta's installer script only — no npm package, no
  // `muse update` / self-updater. Re-run the official install script for
  // updates. Windows has no Muse build; the windows installer entry surfaces a
  // clear message (schema requires both platforms when `installer` is set).
  update: {
    installer: {
      posix: {
        binary: "sh",
        args: ["-c", "curl -fsSL https://dev.meta.ai/install.sh | sh"],
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
