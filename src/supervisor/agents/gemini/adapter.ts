import type {
  AgentCapability,
  AgentStatus,
  ProjectLocation,
  PromptSegment,
  ThreadConfig,
} from "../../../shared/contracts";
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
} from "../base";
import { detectGeminiTerminalStatus } from "./terminal";

const capabilities: AgentCapability = {
  models: [
    { id: "auto-gemini-3", label: "Auto (Gemini 3)" },
    { id: "auto-gemini-2.5", label: "Auto (Gemini 2.5)" },
    { id: "gemini-3.1-pro-preview", label: "3.1 Pro Preview" },
    { id: "gemini-3-flash-preview", label: "3 Flash Preview" },
    { id: "gemini-2.5-pro", label: "2.5 Pro" },
    { id: "gemini-2.5-flash", label: "2.5 Flash" },
    { id: "gemini-2.5-flash-lite", label: "2.5 Flash Lite" },
  ],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default" },
    { id: "auto_edit", label: "Auto Edit" },
    { id: "never", label: "Full Access" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
};

function buildGeminiArgs(config: ThreadConfig, prompt: string, resumeSessionId?: string): string[] {
  const args: string[] = [];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }
  if (config.model) {
    args.push("--model", config.model);
  }
  if (config.mode === "plan") {
    args.push("--approval-mode=plan");
  } else if (config.approvalPolicy === "never") {
    args.push("--approval-mode=yolo");
  } else if (config.approvalPolicy === "auto_edit") {
    args.push("--approval-mode=auto_edit");
  }
  if (prompt.trim().length > 0) {
    args.push(prompt);
  }
  return args;
}

const SESSION_UUID_RE = /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/;
const INVALID_SESSION_RE = /Error resuming session:\s+Invalid session identifier/i;

function parseAllSessionIds(output: string): string[] {
  const ids: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = SESSION_UUID_RE.exec(line);
    if (match?.[1]) ids.push(match[1]);
  }
  return ids;
}


export function detectGeminiInvalidSessionRef(output: string): boolean {
  return INVALID_SESSION_RE.test(output);
}

export function createGeminiAdapter(): AgentAdapter {
  const detectedWslExecPaths = new Map<string, string | undefined>();
  /** Latest session ID seen before the TUI spawned — used to detect the new one. */
  let preSpawnLatestId: string | undefined;

  async function queryLatestSessionId(location: ProjectLocation): Promise<string | undefined> {
    let output: string | undefined;
    if (location.kind === "wsl") {
      const executablePath = resolveWslExecPath(location) ?? "gemini";
      const result = await readWslCommandOutputAsync(
        location.distro,
        executablePath,
        ["--list-sessions"],
        { cwd: location.linuxPath },
      );
      if (!result.ok) console.log("[gemini] --list-sessions (wsl) failed: %s", result.stderr);
      output = result.ok ? result.stdout : undefined;
    } else if (location.kind === "windows" || location.kind === "posix") {
      const cwd = location.path;
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      try {
        const { stdout } = await execFileAsync("gemini", ["--list-sessions"], {
          cwd,
          shell: true,
          windowsHide: true,
          timeout: 10_000,
        });
        output = (stdout ?? "").trim() || undefined;
      } catch {
        // Will retry on next poll
      }
    }
    if (!output) return undefined;
    // Last numbered line has the most recent session
    const ids = parseAllSessionIds(output);
    return ids[ids.length - 1];
  }

  function resolveWslExecPath(location: ProjectLocation): string | undefined {
    if (location.kind !== "wsl") {
      return undefined;
    }

    const cached = detectedWslExecPaths.get(location.distro);
    if (cached) {
      return cached;
    }

    const resolved = resolveWslExecutablePath(location.distro, "gemini");
    detectedWslExecPaths.set(location.distro, resolved);
    return resolved;
  }

  return {
    kind: "gemini",
    label: "Gemini",
    capabilities,

    async detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus> {
      const isWsl = ctx?.envKind === "wsl" && ctx.wslDistro;

      if (isWsl) {
        const [whichResult, apiKeyResult, configDirResult] = await batchWslCommandsAsync(
          ctx.wslDistro!,
          ["command -v gemini", "echo $GEMINI_API_KEY", "test -d ~/.gemini && echo yes"],
        );
        const executablePath = whichResult?.ok ? whichResult.stdout : undefined;
        detectedWslExecPaths.set(ctx.wslDistro!, executablePath);
        const versionResult = executablePath
          ? await readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["--version"])
          : undefined;

        const hasApiKey = apiKeyResult?.ok && apiKeyResult.stdout.trim().length > 0;
        const hasConfigDir = configDirResult?.ok && configDirResult.stdout.trim() === "yes";
        const authState = hasApiKey || hasConfigDir ? "authenticated" : "unknown";

        return {
          kind: "gemini",
          label: "Gemini",
          installed: executablePath !== undefined,
          ...(executablePath ? { executablePath } : {}),
          ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
          authState,
          capabilities,
        };
      }

      const executablePath = await resolveExecutablePathAsync("gemini");
      const versionResult = executablePath
        ? await readCommandOutputAsync("gemini", ["--version"])
        : undefined;

      // Gemini has no "auth status" CLI command — detect heuristically
      const hasApiKey =
        typeof process !== "undefined" &&
        process.env.GEMINI_API_KEY !== undefined &&
        process.env.GEMINI_API_KEY.length > 0;
      const authState =
        executablePath === undefined ? "missing" : hasApiKey ? "authenticated" : "unknown";

      return {
        kind: "gemini",
        label: "Gemini",
        installed: executablePath !== undefined,
        ...(executablePath ? { executablePath } : {}),
        ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
        authState,
        capabilities,
      };
    },

    buildLaunchCommand(location, config, prompt) {
      // Snapshot the latest session ID before TUI spawn so we can detect the new one
      void queryLatestSessionId(location).then((id) => {
        preSpawnLatestId = id;
      });
      const args = buildGeminiArgs(config, prompt);
      return buildAgentCommand(location, "gemini", args, resolveWslExecPath(location));
    },

    buildResumeCommand(location, config, prompt, sessionRef) {
      const args = buildGeminiArgs(config, prompt, sessionRef.providerSessionId);
      return buildAgentCommand(location, "gemini", args, resolveWslExecPath(location));
    },

    createInitialSessionRef() {
      return undefined;
    },

    buildDirectInput(prompt) {
      // Gemini's TUI treats bulk writes as pastes. Newlines in pasted text
      // become input newlines instead of submit. Use empty spacer chunks to
      // add ~50ms delay between the text and the Enter key so the TUI
      // processes them as separate events (type → submit).
      return [prompt, "@wait:40", "\r"];
    },

    formatPromptSegments(segments: PromptSegment[]) {
      // Gemini CLI's @ handler doesn't expand ~ — always use full absolute paths.
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map((s) => (s.kind === "file" ? `@${s.path}` : s.content)).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    detectTerminalStatus: detectGeminiTerminalStatus,
    detectInvalidSessionRef: detectGeminiInvalidSessionRef,

    defaultOneShotModel: "gemini-2.5-flash",

    async discoverSessionRef(location) {
      try {
        const latestId = await queryLatestSessionId(location);
        if (!latestId || latestId === preSpawnLatestId) return undefined;
        return createKnownSessionRef(latestId);
      } catch {
        return undefined;
      }
    },

    buildOneShotCommand(model, _effort) {
      return { command: "gemini", args: ["-p", "--model", model] };
    },
  };
}
