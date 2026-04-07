import type {
  AgentCapability,
  AgentStatus,
  AuthState,
  ProjectLocation,
  PromptSegment,
  ThreadConfig,
} from "../../shared/contracts";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  createKnownSessionRef,
  readCommandOutputAsync,
  readWslCommandOutputAsync,
  resolveExecutablePathAsync,
  resolveWslExecutablePath,
  type AgentAdapter,
  type AgentEnvContext,
  type TerminalStatusHint,
} from "./base";

const capabilities: AgentCapability = {
  models: [{ id: "auto", label: "Auto" }],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
};

const CURSOR_APPROVAL_RE =
  /(?:approve\s*\(y\)|reject\s*\(n\)|\[y\/n\]|\(y\/n\)|allow .*?\?)/i;
const CURSOR_REPLY_RE = /enter to select/i;
const CURSOR_WORKING_RE = /(?:esc|escape|ctrl-c)\s+to\s+interrupt|\b(?:thinking|working|running)\b/i;
const CURSOR_IDLE_RE = /(?:^|\n)>\s*(?:type (?:a|your) message)?\s*$/im;
const CURSOR_IDLE_FALLBACK_RE = /type (?:a|your) message|@ to add files/i;
const CURSOR_INVALID_SESSION_RE =
  /invalid (?:resume|session|thread|chat|conversation)|could not (?:find|load).*(?:session|thread|chat|conversation)|unknown .*resume/i;

function buildCursorArgs(
  config: ThreadConfig,
  prompt: string,
  resumeSessionId?: string,
): string[] {
  const args: string[] = [];

  if (resumeSessionId) {
    args.push(`--resume=${resumeSessionId}`);
  }
  if (config.model && config.model !== "auto") {
    args.push("--model", config.model);
  }
  if (prompt.trim().length > 0) {
    args.push(prompt);
  }

  return args;
}

function normalizeCursorToken(value: string): string {
  return value.replace(/^[`"'([{<]+|[`"')\]}>.,:;]+$/g, "");
}

function isLikelyCursorSessionId(value: string): boolean {
  const token = normalizeCursorToken(value);
  if (token.length < 8 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return false;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(token) || /^\d{1,2}:\d{2}(?::\d{2})?$/.test(token)) {
    return false;
  }
  if (!/\d/.test(token)) {
    return false;
  }

  return token.includes("-") || token.includes("_") || token.length >= 16;
}

export function parseCursorSessionIds(output: string): string[] {
  const ids: string[] = [];

  for (const line of output.split(/\r?\n/g)) {
    const cleaned = line.trim();
    if (!cleaned) {
      continue;
    }
    if (/^(thread|threads|id|title|updated|created)\b/i.test(cleaned)) {
      continue;
    }

    const tokens = cleaned
      .replace(/^[>*•-]\s*/, "")
      .replace(/^\d+[.)]?\s+/, "")
      .split(/\s+/g)
      .map(normalizeCursorToken);

    const candidate = tokens.find(isLikelyCursorSessionId);
    if (candidate) {
      ids.push(candidate);
    }
  }

  return [...new Set(ids)];
}

function getLatestCursorSessionId(output: string): string | undefined {
  return parseCursorSessionIds(output).at(-1);
}

function findBestCursorHint(
  text: string,
  entries: Array<{
    re: RegExp;
    status: TerminalStatusHint["status"];
    attention: TerminalStatusHint["attention"];
  }>,
): TerminalStatusHint | null {
  let best:
    | {
        index: number;
        status: TerminalStatusHint["status"];
        attention: TerminalStatusHint["attention"];
      }
    | undefined;

  for (const entry of entries) {
    const globalRe = new RegExp(
      entry.re.source,
      entry.re.flags.includes("g") ? entry.re.flags : entry.re.flags + "g",
    );
    let match: RegExpExecArray | null;
    let last: RegExpExecArray | null = null;
    while ((match = globalRe.exec(text)) !== null) {
      last = match;
    }
    if (last && (!best || last.index > best.index)) {
      best = {
        index: last.index,
        status: entry.status,
        attention: entry.attention,
      };
    }
  }

  return best
    ? {
        status: best.status,
        attention: best.attention,
      }
    : null;
}

export function detectCursorTerminalStatus(text: string): TerminalStatusHint | null {
  const recent = text.slice(-1200);
  const hint = findBestCursorHint(recent, [
    { re: CURSOR_APPROVAL_RE, status: "needs_approval", attention: "needs_approval" },
    { re: CURSOR_REPLY_RE, status: "needs_reply", attention: "needs_reply" },
    { re: CURSOR_WORKING_RE, status: "working", attention: "working" },
    { re: CURSOR_IDLE_RE, status: "idle", attention: "none" },
    { re: CURSOR_IDLE_FALLBACK_RE, status: "idle", attention: "none" },
  ]);
  if (!hint) return null;

  // Dual-pattern corroboration for idle: require both the `>` prompt
  // and a secondary indicator ("type a/your message", "@ to add files").
  if (hint.status === "idle") {
    hint.corroborated = CURSOR_IDLE_RE.test(recent) && CURSOR_IDLE_FALLBACK_RE.test(recent);
  } else {
    // Non-idle patterns (approval, reply, working) are specific enough
    // to be self-corroborating.
    hint.corroborated = true;
  }

  return hint;
}

export function detectCursorInvalidSessionRef(text: string): boolean {
  return CURSOR_INVALID_SESSION_RE.test(text);
}

function resolveCursorAuthState(result: { ok: boolean; stdout: string; stderr: string } | undefined): AuthState {
  if (!result) {
    return "missing";
  }

  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (/not\s+logged\s+in|login required|sign in/i.test(text)) {
    return "unknown";
  }

  return result.ok ? "authenticated" : "unknown";
}

export function createCursorAdapter(): AgentAdapter {
  const detectedWslExecPaths = new Map<string, string | undefined>();
  let preSpawnLatestId: string | undefined;

  function resolveWslExecPath(location: ProjectLocation): string | undefined {
    if (location.kind !== "wsl") {
      return undefined;
    }

    const cached = detectedWslExecPaths.get(location.distro);
    if (cached) {
      return cached;
    }

    const resolved = resolveWslExecutablePath(location.distro, "cursor-agent");
    detectedWslExecPaths.set(location.distro, resolved);
    return resolved;
  }

  async function queryLatestSessionId(location: ProjectLocation): Promise<string | undefined> {
    if (location.kind === "wsl") {
      const executablePath = resolveWslExecPath(location) ?? "cursor-agent";
      const result = await readWslCommandOutputAsync(
        location.distro,
        executablePath,
        ["ls"],
        { cwd: location.linuxPath },
      );
      return result.ok ? getLatestCursorSessionId(result.stdout) : undefined;
    }

    const cwd = location.path;
    const result = await readCommandOutputAsync("cursor-agent", ["ls"], { cwd });
    return result.ok ? getLatestCursorSessionId(result.stdout) : undefined;
  }

  return {
    kind: "cursor",
    label: "Cursor CLI",
    capabilities,
    async detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus> {
      const isWsl = ctx?.envKind === "wsl" && ctx.wslDistro;

      if (isWsl) {
        const [whichResult] = await batchWslCommandsAsync(ctx.wslDistro!, [
          "command -v cursor-agent",
        ]);
        const executablePath = whichResult?.ok ? whichResult.stdout : undefined;
        detectedWslExecPaths.set(ctx.wslDistro!, executablePath);
        const [versionResult, statusResult] = await Promise.all([
          executablePath
            ? readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["--version"])
            : undefined,
          executablePath
            ? readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["status"])
            : undefined,
        ]);

        return {
          kind: "cursor",
          label: "Cursor CLI",
          installed: executablePath !== undefined,
          ...(executablePath ? { executablePath } : {}),
          ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
          authState:
            executablePath === undefined ? "missing" : resolveCursorAuthState(statusResult),
          capabilities,
        };
      }

      const executablePath = await resolveExecutablePathAsync("cursor-agent");
      const [versionResult, statusResult] = await Promise.all([
        executablePath ? readCommandOutputAsync("cursor-agent", ["--version"]) : undefined,
        executablePath ? readCommandOutputAsync("cursor-agent", ["status"]) : undefined,
      ]);

      return {
        kind: "cursor",
        label: "Cursor CLI",
        installed: executablePath !== undefined,
        ...(executablePath ? { executablePath } : {}),
        ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
        authState: executablePath === undefined ? "missing" : resolveCursorAuthState(statusResult),
        capabilities,
      };
    },
    buildLaunchCommand(location, config, prompt) {
      void queryLatestSessionId(location).then((id) => {
        preSpawnLatestId = id;
      });
      const args = buildCursorArgs(config, prompt);
      return buildAgentCommand(location, "cursor-agent", args, resolveWslExecPath(location));
    },
    buildResumeCommand(location, config, prompt, sessionRef) {
      const args = buildCursorArgs(config, prompt, sessionRef.providerSessionId);
      return buildAgentCommand(location, "cursor-agent", args, resolveWslExecPath(location));
    },
    createInitialSessionRef() {
      return undefined;
    },
    buildDirectInput(prompt) {
      return [prompt, "@wait:40", "\r"];
    },
    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map((s) => (s.kind === "file" ? `@${s.path}` : s.content)).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    detectTerminalStatus(text) {
      return detectCursorTerminalStatus(text);
    },
    detectInvalidSessionRef(text) {
      return detectCursorInvalidSessionRef(text);
    },
    defaultOneShotModel: "auto",
    async discoverSessionRef(location) {
      try {
        const latestId = await queryLatestSessionId(location);
        if (!latestId || latestId === preSpawnLatestId) {
          return undefined;
        }
        return createKnownSessionRef(latestId);
      } catch {
        return undefined;
      }
    },
    buildOneShotCommand(model) {
      const args = ["--print", "--force", "--output-format", "json"];
      if (model && model !== "auto") {
        args.push("--model", model);
      }
      return { command: "cursor-agent", args };
    },
  };
}
