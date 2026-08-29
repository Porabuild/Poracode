import type { AgentAuthMethod, AgentCapability } from "@/shared/contracts";
import { batchWslCommandsAsync, type AuthProbe, type DetectionSpec } from "../base";
import {
  ANTIGRAVITY_KNOWN_MODEL_VARIANTS,
  buildAntigravityModelCapabilities,
  probeAntigravityRuntime,
  type AntigravityProbeResult,
} from "./models";
import { ANTIGRAVITY_CONFIG_SUBPATH, antigravityConfigDirExists } from "./session";

export const ANTIGRAVITY_DEFAULT_MODEL_ID = "Gemini 3.5 Flash";

// `agy` runs a detached background self-updater (`agy --bg-updater`, which then
// shells out to `agy --version`) on its own rate-limited schedule — so it fires
// on the first spawn after a quiet period, not on every spawn. The updater
// escapes the pseudoconsole its parent runs in and allocates a fresh Windows
// console; when the user's default terminal application is Windows Terminal the
// OS hands that console off, popping a stray terminal window mid-session.
// Poracode owns agent updates (Settings update button -> `agy update`), so we
// set `AGY_CLI_DISABLE_AUTO_UPDATE` on every `agy` spawn we make (detection
// probes, account probe, PTY launches, one-shots). `agy update` runs without
// this env (separate path), so explicit updates still work.
export const ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV: Record<string, string> = {
  AGY_CLI_DISABLE_AUTO_UPDATE: "1",
};

const defaultModelCapabilities = buildAntigravityModelCapabilities(
  ANTIGRAVITY_KNOWN_MODEL_VARIANTS,
);

export const defaultAntigravityCapabilities: AgentCapability = {
  models: defaultModelCapabilities.models,
  efforts: defaultModelCapabilities.efforts,
  defaultEffort: defaultModelCapabilities.defaultEffort,
  modelEfforts: defaultModelCapabilities.modelEfforts,
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Request Review" },
    { id: "accept-edits", label: "Accept Edits" },
    { id: "yolo", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "yolo",
  bypassPermissions: { approvalPolicy: "yolo" },
  // No dedicated-server hosting path in any presentation.
  mcpScope: { terminal: "none", gui: "none" },
  settingDefs: [],
};

// `agy` keeps its config under `~/.gemini/antigravity-cli/`; the real
// credential lives in the OS keyring and isn't directly probeable, so the
// subdir's presence is the best proxy we have for "first-run has completed".
// This is a soft signal — the keyring may still be unauthenticated even when
// the dir exists.
const configDirAuthProbe: AuthProbe = async (ctx) => {
  // WSL: check the distro's home directly over the bridge. The sync UNC-path
  // `existsSync` used for native resolves through the WSL home-dir CACHE, which
  // is empty until WSL detection has run — so on a cold cache it spuriously
  // reports "unknown" (→ "Login required") on a distro that is actually signed
  // in. A direct `test -d` is cache-independent and reliable (mirrors grok).
  if (ctx.location.kind === "wsl") {
    const [result] = await batchWslCommandsAsync(
      ctx.location.distro,
      [`test -d ~/${ANTIGRAVITY_CONFIG_SUBPATH} && echo yes || echo no`],
      ctx.signal,
    );
    return result?.ok && result.stdout.trim() === "yes" ? "authenticated" : "unknown";
  }
  return antigravityConfigDirExists(ctx.location) ? "authenticated" : "unknown";
};

// `agy` has no `agy login` subcommand — authentication happens implicitly on
// first run: launching the bare binary prompts for Google OAuth (and on
// WSL/remote prints a URL + code to paste back). So the terminal login method
// just runs `agy`. Mirrors Codex's CODEX_TERMINAL_AUTH_METHOD, but with empty
// args since there is no subcommand. The settings UI gates the Login/Re-login
// button on the presence of an interactive auth method + `loginCommand`.
const ANTIGRAVITY_TERMINAL_AUTH_METHOD: AgentAuthMethod = {
  type: "terminal",
  id: "antigravity-login",
  name: "Antigravity login",
  args: [],
  // No `env` needed: `detectAgentInstall` merges `baseSpawnEnv` into every
  // terminal auth method as it assembles the status.
};

export function createAntigravityDetectionSpec(
  onProbe?: (result: AntigravityProbeResult) => void,
): DetectionSpec {
  return {
    kind: "antigravity",
    label: "Antigravity",
    binary: "agy",
    // Running `agy` with no args triggers the interactive sign-in on first run;
    // there is no `agy login` subcommand, so the bare binary is the login path.
    // On an already-authenticated machine the UI surfaces this as "Re-login".
    // We intentionally do NOT advertise `authLogoutSupported`: `agy` exposes
    // logout only as the in-session `/logout` TUI slash command (no
    // non-interactive `agy logout`), and the adapter is not ACP — so the UI
    // never shows a Logout button that would have nothing to invoke.
    loginCommand: "agy",
    capabilities: defaultAntigravityCapabilities,
    // Single declaration point: shared runtime fans this out to the launch-time
    // `agy --version` / `agy models` / `agy --help` probes, terminal login, PTY
    // launches, one-shots, context extraction, and subagent children.
    baseSpawnEnv: ANTIGRAVITY_DISABLE_AUTO_UPDATE_ENV,
    authProbes: [configDirAuthProbe],
    async capabilitiesProbe(ctx) {
      // Advertise the terminal login method regardless of the model-probe
      // outcome (a missing models result must still flip the auth UI on).
      const probe = await probeAntigravityRuntime(ctx);
      onProbe?.(probe);
      return {
        ...(probe.capabilities ?? {}),
        authMethods: [ANTIGRAVITY_TERMINAL_AUTH_METHOD],
      };
    },
    update: {
      builtIn: { binary: "agy", args: ["update"] },
      latestVersionUrls: [
        "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json",
      ],
    },
  };
}

export const antigravityDetectionSpec = createAntigravityDetectionSpec();
