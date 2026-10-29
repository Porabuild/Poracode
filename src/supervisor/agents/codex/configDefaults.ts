import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import {
  CODEX_MAX_SUBAGENTS_SETTING_KEY,
  CODEX_PARENT_EFFORT_HINT_KEY,
  CODEX_PARENT_MODEL_HINT_KEY,
  CODEX_PLAN_MODE_EFFORT_SETTING_KEY,
  CODEX_SUBAGENT_EFFORT_SETTING_KEY,
  CODEX_SUBAGENT_MODEL_SETTING_KEY,
} from "@/shared/agents/codexAgentSettings";

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Extract the values Codex's `config.toml` sets for the keys Poracode can
 * override, so Settings can show what applies when a field is left empty.
 * `max_threads` is Codex's accepted alias for the documented key.
 */
export function parseCodexConfigDefaults(raw: string): Record<string, string> {
  const parsed = parseToml(raw) as Record<string, unknown>;
  const agents = (
    parsed.agents && typeof parsed.agents === "object" ? parsed.agents : {}
  ) as Record<string, unknown>;
  const maxThreads = agents.max_concurrent_threads_per_session ?? agents.max_threads;
  const entries: Array<[string, string | undefined]> = [
    [CODEX_SUBAGENT_MODEL_SETTING_KEY, nonEmptyString(agents.default_subagent_model)],
    [CODEX_SUBAGENT_EFFORT_SETTING_KEY, nonEmptyString(agents.default_subagent_reasoning_effort)],
    [
      CODEX_MAX_SUBAGENTS_SETTING_KEY,
      typeof maxThreads === "number" && Number.isInteger(maxThreads)
        ? String(maxThreads)
        : undefined,
    ],
    [CODEX_PLAN_MODE_EFFORT_SETTING_KEY, nonEmptyString(parsed.plan_mode_reasoning_effort)],
    [CODEX_PARENT_MODEL_HINT_KEY, nonEmptyString(parsed.model)],
    [CODEX_PARENT_EFFORT_HINT_KEY, nonEmptyString(parsed.model_reasoning_effort)],
  ];
  return Object.fromEntries(
    entries.filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

/**
 * Read-only. Resolves to an empty record when the file is missing or is not
 * valid TOML, because Settings only uses this to show a hint.
 */
export async function readCodexConfigDefaults(
  codexHome: string = process.env.CODEX_HOME || join(homedir(), ".codex"),
): Promise<Record<string, string>> {
  let raw: string;
  try {
    raw = await readFile(join(codexHome, "config.toml"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[codex] unable to read config.toml defaults:", error);
    }
    return {};
  }
  try {
    return parseCodexConfigDefaults(raw);
  } catch (error) {
    console.warn("[codex] unable to parse config.toml defaults:", error);
    return {};
  }
}
