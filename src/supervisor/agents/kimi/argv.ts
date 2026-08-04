import type { ThreadConfig } from "@/shared/contracts";

/**
 * Flag references — verified against the Kimi Code CLI docs
 * (https://www.kimi.com/code/docs/en/) for `@moonshot-ai/kimi-code`:
 *
 *   • `-S, --session <id>` resumes an existing session (mutually exclusive with
 *     `-c, --continue`, which resumes the most recent session in the cwd). The
 *     CLI generates its own opaque session ids — there is no flag to pre-assign
 *     one at launch — so resume always targets an id discovered post-spawn.
 *   • `-m, --model <model>` selects the model.
 *   • `--plan` starts the TUI in Plan mode.
 *   • `--auto` enables the auto permission mode; `-y, --yolo` auto-approves
 *     everything. The two are mutually exclusive, and neither may be combined
 *     with the one-shot `-p, --prompt` path.
 *
 * Kimi exposes no `--reasoning-effort` flag; effort tiers (when a model has
 * them) are driven through the ACP protocol, not argv.
 */

function pushApprovalFlags(args: string[], config: ThreadConfig): void {
  switch (config.approvalPolicy) {
    case "bypassPermissions":
    case "yolo":
      args.push("--yolo");
      break;
    case "auto":
      args.push("--auto");
      break;
    default:
      break;
  }
}

/**
 * Argv for `kimi` (TUI / PTY). `session` resumes a discovered id via `-S`.
 * Plan mode and the approval flags are mutually exclusive: `--plan` starts a
 * read-only planning turn, so auto-approve flags are meaningless alongside it.
 */
export function buildKimiArgs(config: ThreadConfig, _prompt: string, session?: string): string[] {
  const args: string[] = [];

  if (session) {
    args.push("--session", session);
  }
  if (config.model) {
    args.push("-m", config.model);
  }
  if (config.mode === "plan") {
    args.push("--plan");
  } else {
    pushApprovalFlags(args, config);
  }

  return args;
}

/**
 * Argv for `kimi -c` (resume the most recent session in the cwd) — the fallback
 * used when no discovered session id is available.
 */
export function buildKimiContinueArgs(config: ThreadConfig): string[] {
  return ["--continue", ...buildKimiArgs(config, "")];
}

/**
 * Argv prefix for `kimi [FLAGS] acp` (ACP / GUI tab). Model + approval ride the
 * launch flags; the ACP session negotiates modes/efforts over the protocol.
 */
export function buildKimiAcpArgs(config: ThreadConfig): string[] {
  const args: string[] = [];
  if (config.model) {
    args.push("-m", config.model);
  }
  pushApprovalFlags(args, config);
  return args;
}
