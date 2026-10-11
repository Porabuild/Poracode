import type { AgentCapability } from "@/shared/contracts";
import { envVarAuthProbe, type AuthProbe, type DetectionSpec } from "../base";
import { commandCodeHasStoredCredentials } from "./session";
import { probeCommandCodeCapabilities } from "./capabilities";

// Preserve the provider's detection exports for existing callers/tests.
export {
  buildCommandCodeModelPickerCapabilities,
  collectCommandCodeModelEfforts,
  createCommandCodeEffortProbeCache,
  createCommandCodeModelNameLoader,
  parseCommandCodeModelEfforts,
  parseCommandCodeModelNames,
  parseCommandCodeModels,
  resolveCommandCodeModelName,
} from "./models";
export type { ParsedCommandCodeModel } from "./models";

// Command Code's CLI runs a background self-updater on EVERY invocation: when a
// newer npm version exists it spawns a detached `cmd.exe`/`npm i <tgz>` (see the
// CLI's `spawnBackgroundUpdate`), which Windows 11 surfaces as a stray terminal
// window — re-triggered by each launch-time detection probe. Poracode owns
// agent updates (Settings update button → `command-code update`), so we set
// `COMMANDCODE_SKIP_UPDATES` on every command-code spawn we make (detection
// probes, PTY launches, one-shots) to suppress the CLI's own updater. The CLI
// also honors `CI`, but that flips broader non-interactive behavior, so we use
// the dedicated switch. `command-code update` runs without this env (separate
// path), so explicit updates still work.
const COMMANDCODE_SKIP_UPDATES_ENV: Record<string, string> = {
  COMMANDCODE_SKIP_UPDATES: "1",
};

export const defaultCommandCodeCapabilities: AgentCapability = {
  models: [],
  subProviders: [],
  modelSubProvider: {},
  modelEfforts: {},
  efforts: [],
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "auto_edit", label: "Auto-accept edits" },
    { id: "dont-ask", label: "Don't ask (deny)" },
    { id: "yolo", label: "Bypass Permissions" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  // Command Code sandboxes file reads to its working directory, so picked
  // screenshots / attachments must be copied into the project before use.
  requiresWorkspaceLocalAttachments: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "yolo",
  bypassPermissions: { approvalPolicy: "yolo" },
  // A session-local mod supplies Poracode MCP tools to the terminal runtime.
  mcpScope: { terminal: "launch", gui: "launch" },
  settingDefs: [],
};

// Sign-in state comes from the credential file `command-code login` writes
// (`~/.commandcode/auth.json` with an `apiKey`), not the config dir, which is
// created on first run regardless. This keeps a never-signed-in user from
// seeing a false "Re-login" and a signed-in user from being nagged with
// "Login required".
const storedCredentialsAuthProbe: AuthProbe = async (ctx) => {
  return commandCodeHasStoredCredentials(ctx.location) ? "authenticated" : "missing";
};

export const commandCodeDetectionSpec: DetectionSpec = {
  kind: "commandcode",
  label: "Command Code",
  binary: "command-code",
  loginCommand: "command-code login",
  capabilities: defaultCommandCodeCapabilities,
  versionArgs: ["--version"],
  authProbes: [envVarAuthProbe(["COMMAND_CODE_API_KEY"]), storedCredentialsAuthProbe],
  // Terminal catalogs remain live CLI data. Since 1.74, Chat negotiates its
  // own models, per-model effort, commands and resume support over native ACP.
  capabilitiesProbe: probeCommandCodeCapabilities,
  // `command-code update` is the documented self-updater (preferred). `npm`
  // also enables the registry "outdated?" check (getNpmPackageNameForUpdate)
  // and is the automatic fallback if the built-in updater fails, since the CLI
  // is distributed as the `command-code` npm package on every platform.
  update: { builtIn: { binary: "command-code", args: ["update"] }, npm: "command-code" },
  // Suppress the CLI's background self-updater on every spawn lane (shared
  // runtime fans this out; the explicit `update` command stays exempt).
  baseSpawnEnv: COMMANDCODE_SKIP_UPDATES_ENV,
};
