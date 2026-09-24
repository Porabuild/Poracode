import { homedir } from "node:os";
import { basename, join } from "node:path";
import { agentProfileKind } from "@/shared/contracts";
import type {
  SessionImportProvider,
  ImportHome,
  SessionHead,
} from "@/shared/sessionImport/provider";
import { stripInjectedContext } from "./text";
import { codexHeadFields, codexUserText } from "./head";
import { parseCodexTranscript } from "./transcript";
import { readCodexTitles } from "./titles";
function resolveNativeTildePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

function readHead(prefix: string, path: string): SessionHead | undefined {
  const fields = codexHeadFields(prefix);
  if (!Object.values(fields).some((field) => field !== undefined)) return undefined;
  const id =
    fields.id ??
    basename(path)
      .replace(/\.jsonl$/iu, "")
      .replace(/^rollout-[\dT-]*?-/u, "");
  if (!id) return undefined;
  return {
    providerSessionId: id,
    ...(fields.cwd ? { cwd: fields.cwd } : {}),
    ...(fields.startedAt ? { startedAt: fields.startedAt } : {}),
    ...(fields.model ? { model: fields.model } : {}),
    excluded:
      fields.threadSource === "subagent" ||
      fields.source === "exec" ||
      fields.originator === "codex_exec",
  };
}
export const codexSessionImport: SessionImportProvider = {
  kind: "codex",
  transcriptRoot: "sessions",
  acceptFile: (name) => name.startsWith("rollout-") && name.endsWith(".jsonl"),
  homes(settings) {
    const homes: ImportHome[] = [
      { provider: "codex", agentKind: "codex", dir: join(homedir(), ".codex") },
    ];
    for (const instance of Object.values(settings.agentInstances)) {
      if (instance.enabled === false || instance.driver !== "codex") continue;
      try {
        const config = instance.config as { homeDir?: unknown };
        if (typeof config?.homeDir !== "string" || !config.homeDir.trim()) continue;
        homes.push({
          provider: "codex",
          agentKind: agentProfileKind(instance.driver, instance.id),
          dir: resolveNativeTildePath(config.homeDir),
        });
      } catch {
        /* Ignore malformed profile records. */
      }
    }
    return homes;
  },
  readHead,
  userText: codexUserText,
  cleanUserText: stripInjectedContext,
  titleFromTranscript: false,
  createTitleReader: (homeDir) => {
    let titles: Map<string, string> | undefined;
    return (_path, id) => {
      titles ??= readCodexTitles(homeDir);
      return titles.get(id);
    };
  },
  parseTranscript: parseCodexTranscript,
};
