import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

import type {
  AgentCapability,
  AgentStatus,
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
  type CreateStructuredSessionInput,
  type SyncConfigFromTerminalStateInput,
  type TerminalStatusHint,
} from "./base";
import { createAcpStructuredSession, probeAcpCapabilities } from "./acp";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

const defaultCapabilities: AgentCapability = {
  models: [],
  efforts: ["low", "medium", "high", "xhigh"],
  defaultEffort: "high",
  modelEfforts: {},
  modes: ["agent", "plan"],
  approvalPolicies: [
    { id: "default", label: "Default Approvals" },
    { id: "never", label: "Bypass Approvals" },
  ],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  bypassApprovalPolicy: "never",
  settingDefs: [],
};

const READY_RE =
  /Type @ to mention files, # for issues\/PRs, \/ for commands, or \? for shortcuts/i;

type CopilotHintEntry = {
  re: RegExp;
  status: TerminalStatusHint["status"];
  attention: TerminalStatusHint["attention"];
  planMode?: boolean;
  approvalPolicy?: string;
  strong?: boolean;
};

const COPILOT_HINTS: CopilotHintEntry[] = [
  // ── needs_approval ────────────────────────────────────
  {
    re: /Permission request\s*\(|Path confirmation\s*\(|URL confirmation\s*\(/i,
    status: "needs_approval",
    attention: "needs_approval",
    strong: true,
  },
  // ── needs_reply — interactive forms ───────────────────
  {
    re: /Copilot is requesting information|Enter accept\s*[·•]\s*Tab next\s*[·•]\s*ctrl\+d decline/i,
    status: "needs_reply",
    attention: "needs_reply",
    strong: true,
  },
  {
    re: /Plan Ready for Review|ctrl\+e to show full plan/i,
    status: "needs_reply",
    attention: "needs_reply",
    strong: true,
  },
  // ── needs_reply — persistent action indicator ─────────
  // The TUI form overlay can disappear during redraws, but the conversation
  // action indicator "○ Asking user …" persists in the buffer.
  {
    re: /[○◎◉●]\s*Asking user\b/i,
    status: "needs_reply",
    attention: "needs_reply",
    strong: true,
  },
  // ── needs_reply — existing patterns ───────────────────
  {
    re: /Question\s*\(|Enter to select|This folder is not trusted\. Please confirm folder trust to continue\./i,
    status: "needs_reply",
    attention: "needs_reply",
    strong: true,
  },
  // ── working ───────────────────────────────────────────
  {
    re: /\b(?:thinking|executing|cancelling)\b|\(Esc to cancel\)/i,
    status: "working",
    attention: "working",
    strong: true,
  },
  // ── idle — with mode/policy detection ─────────────────
  { re: /\bautopilot\b/i, status: "idle", attention: "none", approvalPolicy: "autopilot" },
  { re: /\bplan mode\b/i, status: "idle", attention: "none", planMode: true },
  {
    re: READY_RE,
    status: "idle",
    attention: "none",
    strong: true,
  },
];

const INVALID_SESSION_RE = /Failed to resume session:|Session not found:/i;

const COPILOT_KNOWN_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);

function buildCopilotArgs(
  config: ThreadConfig,
  prompt: string,
  sessionId: string,
  _launchOptions?: { suppressResumeConfigOverrides?: boolean },
): string[] {
  const args = [`--resume=${sessionId}`, "--allow-all-paths"];
  const formattedPrompt = formatCopilotInteractivePrompt(prompt, config);

  // Copilot's TUI only reflects the selected model/effort when the resume
  // command also carries those flags, even if ACP already applied them.
  if (config.model) {
    args.push("--model", config.model);
  }
  if (config.effort) {
    args.push("--effort", config.effort);
  }
  if (config.approvalPolicy === "never") {
    args.push("--yolo");
  }
  if (formattedPrompt.trim().length > 0) {
    args.push("-i", formattedPrompt);
  }

  return args;
}

function findBestHint(text: string) {
  let best:
    | {
        index: number;
        entry: (typeof COPILOT_HINTS)[number];
      }
    | undefined;

  for (const entry of COPILOT_HINTS) {
    const globalRe = new RegExp(
      entry.re.source,
      entry.re.flags.includes("g") ? entry.re.flags : entry.re.flags + "g",
    );
    let last: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = globalRe.exec(text)) !== null) {
      last = match;
    }
    if (last && (!best || last.index > best.index)) {
      best = { index: last.index, entry };
    }
  }

  return best?.entry;
}

function detectEnvToken(): boolean {
  return [process.env.COPILOT_GITHUB_TOKEN, process.env.GH_TOKEN, process.env.GITHUB_TOKEN].some(
    (value) => Boolean(value && value.trim().length > 0),
  );
}

async function detectNativeGhAuth(): Promise<boolean> {
  const ghPath = await resolveExecutablePathAsync("gh");
  if (!ghPath) {
    return false;
  }

  const result = await readCommandOutputAsync("gh", ["auth", "status"]);
  return result.ok;
}

// ── Model / effort detection ─────────────────────────────────────────

/**
 * Detect model + effort from explicit "Model changed to:" notification messages.
 * Example: "● Model changed to: claude-opus-4.6 (medium)"
 */
export function detectCopilotModelEffort(
  text: string,
): { rawModel?: string; effort?: string } | null {
  const re = /[●•]\s*Model changed to:\s*(.+?)\s*\((\w+)\)\s*$/gm;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    last = m;
  }
  if (!last) return null;

  const rawModel = last[1]?.trim();
  const rawEffort = last[2]?.toLowerCase();
  const effort = rawEffort && COPILOT_KNOWN_EFFORTS.has(rawEffort) ? rawEffort : undefined;

  if (!rawModel && !effort) return null;
  const result: { rawModel?: string; effort?: string } = {};
  if (rawModel) result.rawModel = rawModel;
  if (effort) result.effort = effort;
  return result;
}

/**
 * Detect model + effort from the persistent Copilot status line.
 * Format: "<path> [<branch>]    <ModelDisplay> [(<effort>)]"
 * Example: "~/work/site-search-ui [↗ dev]          GPT-5.4 (xhigh)"
 */
export function detectCopilotStatusLineModel(
  text: string,
): { rawModel?: string; effort?: string } | null {
  // Match lines with a path prefix, bracketed branch info, then 2+ spaces and model info
  const re = /(?:~\/|\/|[A-Z]:).+\[[^\]]*?\]\s{2,}(.+?)\s*$/gm;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    last = m;
  }
  if (!last) return null;

  let raw = last[1]?.trim();
  if (!raw) return null;

  // Extract known effort from the last parenthetical group
  let effort: string | undefined;
  const effortMatch = raw.match(/\((\w+)\)\s*$/);
  if (effortMatch?.[1] && COPILOT_KNOWN_EFFORTS.has(effortMatch[1].toLowerCase())) {
    effort = effortMatch[1].toLowerCase();
    raw = raw.slice(0, effortMatch.index!).trim();
  }

  // Strip remaining parenthetical decorations like "(3x)" to get clean model name
  const rawModel = raw.replace(/\s*\([^)]*\)/g, "").trim() || undefined;

  if (!rawModel && !effort) return null;
  const result: { rawModel?: string; effort?: string } = {};
  if (rawModel) result.rawModel = rawModel;
  if (effort) result.effort = effort;
  return result;
}

/**
 * Resolve a raw model display name against the adapter's dynamic capabilities.
 * Cascade: exact ID → exact label → substring contains → fallback to raw string.
 */
function resolveModelId(rawModel: string, models: Array<{ id: string; label?: string }>): string {
  if (!models.length) return rawModel;

  const lower = rawModel.toLowerCase();

  // Exact match on ID
  const exactId = models.find((m) => m.id.toLowerCase() === lower);
  if (exactId) return exactId.id;

  // Exact match on label
  const exactLabel = models.find((m) => m.label?.toLowerCase() === lower);
  if (exactLabel) return exactLabel.id;

  // Substring match: raw contains label or label contains raw
  const containsLabel = models.find(
    (m) =>
      m.label && (lower.includes(m.label.toLowerCase()) || m.label.toLowerCase().includes(lower)),
  );
  if (containsLabel) return containsLabel.id;

  // Substring match on ID
  const containsId = models.find(
    (m) => lower.includes(m.id.toLowerCase()) || m.id.toLowerCase().includes(lower),
  );
  if (containsId) return containsId.id;

  // No match — return raw so the config still reflects the TUI change
  return rawModel;
}

export function detectCopilotTerminalStatus(text: string): TerminalStatusHint | null {
  const best = findBestHint(text);
  if (!best) {
    return null;
  }

  const hint: TerminalStatusHint = {
    status: best.status,
    attention: best.attention,
  };

  if (best.planMode) {
    hint.planMode = true;
  }
  if (best.approvalPolicy) {
    hint.approvalPolicy = best.approvalPolicy;
  }

  // Dual-pattern corroboration: strong patterns are self-corroborating.
  // Weak idle patterns ("autopilot", "plan mode") check for the READY_RE
  // as a second independent signal.
  if (best.strong) {
    hint.corroborated = true;
  } else {
    hint.corroborated = COPILOT_HINTS.some(
      (entry) =>
        entry.strong && entry.status === best.status && entry !== best && entry.re.test(text),
    );
  }

  // Detect model/effort: prefer explicit "Model changed to:" over status line
  const modelEffort = detectCopilotModelEffort(text) ?? detectCopilotStatusLineModel(text);
  if (modelEffort?.rawModel) hint.model = modelEffort.rawModel;
  if (modelEffort?.effort) hint.effort = modelEffort.effort;

  return hint;
}

export function detectCopilotInvalidSessionRef(text: string): boolean {
  return INVALID_SESSION_RE.test(text);
}

function formatCopilotInteractivePrompt(prompt: string, config?: ThreadConfig): string {
  if (config?.mode !== "plan") {
    return prompt;
  }

  const trimmed = prompt.trimStart();
  if (trimmed.startsWith("/")) {
    return prompt;
  }

  return `/plan ${prompt}`;
}

function syncCopilotConfigFromTerminalState(
  input: SyncConfigFromTerminalStateInput,
): ThreadConfig | undefined {
  let next: ThreadConfig | undefined;

  // ── Plan mode transitions ──────────────────────────────
  if (input.hint.planMode && input.config.mode !== "plan") {
    next = { ...(next ?? input.config), mode: "plan" };
  } else if (
    !input.hint.planMode &&
    input.config.mode === "plan" &&
    (input.hint.status === "idle" ||
      (input.hint.status === "working" &&
        (input.previousStatus === "needs_reply" || input.previousStatus === "needs_approval")))
  ) {
    next = { ...(next ?? input.config), mode: undefined };
  }

  // ── Approval policy ───────────────────────────────────
  if (input.hint.approvalPolicy !== undefined) {
    const currentPolicy = input.config.approvalPolicy ?? "default";
    if (input.hint.approvalPolicy !== currentPolicy) {
      next = { ...(next ?? input.config), approvalPolicy: input.hint.approvalPolicy };
    }
  }

  // ── Model ─────────────────────────────────────────────
  if (input.hint.model !== undefined && input.hint.model !== input.config.model) {
    next = { ...(next ?? input.config), model: input.hint.model };
  }

  // ── Effort ────────────────────────────────────────────
  if (input.hint.effort !== undefined && input.hint.effort !== input.config.effort) {
    next = { ...(next ?? input.config), effort: input.hint.effort };
  }

  return next;
}

export function createCopilotAdapter(): AgentAdapter {
  let capabilities = defaultCapabilities;
  const detectedWslExecPaths = new Map<string, string | undefined>();

  function buildCopilotCommand(location: ProjectLocation, args: string[], wslExecPath?: string) {
    return buildAgentCommand(location, "copilot", args, wslExecPath);
  }

  function resolveWslExecPath(location: ProjectLocation): string | undefined {
    if (location.kind !== "wsl") {
      return undefined;
    }

    const cached = detectedWslExecPaths.get(location.distro);
    if (cached) {
      return cached;
    }

    const resolved = resolveWslExecutablePath(location.distro, "copilot");
    detectedWslExecPaths.set(location.distro, resolved);
    return resolved;
  }

  async function probeCopilotModelEfforts(
    location: ProjectLocation,
    executablePath: string | undefined,
    models: { id: string }[],
  ): Promise<{ defaultEffort?: string; modelEfforts?: Record<string, string[]> }> {
    const spec = buildCopilotCommand(location, ["--acp", "--stdio"], executablePath);
    const sessionCwd = location.kind === "wsl" ? location.linuxPath : location.path;
    const child = spawn(spec.command, spec.args, {
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });
    child.on("error", (err) => {
      console.log("[copilot-probe] spawn error:", err.message);
    });

    const updates: unknown[] = [];
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );
    const connection = new ClientSideConnection(
      () => ({
        requestPermission: () => Promise.resolve({ outcome: { outcome: "cancelled" as const } }),
        sessionUpdate: (params) => {
          updates.push(params.update);
          return Promise.resolve();
        },
      }),
      stream,
    );

    try {
      await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "lightcode-probe", version: "0.1.0" },
        clientCapabilities: {},
      });
      const session = await connection.newSession({ cwd: sessionCwd, mcpServers: [] });

      const baseUpdate = session.configOptions
        ? { sessionUpdate: "config_option_update", configOptions: session.configOptions }
        : undefined;

      function extractThoughtLevelConfig(update: unknown):
        | {
            currentValue?: string;
            options: string[];
          }
        | undefined {
        if (!update || typeof update !== "object" || !("configOptions" in update)) {
          return undefined;
        }
        const configOptions = (update as { configOptions?: unknown }).configOptions;
        if (!Array.isArray(configOptions)) {
          return undefined;
        }
        const thoughtLevel = configOptions.find((candidate) => {
          if (typeof candidate !== "object" || candidate === null) {
            return false;
          }
          const option = candidate as {
            category?: string;
            currentValue?: string;
            options?: unknown;
          };
          return option.category === "thought_level";
        }) as
          | {
              currentValue?: string;
              options?: Array<{ value?: string }> | Array<{ options?: Array<{ value?: string }> }>;
            }
          | undefined;
        if (!thoughtLevel) {
          return undefined;
        }
        const flattened = (Array.isArray(thoughtLevel.options) ? thoughtLevel.options : []).flatMap(
          (entry) => {
            if (typeof entry !== "object" || entry === null) {
              return [];
            }
            if ("value" in entry) {
              return [entry as { value?: string }];
            }
            if ("options" in entry && Array.isArray((entry as { options?: unknown }).options)) {
              return (entry as { options: Array<{ value?: string }> }).options;
            }
            return [];
          },
        );
        const options = flattened
          .map((entry) => entry.value)
          .filter((value): value is string => typeof value === "string" && value.length > 0);
        return {
          options,
          ...(thoughtLevel.currentValue ? { currentValue: thoughtLevel.currentValue } : {}),
        };
      }

      const initialThoughtLevel = baseUpdate ? extractThoughtLevelConfig(baseUpdate) : undefined;
      const modelEfforts: Record<string, string[]> = {};
      const defaultEffort = initialThoughtLevel?.currentValue;

      if (session.models?.currentModelId && initialThoughtLevel?.options.length) {
        modelEfforts[session.models.currentModelId] = initialThoughtLevel.options;
      }

      for (const model of models) {
        try {
          updates.length = 0;
          await connection.unstable_setSessionModel({
            sessionId: session.sessionId,
            modelId: model.id,
          });
          await new Promise((resolve) => setTimeout(resolve, 300));
          const update = updates
            .filter(
              (entry) =>
                typeof entry === "object" &&
                entry !== null &&
                "sessionUpdate" in entry &&
                (entry as { sessionUpdate?: string }).sessionUpdate === "config_option_update",
            )
            .at(-1);
          const thoughtLevel = extractThoughtLevelConfig(update);
          if (!thoughtLevel || thoughtLevel.options.length === 0) {
            continue;
          }
          modelEfforts[model.id] = thoughtLevel.options;
        } catch (err) {
          console.log(
            `[copilot-probe] model effort probe failed at ${model.id}:`,
            err instanceof Error ? err.message : err,
          );
          break;
        }
      }

      return {
        ...(defaultEffort ? { defaultEffort } : {}),
        ...(Object.keys(modelEfforts).length > 0 ? { modelEfforts } : {}),
      };
    } catch {
      return {};
    } finally {
      try {
        child.kill();
      } catch {
        // Ignore cleanup races.
      }
    }
  }

  async function probeCapabilities(
    location: ProjectLocation,
    executablePath?: string,
  ): Promise<AgentCapability> {
    const spec = buildCopilotCommand(location, ["--acp", "--stdio"], executablePath);
    const sessionCwd = location.kind === "wsl" ? location.linuxPath : location.path;
    const probe = await probeAcpCapabilities(spec.command, spec.args, sessionCwd, {
      ...(spec.cwd ? { processCwd: spec.cwd } : {}),
      timeoutMs: 8_000,
      label:
        location.kind === "wsl" ? `copilot:wsl:${location.distro}` : `copilot:${location.kind}`,
    });

    const modelEffortProbe =
      probe?.models?.length && executablePath !== undefined
        ? await probeCopilotModelEfforts(location, executablePath, probe.models)
        : {};

    // Merge probe approval policies with defaults (probe labels take precedence,
    // new probe-only entries are appended). This is needed because Copilot's ACP
    // only exposes autopilot as a session mode — Default/Bypass are CLI-only flags.
    const mergedPolicies = new Map(defaultCapabilities.approvalPolicies.map((p) => [p.id, p]));
    for (const policy of probe?.approvalPolicies ?? []) {
      mergedPolicies.set(policy.id, policy);
    }

    return {
      ...defaultCapabilities,
      ...(probe?.models?.length ? { models: probe.models } : {}),
      ...(probe?.efforts?.length ? { efforts: probe.efforts } : {}),
      ...((modelEffortProbe.defaultEffort ?? probe?.defaultEffort)
        ? { defaultEffort: modelEffortProbe.defaultEffort ?? probe?.defaultEffort }
        : {}),
      ...(modelEffortProbe.modelEfforts ? { modelEfforts: modelEffortProbe.modelEfforts } : {}),
      ...(probe?.modes?.length ? { modes: probe.modes } : {}),
      approvalPolicies: [...mergedPolicies.values()],
    };
  }

  return {
    kind: "copilot",
    label: "GitHub Copilot",
    get capabilities() {
      return capabilities;
    },
    async detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus> {
      const isWsl = ctx?.envKind === "wsl" && ctx.wslDistro;

      if (isWsl) {
        const [whichResult, copilotTokenResult, ghTokenResult, githubTokenResult, ghAuthResult] =
          await batchWslCommandsAsync(ctx.wslDistro!, [
            "command -v copilot",
            'printf %s "$COPILOT_GITHUB_TOKEN"',
            'printf %s "$GH_TOKEN"',
            'printf %s "$GITHUB_TOKEN"',
            "command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && echo yes",
          ]);

        const executablePath = whichResult?.ok ? whichResult.stdout : undefined;
        detectedWslExecPaths.set(ctx.wslDistro!, executablePath);
        const versionResult = executablePath
          ? await readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["--version"])
          : undefined;

        if (executablePath) {
          capabilities = await probeCapabilities(
            {
              kind: "wsl",
              distro: ctx.wslDistro!,
              linuxPath: "/tmp",
              uncPath: "\\\\wsl$",
            },
            executablePath,
          );
        }

        const hasEnvToken = [copilotTokenResult, ghTokenResult, githubTokenResult].some(
          (result) => result?.ok && result.stdout.trim().length > 0,
        );
        const hasGhAuth = ghAuthResult?.ok && ghAuthResult.stdout.trim() === "yes";
        const authState =
          executablePath === undefined
            ? "missing"
            : hasEnvToken || hasGhAuth
              ? "authenticated"
              : "unknown";

        return {
          kind: "copilot",
          label: "GitHub Copilot",
          installed: executablePath !== undefined,
          ...(executablePath ? { executablePath } : {}),
          ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
          authState,
          capabilities,
        };
      }

      const executablePath = await resolveExecutablePathAsync("copilot");
      const versionResult = executablePath
        ? await readCommandOutputAsync("copilot", ["--version"])
        : undefined;

      if (executablePath) {
        const location: ProjectLocation =
          process.platform === "win32"
            ? { kind: "windows", path: process.cwd() }
            : { kind: "posix", path: process.cwd() };
        capabilities = await probeCapabilities(location, executablePath);
      }

      const authState =
        executablePath === undefined
          ? "missing"
          : detectEnvToken() || (await detectNativeGhAuth())
            ? "authenticated"
            : "unknown";

      return {
        kind: "copilot",
        label: "GitHub Copilot",
        installed: executablePath !== undefined,
        ...(executablePath ? { executablePath } : {}),
        ...(versionResult?.ok ? { version: versionResult.stdout } : {}),
        authState,
        capabilities,
      };
    },
    buildLaunchCommand(location, config, prompt, _sessionRef, launchOptions) {
      const sessionId = launchOptions?.resumeThreadId ?? randomUUID();
      const spec = buildCopilotCommand(
        location,
        buildCopilotArgs(config, prompt, sessionId, launchOptions),
        resolveWslExecPath(location),
      );
      spec.sessionRef = createKnownSessionRef(sessionId);
      return spec;
    },
    buildResumeCommand(location, config, prompt, sessionRef, launchOptions) {
      return buildCopilotCommand(
        location,
        buildCopilotArgs(
          config,
          prompt,
          launchOptions?.resumeThreadId ?? sessionRef.providerSessionId,
          launchOptions,
        ),
        resolveWslExecPath(location),
      );
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      if (input.sessionRef) {
        return undefined;
      }

      const args = ["--acp", "--stdio"];
      if (input.config.approvalPolicy === "never") {
        args.push("--yolo");
      }
      const command = buildCopilotCommand(
        input.projectLocation,
        args,
        resolveWslExecPath(input.projectLocation),
      );
      return createAcpStructuredSession(command, input);
    },
    createInitialSessionRef() {
      return undefined;
    },
    buildDirectInput(prompt, _segments, config) {
      return [formatCopilotInteractivePrompt(prompt, config), "@wait:40", "\r"];
    },
    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((segment) => segment.kind === "attachment");
      const rest = segments.filter((segment) => segment.kind !== "attachment");
      const attachmentLines = attachments.map((segment) => `@${segment.path}`).join(" ");
      const restStr = rest
        .map((segment) => (segment.kind === "file" ? `@${segment.path}` : segment.content))
        .join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    isReadyForInitialPrompt(text) {
      return READY_RE.test(text);
    },
    detectTerminalStatus(text) {
      const hint = detectCopilotTerminalStatus(text);
      if (hint?.model) {
        hint.model = resolveModelId(hint.model, capabilities.models);
      }
      return hint;
    },
    detectInvalidSessionRef(text) {
      return detectCopilotInvalidSessionRef(text);
    },
    syncConfigFromTerminalState(input: SyncConfigFromTerminalStateInput) {
      return syncCopilotConfigFromTerminalState(input);
    },
    defaultOneShotModel: "",
    buildOneShotCommand(model, effort, prompt) {
      if (!prompt) {
        return undefined;
      }

      const args = ["-p", prompt, "-s", "--allow-all-tools"];
      if (model) {
        args.push("--model", model);
      }
      if (effort) {
        args.push("--effort", effort);
      }

      return { command: "copilot", args, stdin: "" };
    },
  };
}
