/**
 * Runs inside WSL (login-shell `node` invocation) to execute the Claude Agent SDK
 * with a Linux `claude` path. Prints one JSON object on stdout:
 * `{ "slashCommands": AgentSlashCommand[], "fastAvailable"?: boolean }`.
 *
 * Args: <claudePath> <timeoutMs> [<fastModeCachePath>]. When the cache path is
 * given (a `/mnt/c/...` mount of the host cache), fast-mode availability is
 * probed once per account and shared with the native path.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SlashCommand } from "@anthropic-ai/claude-agent-sdk";
import { AsyncPromptQueue } from "./promptQueue";
import { resolveFastAvailability } from "./fastModeProbe";
import { spawnClaudeProbeProcess } from "./sdkProbeProcess";
import { claudeCapabilitiesFromSdkModels } from "./models";

/**
 * Mirrors `mapClaudeSlashCommands` / `readClaudeSkillNames` from `probe.ts`.
 * Kept local so this worker stays a self-contained bundle for in-distro `node`
 * (importing `probe.ts` would drag the supervisor's WSL/base helpers in).
 */
function mapCommands(commands: SlashCommand[], skillNames?: ReadonlySet<string>) {
  return commands.map((c) => {
    const base = {
      id: c.name,
      label: c.description?.trim() ? `${c.name} — ${c.description}` : c.name,
      ...(c.description?.trim() ? { description: c.description } : {}),
      ...(c.argumentHint ? { argumentHint: c.argumentHint } : {}),
    };
    if (!skillNames?.has(c.name)) return base;
    return {
      ...base,
      section: "skills" as const,
      skillName: c.name,
      skillInvocation: `Use the ${c.name} skill.`,
      skillProvider: "Claude",
      skillScope: "global" as const,
    };
  });
}

async function readSkillNames(runtime: {
  reloadSkills: () => Promise<{ skills: readonly { name: string }[] }>;
}): Promise<Set<string> | undefined> {
  try {
    const { skills } = await runtime.reloadSkills();
    return new Set(skills.map((skill) => skill.name));
  } catch {
    return undefined;
  }
}

async function main() {
  const claudePath = process.argv[2];
  const timeoutMs = Math.min(Math.max(Number(process.argv[3]) || 12_000, 3000), 60_000);
  const cachePath = process.argv[4]?.trim() || undefined;

  if (!claudePath?.trim()) {
    console.error(JSON.stringify({ error: "missing_claude_path" }));
    process.exitCode = 2;
    return;
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const queue = new AsyncPromptQueue();

  try {
    const q = query({
      prompt: queue,
      options: {
        abortController: abort,
        pathToClaudeCodeExecutable: claudePath,
        persistSession: false,
        cwd: "/tmp",
        settingSources: ["user", "project", "local"],
        allowedTools: [],
        stderr: () => {},
        spawnClaudeCodeProcess: spawnClaudeProbeProcess,
      },
    });

    const init = await q.initializationResult();
    const slashCommands = mapCommands(init.commands, await readSkillNames(q));
    const modelCapabilities = claudeCapabilitiesFromSdkModels(init.models);
    const fastAvailable = cachePath
      ? await resolveFastAvailability(q, queue, init.account?.email, cachePath)
      : undefined;

    const payload = {
      ...(modelCapabilities ?? {}),
      slashCommands,
      ...(fastAvailable !== undefined ? { fastAvailable } : {}),
    };
    console.log(JSON.stringify(payload));
    try {
      queue.close();
      q.close();
    } catch {
      // ignore
    }
    abort.abort();
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

void main();
