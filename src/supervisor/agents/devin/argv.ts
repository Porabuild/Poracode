import type { ThreadConfig } from "@/shared/contracts";
import type { DevinProfileAgentType } from "./profileConfig";

/**
 * CLI permission-mode vocabulary. Canonical values on 3000.11.x are
 * `auto`/`accept-edits`/`smart`/`dangerous`; `normal` (alias of `auto`) and
 * `bypass`/`yolo` (aliases of `dangerous`) remain accepted by the parser
 * (verified on 3000.11.3). Stored Poracode policies keep their legacy ids.
 */
const DEVIN_CLI_PERMISSION_MODES = ["normal", "accept-edits", "smart", "bypass"] as const;

/**
 * ACP session-mode resolution is owned by `acp/sessionModes.ts` (alias-aware,
 * negotiated-id-checked); this module keeps only the Terminal/CLI argv
 * vocabulary so the two surfaces cannot drift apart again.
 */
export { resolveDevinAcpMode } from "./acp/sessionModes";

/** Terminal `--permission-mode` value for a stored Poracode approval policy. */
export function devinCliPermissionMode(approvalPolicy: string | undefined): string {
  if (!approvalPolicy) return "smart";
  const policy = approvalPolicy === "bypassPermissions" ? "bypass" : approvalPolicy;
  return (DEVIN_CLI_PERMISSION_MODES as readonly string[]).includes(policy) ? policy : "smart";
}

/** CLI permission modes accepted by the installed parser (aliases included). */
export function devinAcceptedCliPermissionModes(): readonly string[] {
  return DEVIN_CLI_PERMISSION_MODES;
}

function buildDevinTerminalOptions(config: ThreadConfig): string[] {
  // Plan reads map to `normal` (full tool access until the /plan pre-input);
  // `plan` is not a CLI permission-mode value.
  const permission =
    config.mode === "plan" ? "normal" : devinCliPermissionMode(config.approvalPolicy);
  const args = ["--respect-workspace-trust", "false", "--permission-mode", permission];
  if (config.model) args.push("--model", config.model);
  return args;
}

export function buildDevinArgs(config: ThreadConfig, prompt: string, session?: string): string[] {
  const args = buildDevinTerminalOptions(config);
  if (session) args.push("--resume", session);
  // Plan mode needs the terminal /plan pre-input before the initial prompt.
  if (prompt && config.mode !== "plan") args.push("--", prompt);
  return args;
}

export function buildDevinOneShotArgs(model: string | undefined, prompt: string): string[] {
  const args = ["--permission-mode", "bypass", "--respect-workspace-trust", "false"];
  if (model) args.push("--model", model);
  return [...args, "-p", prompt];
}

/**
 * ACP launch args. `--model` stays a fuzzy id the CLI resolves; permission
 * modes are negotiated per session over ACP, not flags. `--cloud` switches to
 * the cloud ACP relay, where `--model`/`--agent-type` are documented as
 * ignored — they are omitted rather than sent as noise. `--agent-type` only
 * accepts the CLI's closed root enum (custom personas are never sent here).
 */
export function buildDevinAcpArgs(
  config: ThreadConfig,
  options?: { agentType?: DevinProfileAgentType | undefined; cloud?: boolean | undefined },
): string[] {
  const cloud = options?.cloud === true;
  const args = ["acp"];
  if (cloud) return [...args, "--cloud"];
  if (config.model) args.push("--model", config.model);
  if (options?.agentType) args.push("--agent-type", options.agentType);
  return args;
}
