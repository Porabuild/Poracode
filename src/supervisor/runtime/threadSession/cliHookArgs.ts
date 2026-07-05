import type { ProjectLocation, SessionRef, ThreadConfig } from "@/shared/contracts";
import type { AgentAdapter } from "../../agents/base";
import { prepareClaudeMergedSettingsFile } from "../../agents/claude/mergedSettings";
import { isClaudeAdapterKind } from "./helpers";

/**
 * Swap the hook plugin's `--settings <path>` for a sibling file with the
 * session flags merged in (ultracode and/or fast mode). Claude's CLI keeps
 * only the first `--settings` it sees and silently drops the rest, so the
 * inline flags and the plugin's hooks file can't coexist as separate flags —
 * they have to be one file.
 */
export async function applyClaudeMergedSettingsRewrite(
  adapter: AgentAdapter,
  args: string[],
  config: ThreadConfig,
  projectLocation: ProjectLocation,
): Promise<string[]> {
  if (!isClaudeAdapterKind(adapter.kind)) return args;
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

/**
 * Hook-launch flags must stay in the option section of the argv. Appending
 * them after positional session ids / prompts makes Codex treat
 * `--enable <hooks-feature>` as trailing user input instead of a real flag.
 */
export function mergeCliHookExtraArgs(
  adapter: AgentAdapter,
  args: string[],
  extraArgs: string[],
  prompt: string,
  sessionRef?: SessionRef,
): string[] {
  if (extraArgs.length === 0) {
    return args;
  }

  if (adapter.kind === "codex") {
    let trailingPositionals = 0;
    if (args[0] === "resume" || sessionRef) {
      trailingPositionals += 1;
    }
    if (prompt.trim().length > 0) {
      trailingPositionals += 1;
    }
    const insertAt = Math.max(args.length - trailingPositionals, args[0] === "resume" ? 1 : 0);
    return [...args.slice(0, insertAt), ...extraArgs, ...args.slice(insertAt)];
  }

  if (isClaudeAdapterKind(adapter.kind)) {
    const insertAt = prompt.trim().length > 0 ? args.length - 1 : args.length;
    return [...args.slice(0, insertAt), ...extraArgs, ...args.slice(insertAt)];
  }

  return [...args, ...extraArgs];
}
