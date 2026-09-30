import { homedir } from "node:os";
import { basename, join } from "node:path";
import { agentProfileKind, parseClaudeProfileInstanceConfig } from "@/shared/contracts";
import type {
  SessionImportProvider,
  ImportHome,
  SessionHead,
} from "@/shared/sessionImport/provider";
import { stripInjectedContext } from "./text";
import { claudeHeadFields, claudeUserText } from "./head";
import { parseClaudeTranscript } from "./transcript";
import { readClaudeTitle } from "./titles";
import { readFileSync } from "node:fs";
/**
 * Claude Code keeps its login in `.claude.json`: next to the config dir for
 * the default home (`~/.claude.json`), inside it when `CLAUDE_CONFIG_DIR` is
 * set — which is how Poracode runs every profile.
 */
export function readClaudeAccountId(configDir: string): string | undefined {
  const path =
    configDir === join(homedir(), ".claude")
      ? join(homedir(), ".claude.json")
      : join(configDir, ".claude.json");
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      oauthAccount?: { accountUuid?: unknown };
    };
    const id = parsed.oauthAccount?.accountUuid;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

function claudeHome(agentKind: string, dir: string): ImportHome {
  const accountId = readClaudeAccountId(dir);
  return { provider: "claude", agentKind, dir, ...(accountId ? { accountId } : {}) };
}

function resolveNativeTildePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

function readHead(prefix: string, path: string): SessionHead | undefined {
  const fields = claudeHeadFields(prefix);
  if (!Object.values(fields).some((field) => field !== undefined)) return undefined;
  const id = fields.id ?? basename(path).replace(/\.jsonl$/iu, "");
  if (!id) return undefined;
  return {
    providerSessionId: id,
    ...(fields.cwd ? { cwd: fields.cwd } : {}),
    ...(fields.startedAt ? { startedAt: fields.startedAt } : {}),
    ...(fields.model ? { model: fields.model } : {}),
    ...(fields.accountId ? { accountId: fields.accountId } : {}),
  };
}
export const claudeSessionImport: SessionImportProvider = {
  kind: "claude",
  transcriptRoot: "projects",
  acceptFile: (name) => name.endsWith(".jsonl"),
  homes(settings) {
    const homes: ImportHome[] = [claudeHome("claude", join(homedir(), ".claude"))];
    for (const instance of Object.values(settings.agentInstances)) {
      if (instance.enabled === false || instance.driver !== "claude") continue;
      try {
        const config = parseClaudeProfileInstanceConfig(instance.config);
        homes.push(
          claudeHome(
            agentProfileKind(instance.driver, instance.id),
            resolveNativeTildePath(config.configDir),
          ),
        );
      } catch {
        /* Ignore malformed profile records. */
      }
    }
    return homes;
  },
  readHead,
  userText: claudeUserText,
  cleanUserText: stripInjectedContext,
  titleFromTranscript: true,
  createTitleReader: () => (path) => readClaudeTitle(path),
  parseTranscript: parseClaudeTranscript,
};
