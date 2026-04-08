import type {
  AgentCapability,
  AgentStatus,
  AuthState,
  LabeledOption,
  ProjectLocation,
  PromptSegment,
  ThreadConfig,
} from "../../shared/contracts";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
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
import { stripAnsi } from "../../shared/ansi";

const CURSOR_ATTENTION_RE =
  /Run this command\?|Suggested Plan|Waiting for approval/i;
const CURSOR_WORKING_RE =
  /ctrl\+c to stop|\b(?:Generating|Reading|Globbing|Thinking)\b/i;
const CURSOR_IDLE_RE = /Add a follow-up/i;

export function detectCursorTerminalStatus(text: string): TerminalStatusHint | null {
  const recent = text.slice(-1200);

  const entries: Array<{
    re: RegExp;
    status: TerminalStatusHint["status"];
    attention: TerminalStatusHint["attention"];
  }> = [
    { re: CURSOR_ATTENTION_RE, status: "needs_approval", attention: "needs_approval" },
    { re: CURSOR_WORKING_RE, status: "working", attention: "working" },
    { re: CURSOR_IDLE_RE, status: "idle", attention: "none" },
  ];

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
    while ((match = globalRe.exec(recent)) !== null) {
      last = match;
    }
    if (last && (!best || last.index > best.index)) {
      best = { index: last.index, status: entry.status, attention: entry.attention };
    }
  }

  if (!best) return null;
  return { status: best.status, attention: best.attention, corroborated: true };
}

function buildCursorArgs(
  config: ThreadConfig,
  prompt: string,
  resumeSessionId?: string,
): string[] {
  const args: string[] = [];

  if (resumeSessionId) {
    args.push(`--resume=${resumeSessionId}`);
  }
  args.push("--model", config.model || "auto");
  if (config.mode === "plan") {
    args.push("--mode", "plan");
  }
  if (config.approvalPolicy === "never") {
    args.push("--yolo");
  }
  if (prompt.trim().length > 0) {
    args.push(prompt);
  }

  return args;
}

const MODEL_LINE_RE = /^([^\s-]+(?:-[^\s-]+)*)\s+-\s+(.+)$/;

export function parseCursorModels(output: string): LabeledOption[] {
  const models: LabeledOption[] = [];
  const seen = new Set<string>();

  for (const rawLine of stripAnsi(output).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(Available|Tip:|Loading)/i.test(line)) continue;

    const match = MODEL_LINE_RE.exec(line);
    if (!match) continue;

    const id = match[1]!;
    const label = match[2]!.replace(/\s*\([^)]*\)\s*/g, "").trim();
    if (!id || !label) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    models.push({ id, label });
  }

  if (!seen.has("auto")) {
    models.unshift({ id: "auto", label: "Auto" });
  } else {
    const idx = models.findIndex((m) => m.id === "auto");
    if (idx > 0) {
      const [auto] = models.splice(idx, 1);
      models.unshift(auto!);
    }
  }

  return models.length > 0 ? sortCursorModels(models) : [{ id: "auto", label: "Auto" }];
}

/**
 * Sort models: Auto first, then Composer, then all others grouped by family.
 * Groups sorted by version descending. Within each group:
 * Thinking > non-Thinking, 1M > non-1M, effort descending
 * (Extra High > High > Medium > Low > None > base), Fast before non-Fast
 * within the same tier.
 */
export function sortCursorModels(models: LabeledOption[]): LabeledOption[] {
  const auto = models.filter((m) => m.id === "auto");
  const rest = models.filter((m) => m.id !== "auto");

  const versionOf = (label: string): number => {
    const m = /(\d+(?:\.\d+)?)/.exec(label);
    return m ? Number(m[1]) : 0;
  };

  const groupOf = (label: string): string =>
    label
      .replace(/\b(1M|Max|Fast|Thinking|None|Low|Medium|High|Extra\s+High)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const isComposer = (label: string): boolean => /^Composer\b/i.test(label);
  const isFast = (label: string): boolean => /\bFast\b/i.test(label);
  const is1M = (label: string): boolean => /\b1M\b/i.test(label);
  const isMax = (label: string): boolean => /\bMax\b/i.test(label);
  const isThinking = (label: string): boolean => /\bThinking\b/i.test(label);

  const effortRank = (label: string): number => {
    if (/\bExtra\s+High\b/i.test(label)) return 5;
    if (/\bHigh\b/i.test(label)) return 4;
    if (/\bMedium\b/i.test(label)) return 3;
    if (/\bLow\b/i.test(label)) return 2;
    if (/\bNone\b/i.test(label)) return 1;
    return 3; // no qualifier = medium
  };

  const compareWithinGroup = (a: LabeledOption, b: LabeledOption): number => {
    const x = (isMax(b.label) ? 1 : 0) - (isMax(a.label) ? 1 : 0);
    if (x !== 0) return x;
    const t = (isThinking(b.label) ? 1 : 0) - (isThinking(a.label) ? 1 : 0);
    if (t !== 0) return t;
    const c = (is1M(b.label) ? 1 : 0) - (is1M(a.label) ? 1 : 0);
    if (c !== 0) return c;
    const e = effortRank(b.label) - effortRank(a.label);
    if (e !== 0) return e;
    return (isFast(b.label) ? 1 : 0) - (isFast(a.label) ? 1 : 0);
  };

  // Separate Composer from others
  const composers = rest.filter((m) => isComposer(m.label));
  const others = rest.filter((m) => !isComposer(m.label));

  composers.sort((a, b) => {
    const v = versionOf(b.label) - versionOf(a.label);
    return v !== 0 ? v : compareWithinGroup(a, b);
  });

  // Provider name: leading alpha chars ("GPT-5.4 Mini" → "GPT", "Opus 4.6" → "Opus")
  const providerOf = (key: string): string => key.match(/^[A-Za-z]+/)?.[0] ?? key;

  // Group by model family preserving insertion order
  const groups = new Map<string, LabeledOption[]>();
  for (const m of others) {
    const key = groupOf(m.label);
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(m);
  }

  // Collect sub-groups by provider, preserving insertion order
  const providerGroups = new Map<string, Array<[string, LabeledOption[]]>>();
  const providerMaxVer = new Map<string, number>();
  for (const entry of groups) {
    const p = providerOf(entry[0]);
    const v = versionOf(entry[0]);
    if (v > (providerMaxVer.get(p) ?? 0)) providerMaxVer.set(p, v);
    let arr = providerGroups.get(p);
    if (!arr) {
      arr = [];
      providerGroups.set(p, arr);
    }
    arr.push(entry);
  }

  // Sort providers by max version desc, then sub-groups by version desc within each
  const sortedProviders = [...providerGroups.entries()].sort(
    (a, b) => (providerMaxVer.get(b[0]) ?? 0) - (providerMaxVer.get(a[0]) ?? 0),
  );

  // If a group contains models with explicit effort qualifiers, label bare models as "Medium"
  const hasExplicitEffort = (label: string): boolean =>
    /\b(Extra\s+High|High|Medium|Low|None)\b/i.test(label);
  const needsMediumLabel = (label: string): boolean =>
    !hasExplicitEffort(label) && !isThinking(label);
  const addMediumLabel = (label: string): string =>
    isFast(label) ? label.replace(/\bFast\b/i, "Medium Fast") : `${label} Medium`;

  const sorted: LabeledOption[] = [];
  for (const [, subGroups] of sortedProviders) {
    subGroups.sort((a, b) => versionOf(b[0]) - versionOf(a[0]));
    for (const [, items] of subGroups) {
      if (items.some((m) => hasExplicitEffort(m.label))) {
        for (const m of items) {
          if (needsMediumLabel(m.label)) m.label = addMediumLabel(m.label);
        }
      }
      items.sort(compareWithinGroup);
      sorted.push(...items);
    }
  }

  return [...auto, ...composers, ...sorted];
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
  let capabilities: AgentCapability = {
    models: [],
    efforts: [],
    modelEfforts: {},
    modes: ["agent", "plan"],
    approvalPolicies: [
      { id: "default", label: "Default Approvals" },
      { id: "never", label: "YOLO" },
    ],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    bypassApprovalPolicy: "never",
    settingDefs: [],
  };

  const execFileAsync = promisify(execFile);

  async function runCursorCommand(
    args: string[],
    location: ProjectLocation,
    wslExecPath?: string,
  ): Promise<{ ok: boolean; stdout: string }> {
    const spec = buildAgentCommand(location, "cursor-agent", args, wslExecPath);
    try {
      const { stdout } = await execFileAsync(spec.command, spec.args, {
        ...(spec.cwd ? { cwd: spec.cwd } : {}),
        windowsHide: true,
        timeout: 15_000,
      });
      return { ok: true, stdout: (stdout ?? "").trim() };
    } catch {
      return { ok: false, stdout: "" };
    }
  }

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

  function createChatSync(location: ProjectLocation): string | undefined {
    const spec = buildAgentCommand(
      location,
      "cursor-agent",
      ["create-chat"],
      resolveWslExecPath(location),
    );
    try {
      const result = spawnSync(spec.command, spec.args, {
        encoding: "utf8",
        ...(spec.cwd ? { cwd: spec.cwd } : {}),
        windowsHide: true,
        timeout: 15_000,
      });
      const chatId = (result.stdout ?? "").trim();
      if (result.status === 0 && chatId.length > 0) {
        return chatId;
      }
    } catch {
      // Fall through — launch without a pre-assigned session
    }
    return undefined;
  }

  return {
    kind: "cursor",
    label: "Cursor CLI",
    get capabilities() {
      return capabilities;
    },
    async detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus> {
      const isWsl = ctx?.envKind === "wsl" && ctx.wslDistro;

      if (isWsl) {
        const [whichResult] = await batchWslCommandsAsync(ctx.wslDistro!, [
          "command -v cursor-agent",
        ]);
        const executablePath = whichResult?.ok ? whichResult.stdout : undefined;
        detectedWslExecPaths.set(ctx.wslDistro!, executablePath);
        const [versionResult, statusResult, modelsResult] = await Promise.all([
          executablePath
            ? readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["--version"])
            : undefined,
          executablePath
            ? readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["status"])
            : undefined,
          executablePath
            ? readWslCommandOutputAsync(ctx.wslDistro!, executablePath, ["--list-models"])
            : undefined,
        ]);

        if (modelsResult?.ok) {
          const models = parseCursorModels(modelsResult.stdout);
          if (models.length > 0) {
            capabilities = { ...capabilities, models };
          }
        }

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
      const [versionResult, statusResult, modelsResult] = await Promise.all([
        executablePath ? readCommandOutputAsync("cursor-agent", ["--version"]) : undefined,
        executablePath ? readCommandOutputAsync("cursor-agent", ["status"]) : undefined,
        executablePath ? readCommandOutputAsync("cursor-agent", ["--list-models"]) : undefined,
      ]);

      if (modelsResult?.ok) {
        const models = parseCursorModels(modelsResult.stdout);
        if (models.length > 0) {
          capabilities = { ...capabilities, models };
        }
      }

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
      const chatId = createChatSync(location);
      const args = buildCursorArgs(config, prompt, chatId);
      const spec = buildAgentCommand(location, "cursor-agent", args, resolveWslExecPath(location));
      if (chatId) {
        spec.sessionRef = createKnownSessionRef(chatId);
      }
      return spec;
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
    isReadyForInitialPrompt(text) {
      return CURSOR_IDLE_RE.test(text) && !CURSOR_WORKING_RE.test(text);
    },
    detectTerminalStatus(text) {
      return detectCursorTerminalStatus(text);
    },
    defaultOneShotModel: "composer-2-fast",
    buildOneShotCommand(model) {
      const args = ["--print", "--force", "--trust", "--output-format", "json"];
      if (model && model !== "auto") {
        args.push("--model", model);
      }
      return { command: "cursor-agent", args };
    },
  };
}
