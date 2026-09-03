import type { ThreadConfig } from "@/shared/contracts";

/**
 * Flag references — verified against Muse Code 0.1.0 (0.1.0-R708.1), then
 * re-verified against real 1.0.2 `--help` / `exec --help` output (same launch,
 * resume, and exec flags; TUI heuristics in terminal.ts are still grounded in
 * the 0.1.0 capture).
 *
 * Interactive TUI: `muse [OPTIONS] [PROMPT]`
 *   • `--model <ID>`
 *   • `--reasoning-effort none|minimal|low|medium|high|xhigh|ultra` (default high)
 *   • `--approval-mode untrusted|on-request|never` (default on-request)
 *   • `--yolo` — disable approval + sandbox and trust the workspace for this run
 *   • `--trust-workspace` — trust workspace for this run (skills/rules); no persist
 *
 * Resume: `muse resume <session-uuid>` (root options may appear on either side
 * of `resume`). There is no interactive `--session-id` flag.
 *
 * Headless `muse exec` is intentionally not used (prompt must be an argv
 * argument or a regular `--prompt-file`; stdin piping fails), so there is no
 * one-shot support and no GUI structured session — Muse is terminal-only
 * until it ships a real ACP mode.
 */

const MUSE_APPROVAL_MODES = new Set(["untrusted", "on-request", "never"]);

/**
 * Model / effort / approval flags for the interactive TUI. Always includes
 * `--trust-workspace` so a PTY never blocks on Muse's trust prompt.
 */
export function buildMuseConfigFlags(config: ThreadConfig): string[] {
  const args: string[] = ["--trust-workspace"];

  if (config.model) {
    args.push("--model", config.model);
  }
  if (config.effort) {
    args.push("--reasoning-effort", config.effort);
  }

  const policy = config.approvalPolicy;
  if (policy === "bypassPermissions" || policy === "yolo") {
    args.push("--yolo");
  } else if (policy && MUSE_APPROVAL_MODES.has(policy)) {
    args.push("--approval-mode", policy);
  }

  return args;
}

/**
 * Argv for interactive `muse` (TUI / PTY). Optional trailing prompt is the
 * CLI's documented positional launch prompt.
 */
export function buildMuseArgs(config: ThreadConfig, prompt?: string): string[] {
  const args = buildMuseConfigFlags(config);
  if (prompt && prompt.trim().length > 0) {
    args.push(prompt);
  }
  return args;
}

/**
 * Argv for `muse resume <session-uuid>` (config flags after the subcommand so
 * they stay with the resumed session — real 1.0.2 help confirms root options
 * may appear on either side of `resume`).
 */
export function buildMuseResumeArgs(sessionRef: string, config: ThreadConfig): string[] {
  return ["resume", sessionRef, ...buildMuseConfigFlags(config)];
}
