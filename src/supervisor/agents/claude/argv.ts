import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { CLAUDE_CONTEXT_MANAGED_MODEL_IDS, CLAUDE_DEFAULT_APPROVAL_POLICY } from "./detection";
import { prepareClaudeMergedSettingsFile } from "./mergedSettings";

/**
 * Re-attach the `[<size>]` suffix Claude's CLI uses to pick a context-window
 * variant. For built-in Claude models the suffix is Poracode's own (derived
 * from `contextSize`), so any pre-existing suffix is stripped first to let the
 * chosen `contextSize` win over a stale value baked into a legacy `model` id.
 *
 * Custom / external-provider model ids (e.g. z.ai `glm-5.2[1m]`) are NOT
 * context-managed: their `[1m]` is part of the provider's real model name. Those
 * pass through untouched so the upstream model still resolves — stripping it
 * would send `glm-5.2`, which z.ai rejects.
 */
export function applyClaudeContextSuffix(model: string, contextSize?: string): string {
  const base = model.replace(/\[[0-9]+[mk]\]$/i, "");
  if (!CLAUDE_CONTEXT_MANAGED_MODEL_IDS.has(base)) return model;
  if (!contextSize || contextSize === "200k") return base;
  return `${base}[${contextSize}]`;
}

export function buildClaudeArgs(
  config: ThreadConfig,
  prompt: string,
  sessionId?: string,
  assignedSessionId?: string,
): string[] {
  const args: string[] = [];

  if (sessionId) {
    args.push("--resume", sessionId);
  } else if (assignedSessionId) {
    args.push("--session-id", assignedSessionId);
  }

  if (config.model) {
    args.push("--model", applyClaudeContextSuffix(config.model, config.contextSize));
  }
  if (config.effort) {
    // `ultracode` is a Claude Code setting (xhigh reasoning + dynamic
    // workflows), not an `--effort` value. Send `xhigh` to the model; the
    // dynamic-workflow toggle rides on the `--settings` file — wired via
    // applyFlagSettings on the SDK path and via the ultracode-merged
    // settings.json rewrite on the PTY path.
    args.push("--effort", config.effort === "ultracode" ? "xhigh" : config.effort);
  }

  args.push("--allow-dangerously-skip-permissions");

  const permissionMode =
    config.mode === "plan" ? "plan" : (config.approvalPolicy ?? CLAUDE_DEFAULT_APPROVAL_POLICY);
  args.push("--permission-mode", permissionMode);

  if (prompt.trim().length > 0) {
    args.push(prompt);
  }
  return args;
}

/**
 * Hook-launch flags land before the trailing prompt positional (when
 * present) so Claude's CLI keeps reading them as options.
 */
export function claudeExtraArgsPosition(args: string[], prompt: string): number {
  return prompt.trim().length > 0 ? args.length - 1 : args.length;
}

/**
 * Swap the hook plugin's `--settings <path>` for a sibling file with the
 * session flags merged in (ultracode and/or fast mode). Claude's CLI keeps
 * only the first `--settings` it sees and silently drops the rest, so the
 * inline flags and the plugin's hooks file can't coexist as separate flags —
 * they have to be one file.
 */
export async function rewriteClaudeLaunchArgsForConfig(
  args: string[],
  config: ThreadConfig,
  projectLocation: ProjectLocation,
): Promise<string[]> {
  const flags: Record<string, unknown> = {};
  if (config.effort === "ultracode") flags.ultracode = true;
  if (config.fast === true) flags.fastMode = true;
  if (Object.keys(flags).length === 0) return args;
  const idx = args.findIndex((arg, i) => arg === "--settings" && i + 1 < args.length);
  if (idx < 0) return args;
  const originalPath = args[idx + 1];
  if (!originalPath) return args;
  const rewritten = await prepareClaudeMergedSettingsFile(originalPath, projectLocation, flags);
  if (!rewritten) return args;
  const out = [...args];
  out[idx + 1] = rewritten;
  return out;
}
