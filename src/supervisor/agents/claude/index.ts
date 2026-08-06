import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path, { posix as posixPath } from "node:path";

import type {
  AgentCapability,
  AgentInstanceConfig,
  ClaudeProfileModel,
  ResolvedMcpServer,
  ProjectLocation,
  PromptSegment,
} from "@/shared/contracts";
import { claudeProfileKind, parseClaudeProfileInstanceConfig } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import {
  brailleSpinnerOscTitleHint,
  buildAgentCommand,
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  iterm2ProgressOscHint,
  resolveWslHomeDirectory,
  shortenHomePath,
  type AgentAdapter,
  type CreateStructuredSessionInput,
  type DetectProbeCtx,
} from "../base";
import { buildClaudeArgs, claudeExtraArgsPosition, rewriteClaudeLaunchArgsForConfig } from "./argv";
import { claudeCapabilities, claudeDetectionSpec, probeClaudeStatus } from "./detection";
import { probeClaudeCapabilities } from "./probe";
import { ClaudeSdkSession } from "./sdkSession";
import { buildClaudeMcpServers } from "../userMcp";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import {
  getClaudePluginPaths,
  installClaudePlugin,
  isClaudePluginInstalled,
  readBundledClaudePluginVersion,
  uninstallClaudePlugin,
} from "./plugin/install";

// Semver comes only from plugin/plugin.json (forward.mjs reads that file too).
// Bump `MIN_PROTOCOL_VERSION` in src/shared/contracts/agentEvent.ts when the
// envelope shape changes.
const CLAUDE_PLUGIN_VERSION = readBundledClaudePluginVersion();

warnIfPluginManifestMissing("claude", CLAUDE_PLUGIN_VERSION);

interface ClaudeAdapterOptions {
  kind?: string;
  label?: string;
  configDir?: string;
  /**
   * Extra environment variables merged into every spawn (PTY/SDK/probe), e.g.
   * `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` to point a profile at an
   * external provider. `CLAUDE_CONFIG_DIR` still wins (the profile's identity).
   */
  customEnv?: Record<string, string>;
  /** Profile-specific picker model list (overrides the built-in Claude list). */
  models?: ClaudeProfileModel[];
  /** Profile-specific effort allow-list (hides built-in tiers outside it). */
  efforts?: string[];
  /** Profile-specific default effort. */
  defaultEffort?: string;
  /** Per-model effort choices for external-provider model ids. */
  modelEfforts?: Record<string, string[]>;
}

function resolveTildePath(rawPath: string, location: ProjectLocation): string {
  const trimmed = rawPath.trim();
  if (trimmed !== "~" && !trimmed.startsWith("~/")) {
    return trimmed;
  }
  const suffix = trimmed === "~" ? "" : trimmed.slice(2);
  if (location.kind === "wsl") {
    const home = resolveWslHomeDirectory(location.distro);
    return home ? posixPath.join(home, suffix) : trimmed;
  }
  return path.join(homedir(), suffix);
}

function profileEnvForLocation(
  configDir: string | undefined,
  customEnv: Record<string, string> | undefined,
  location: ProjectLocation,
): Record<string, string> | undefined {
  // customEnv already has its empty keys filtered out (resolveInstanceEnv).
  // CLAUDE_CONFIG_DIR is set last so the profile's identity always wins over a
  // user-supplied override of the same key.
  const env: Record<string, string> = { ...customEnv };
  if (configDir?.trim()) {
    env.CLAUDE_CONFIG_DIR = resolveTildePath(configDir, location);
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

/**
 * Flatten an instance's `environment` map (values already decrypted by the
 * supervisor's settings read) into a plain name→value map for spawning.
 */
function resolveInstanceEnv(
  environment: AgentInstanceConfig["environment"],
): Record<string, string> | undefined {
  if (!environment) return undefined;
  const resolved: Record<string, string> = {};
  for (const [name, variable] of Object.entries(environment)) {
    if (name.trim().length === 0) continue;
    resolved[name] = variable.value;
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

/**
 * Apply a profile's optional model additions / effort allow-list on top of the
 * built-in Claude capabilities. A no-op when neither override is set (so the
 * default adapter is unaffected). Custom models are *appended* to the built-in
 * list (the user can still pick the Claude models). Profiles may also provide
 * per-model effort choices for their external model ids.
 */
function overrideProfileCapabilities(
  base: AgentCapability,
  models: ClaudeProfileModel[] | undefined,
  efforts: readonly string[] | undefined,
  defaultEffort: string | undefined,
  modelEfforts: Readonly<Record<string, readonly string[]>> | undefined,
): AgentCapability {
  const keep = (list: readonly string[], allowed: ReadonlySet<string>) =>
    list.filter((effort) => allowed.has(effort));
  let caps = base;

  if (efforts && efforts.length > 0) {
    const allowed = new Set(efforts);
    const nextEfforts = keep(caps.efforts, allowed);
    // If a hand-edited config lists only unknown tier names, the allow-list is
    // empty — keep the full built-in list rather than leaving the picker with no
    // efforts to choose from. (The UI only ever writes valid tiers.)
    if (nextEfforts.length > 0) {
      caps = {
        ...caps,
        efforts: nextEfforts,
        defaultEffort:
          caps.defaultEffort && allowed.has(caps.defaultEffort)
            ? caps.defaultEffort
            : nextEfforts[0],
        modelEfforts: Object.fromEntries(
          Object.entries(caps.modelEfforts).map(([id, list]) => [id, keep(list, allowed)]),
        ),
      };
    }
  }

  if (models && models.length > 0) {
    const existingIds = new Set(caps.models.map((model) => model.id));
    const additions: AgentCapability["models"] = [];
    for (const model of models) {
      const id = model.id.trim();
      if (!id || existingIds.has(id)) continue;
      existingIds.add(id);
      additions.push({ id, label: model.label?.trim() || id });
    }
    if (additions.length > 0) {
      caps = { ...caps, models: [...caps.models, ...additions] };
    }
  }

  if (defaultEffort && caps.efforts.includes(defaultEffort)) {
    caps = { ...caps, defaultEffort };
  }

  if (modelEfforts) {
    const allowed = new Set(caps.efforts);
    caps = {
      ...caps,
      modelEfforts: {
        ...caps.modelEfforts,
        ...Object.fromEntries(
          Object.entries(modelEfforts).map(([modelId, list]) => [modelId, keep(list, allowed)]),
        ),
      },
    };
  }

  return caps;
}

export function createClaudeProfileAdapter(instance: AgentInstanceConfig): AgentAdapter {
  const cfg = parseClaudeProfileInstanceConfig(instance.config);
  const profileLabel = instance.displayName ?? instance.id;
  const customEnv = resolveInstanceEnv(instance.environment);
  return createClaudeAdapter({
    kind: claudeProfileKind(instance.id),
    label: `Claude ${profileLabel}`,
    configDir: cfg.configDir,
    ...(customEnv ? { customEnv } : {}),
    ...(cfg.models && cfg.models.length > 0 ? { models: cfg.models } : {}),
    ...(cfg.efforts && cfg.efforts.length > 0 ? { efforts: cfg.efforts } : {}),
    ...(cfg.defaultEffort ? { defaultEffort: cfg.defaultEffort } : {}),
    ...(cfg.modelEfforts ? { modelEfforts: cfg.modelEfforts } : {}),
  });
}

export function createClaudeAdapter(options: ClaudeAdapterOptions = {}): AgentAdapter {
  const kind = options.kind ?? claudeDetectionSpec.kind;
  const label = options.label ?? claudeDetectionSpec.label;
  const profileEnv = (location: ProjectLocation) =>
    profileEnvForLocation(options.configDir, options.customEnv, location);
  const capabilities = overrideProfileCapabilities(
    claudeCapabilities,
    options.models,
    options.efforts,
    options.defaultEffort,
    options.modelEfforts,
  );

  function buildClaudeOneShotCommand(
    model: string,
    effort: string | undefined,
    prompt: string | undefined,
    location: ProjectLocation | undefined,
    fast: boolean | undefined,
    extraArgs: readonly string[] = [],
  ) {
    if (!prompt) return undefined;
    // --no-session-persistence keeps title/commit/PR-summary calls out of
    // the `/resume` picker. --fallback-model auto-degrades to Haiku if the
    // primary is overloaded so async title generation does not silently
    // fail when the API throttles.
    const args = [
      "-p",
      prompt,
      "--model",
      model,
      "--fallback-model",
      "haiku",
      "--no-session-persistence",
      ...extraArgs,
    ];
    if (effort) args.push("--effort", effort);
    if (fast) {
      // Fast mode is a session flag, not a model/effort value. On the CLI it
      // rides on --settings JSON (the SDK path uses applyFlagSettings). One-shot
      // calls pass no other --settings, so a single inline flag is safe here.
      args.push("--settings", JSON.stringify({ fastMode: true }));
    }
    const env = location ? profileEnv(location) : undefined;
    return {
      command: "claude",
      args,
      stdin: "",
      ...(env ? { env } : {}),
    };
  }

  return {
    kind,
    label,
    binary: claudeDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "claude",
          label,
          globalPath: ".claude/skills",
          projectPath: ".claude/skills",
          ...(options.configDir ? { globalBasePath: options.configDir } : {}),
          globalOverride: { env: "CLAUDE_CONFIG_DIR", path: "skills" },
        },
      ],
      projectionRoots: [
        {
          id: "claude",
          label,
          globalPath: ".claude/skills",
          projectPath: ".claude/skills",
          ...(options.configDir ? { globalBasePath: options.configDir } : {}),
          globalOverride: { env: "CLAUDE_CONFIG_DIR", path: "skills" },
          linkProjectionFromVersion: "2.1.203",
        },
      ],
      invocation: "slash",
      precedence: {
        scopeOrder: ["global", "project"],
        global: ["claude", "agents"],
        project: ["claude", "agents"],
      },
    },
    capabilities,
    ...(claudeDetectionSpec.update ? { update: claudeDetectionSpec.update } : {}),
    // WSL OAuth flows try to open a browser; no-op it so the PTY doesn't hang.
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    // ── CLI hook plugin support ──────────────────────────────────────────
    pluginId: "poracode-status@claude",
    pluginVersion: CLAUDE_PLUGIN_VERSION,
    minProtocolVersion: 1,
    async isPluginSupported(ctx) {
      // Native: forward.mjs runs under Electron-as-Node via a generated
      // wrapper script — always supported.
      // WSL: hooks always supported; the runtime resolver probes the distro
      // for an existing node and falls back to installing the pinned LTS if
      // none is available. The actual install happens in `installPlugin`.
      void ctx;
      return true;
    },
    async isPluginInstalled(ctx) {
      return isClaudePluginInstalled(ctx);
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const result = installClaudePlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      uninstallClaudePlugin(ctx);
    },
    async pluginLaunchExtras(ctx) {
      const paths = getClaudePluginPaths(ctx);
      return { args: ["--settings", paths.settingsPath] };
    },
    async detectInstall(ctx) {
      const spec =
        options.configDir === undefined
          ? claudeDetectionSpec
          : {
              ...claudeDetectionSpec,
              kind,
              label,
              capabilities,
              statusProbe: (probeCtx: DetectProbeCtx) => {
                const env = profileEnv(probeCtx.location);
                return probeClaudeStatus(probeCtx, env ? { env } : undefined);
              },
              capabilitiesProbe: (probeCtx: DetectProbeCtx) => {
                const env = profileEnv(probeCtx.location);
                return probeClaudeCapabilities(probeCtx, env ? { env } : undefined);
              },
            };
      const status = await detectAgentInstall(ctx, spec);
      return {
        ...status,
        kind,
        label,
        // Re-assert the profile overrides on top of whatever the probe returned,
        // so the model list / effort allow-list always wins.
        capabilities: overrideProfileCapabilities(
          status.capabilities,
          options.models,
          options.efforts,
          options.defaultEffort,
          options.modelEfforts,
        ),
      };
    },
    buildLaunchArgv(location, config, prompt, _sessionRef, launchOptions) {
      const assignedId = randomUUID();
      const args = buildClaudeArgs(config, prompt, undefined, assignedId);
      appendClaudeMcpArgs(args, prompt, launchOptions?.mcpServers ?? []);
      const env = profileEnv(location);
      return {
        binary: "claude",
        args,
        ...(env ? { env } : {}),
        sessionRef: createKnownSessionRef(assignedId),
      };
    },
    buildResumeArgv(location, config, prompt, sessionRef, launchOptions) {
      const args = buildClaudeArgs(config, prompt, sessionRef.providerSessionId);
      appendClaudeMcpArgs(args, prompt, launchOptions?.mcpServers ?? []);
      const env = profileEnv(location);
      return { binary: "claude", args, ...(env ? { env } : {}) };
    },
    extraArgsPosition: claudeExtraArgsPosition,
    rewriteLaunchArgsForConfig: rewriteClaudeLaunchArgsForConfig,
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      if (input.presentationMode !== "gui") return undefined;
      const env = profileEnv(input.projectLocation);
      return ClaudeSdkSession.create({ ...input, ...(env ? { env } : {}) });
    },
    async buildAcpLogoutCommand(ctx) {
      const location = detectProbeLocation(ctx);
      return buildAgentCommand(
        location,
        "claude",
        ["auth", "logout"],
        undefined,
        profileEnv(location),
      );
    },
    buildDirectInput(prompt, segments) {
      const attachmentCount = segments?.filter((s) => s.kind === "attachment").length ?? 0;
      const wait = attachmentCount > 0 ? 800 + (attachmentCount - 1) * 150 : 60;
      return [prompt, `@wait:${wait}`, "\r"];
    },
    formatPromptSegments(segments: PromptSegment[]) {
      // Claude CLI natively handles @path for files and images — pass as @path inline.
      // Attachments are appended so the text prompt leads (better for title generation).
      // Shorten absolute home-dir paths to ~/... for a cleaner prompt line.
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${shortenHomePath(s.path)}`).join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    handleOscNotification: iterm2ProgressOscHint,
    handleOscTitle: brailleSpinnerOscTitleHint,
    spoofsIterm2StatusEnv: true,
    oscHintsDeferToHookPlugin: true,
    workingSilenceTimeoutMs: null,
    defaultOneShotModel: "haiku",
    buildOneShotCommand(model, effort, prompt, location, fast, oneShotOptions) {
      return buildClaudeOneShotCommand(
        model,
        effort,
        prompt,
        location,
        fast,
        oneShotOptions?.readOnlyWorkspace
          ? [
              "--permission-mode",
              "plan",
              "--allowedTools",
              "Read,Glob,Grep",
              "--disallowedTools",
              "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task,Skill",
              "--mcp-config",
              JSON.stringify({ mcpServers: {} }),
              "--strict-mcp-config",
            ]
          : [],
      );
    },
    buildTextOnlyOneShotCommand(model, effort, prompt, location, fast) {
      return buildClaudeOneShotCommand(model, effort, prompt, location, fast, [
        "--safe-mode",
        "--tools",
        "",
        "--mcp-config",
        JSON.stringify({ mcpServers: {} }),
        "--strict-mcp-config",
      ]);
    },
    buildContextExtractionCommand(sessionRef, location, model) {
      // The resumed session is read-only here; --no-session-persistence
      // prevents the extraction turn from being written back to disk.
      const args = [
        "-p",
        "--resume",
        sessionRef.providerSessionId,
        "--model",
        model ?? "haiku",
        "--no-session-persistence",
      ];
      const env = profileEnv(location);
      return {
        command: "claude",
        args,
        ...(env ? { env } : {}),
      };
    },
  };
}

function appendClaudeMcpArgs(
  args: string[],
  prompt: string,
  servers: readonly ResolvedMcpServer[],
): void {
  const mcpServers = buildClaudeMcpServers(servers);
  if (Object.keys(mcpServers).length === 0) return;
  args.splice(
    claudeExtraArgsPosition(args, prompt),
    0,
    "--mcp-config",
    JSON.stringify({ mcpServers }),
    "--",
  );
}
