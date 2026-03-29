import type {
  AgentCapability,
  AgentStatus,
  ProjectLocation,
  ThreadConfig,
} from "../../../shared/contracts";
import {
  batchWslCommandsAsync,
  createKnownSessionRef,
  readCommandOutputAsync,
  readWslCommandOutputAsync,
  resolveExecutablePathAsync,
  resolveWslExecutablePath,
  wrapWslCommand,
  type AgentAdapter,
  type AgentEnvContext,
} from "../base";
import { detectGeminiTerminalStatus } from "./terminal";

const capabilities: AgentCapability = {
  models: [
    "auto",
    "auto-gemini-2.5",
    "gemini-3.1-pro-preview",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ],
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: ["default", "auto_edit", "never"],
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

function parseLatestSessionId(output: string): string | undefined {
  // Lines are numbered 1..N; the last numbered line is the most recent session.
  const lines = output.split(/\r?\n/).filter((l) => /^\s*\d+\./.test(l));
  const last = lines[lines.length - 1];
  return last ? SESSION_UUID_RE.exec(last)?.[1] : undefined;
}

export function detectGeminiInvalidSessionRef(output: string): boolean {
  return INVALID_SESSION_RE.test(output);
}

export function createGeminiAdapter(): AgentAdapter {
  const detectedWslExecPaths = new Map<string, string | undefined>();

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
      const args = buildGeminiArgs(config, prompt);
      return wrapWslCommand(location, "gemini", args, resolveWslExecPath(location));
    },

    buildResumeCommand(location, config, prompt, sessionRef) {
      const args = buildGeminiArgs(config, prompt, sessionRef.providerSessionId);
      return wrapWslCommand(location, "gemini", args, resolveWslExecPath(location));
    },

    createInitialSessionRef() {
      return undefined;
    },

    buildDirectInput(prompt) {
      // Gemini's TUI treats bulk writes as pastes. Newlines in pasted text
      // become input newlines instead of submit. Use empty spacer chunks to
      // add ~50ms delay between the text and the Enter key so the TUI
      // processes them as separate events (type → submit).
      return [prompt, "", "", "", "", "", "\r"];
    },

    detectTerminalStatus: detectGeminiTerminalStatus,
    detectInvalidSessionRef: detectGeminiInvalidSessionRef,

    defaultOneShotModel: "gemini-2.5-flash",

    async discoverSessionRef(location) {
      try {
        let output: string | undefined;

        if (location.kind === "wsl") {
          const executablePath = resolveWslExecPath(location) ?? "gemini";
          const result = await readWslCommandOutputAsync(
            location.distro,
            executablePath,
            ["--list-sessions"],
            {
              cwd: location.linuxPath,
            },
          );
          output = result.ok ? result.stdout : undefined;
        } else if (location.kind === "windows") {
          const result = await readCommandOutputAsync("gemini", ["--list-sessions"], {
            cwd: location.path,
          });
          output = result.ok ? result.stdout : undefined;
        }

        if (!output) return undefined;
        const sessionId = parseLatestSessionId(output);
        return sessionId ? createKnownSessionRef(sessionId) : undefined;
      } catch {
        return undefined;
      }
    },

    buildOneShotCommand(model, _effort) {
      return { command: "gemini", args: ["-p", "--model", model] };
    },
  };
}
