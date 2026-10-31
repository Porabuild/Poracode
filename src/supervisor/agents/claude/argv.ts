import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import { migrateClaudeUltracodeEffort } from "@/shared/agents/claudeEfforts";
import { CLAUDE_DEFAULT_APPROVAL_POLICY } from "./detection";
import { prepareClaudeMergedSettingsFile } from "./mergedSettings";
import { claudeContextManagedModelId, resolveClaudeContextWindowTokens } from "./contextWindow";

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
  const base = claudeContextManagedModelId(model);
  if (!base) return model;
  const contextWindow = resolveClaudeContextWindowTokens(contextSize);
  if (contextWindow === undefined || contextWindow <= 200_000) return base;
  // 400k is a working-window limit, not a model variant. The model still needs
  // its 1M variant (notably Opus/Sonnet 4.6); the launch override lowers it.
  return `${base}[1m]`;
}

/**
 * Claude Code's native effort level and `ultracode` session flag for a thread.
 * Ultracode runs dynamic workflows at any effort; a config saved while it was
 * an effort tier runs at xhigh with the flag on.
 */
export function claudeEffortAndUltracode(config: Pick<ThreadConfig, "effort" | "workflows">): {
  effort: string | undefined;
  ultracode: boolean;
} {
  const migrated = migrateClaudeUltracodeEffort(config);
  return { effort: migrated.effort || undefined, ultracode: migrated.workflows === true };
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
  // The ultracode flag rides on the `--settings` file (see
  // rewriteClaudeLaunchArgsForConfig); `--effort` carries only the level.
  const { effort } = claudeEffortAndUltracode(config);
  if (effort) {
    args.push("--effort", effort);
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
  const delimiter = args.indexOf("--");
  if (delimiter >= 0) return delimiter;
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
  if (claudeEffortAndUltracode(config).ultracode) flags.ultracode = true;
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
