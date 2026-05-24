import type { ThreadConfig } from "@/shared/contracts";

/**
 * Flag references — verified against `grok --help`, `grok agent --help`, and
 * the Grok docs on grok 0.1.218:
 *   https://docs.x.ai/build/cli/headless-scripting
 *   https://docs.x.ai/build/modes-and-commands
 *
 * Constraints we encode here:
 *   • `--permission-mode <MODE>` is documented as headless-only — the TUI
 *     silently ignores it and `grok agent stdio` accepts it without effect
 *     (verified live: a session created with `--permission-mode plan`
 *     reports "normal mode" when asked). We don't pass it. The only
 *     approval control Grok honors at launch is `--always-approve`
 *     (alias `--yolo`).
 *   • `--no-plan` is a hard restriction — passing it disables plan tooling
 *     entirely. Lightcode never sets it; plan mode is entered when the
 *     model calls `enter_plan_mode` and the user approves
 *     (`~/.grok/docs/user-guide/19-plan-mode.md`).
 *   • `--effort` / `--reasoning-effort` are not surfaced in the Grok
 *     composer (the CLI flag is headless-only and ACP doesn't advertise
 *     effort either), so we don't emit them.
 *   • Grok ACP (`session/new`) does not advertise `modes` / `configOptions`
 *     for permission modes, so even on ACP we drive bypass via the CLI
 *     flag rather than `setSessionMode`.
 */

function isBypassApproval(config: ThreadConfig): boolean {
  switch (config.approvalPolicy) {
    case "bypassPermissions":
      return true;
    // Tolerate legacy thread configs persisted before approvalPolicies were
    // pruned to what Grok actually honors.
    case "never":
    case "yolo":
      return true;
    default:
      return false;
  }
}

/**
 * Argv for `grok` (TUI / PTY).
 *
 * Resume semantics (per `grok --help`):
 *   `-r, --resume [<SESSION_ID>]`  Resume by ID, or the most recent if omitted.
 *
 * We pass `-r <id>` when we already know the session ID (typically minted via
 * ACP just before launch). We never use `-c, --continue` — by user request,
 * we standardise on `-r`. Bare `-r` is also skipped because Grok exits 1 when
 * no prior session exists for the cwd.
 */
export function buildGrokArgs(
  config: ThreadConfig,
  _prompt: string,
  resumeSessionId?: string,
): string[] {
  const args: string[] = [];

  if (resumeSessionId) {
    args.push("-r", resumeSessionId);
  }

  if (config.model) {
    args.push("-m", config.model);
  }

  if (isBypassApproval(config)) {
    args.push("--always-approve");
  }

  return args;
}

/**
 * Argv prefix for `grok [FLAGS] agent stdio` (ACP / GUI tab and mint helper).
 */
export function buildGrokAcpArgs(config: ThreadConfig): string[] {
  const args: string[] = [];

  if (config.model) {
    args.push("-m", config.model);
  }
  if (isBypassApproval(config)) {
    args.push("--always-approve");
  }

  return args;
}
