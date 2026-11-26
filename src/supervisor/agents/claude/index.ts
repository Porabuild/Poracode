import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

import type {
  AgentCapability,
  AgentInstanceConfig,
  ClaudeProfileModel,
  ProjectLocation,
  PromptSegment,
  ThreadConfig,
} from "@/shared/contracts";
import { claudeProfileKind, parseClaudeProfileInstanceConfig } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { CLAUDE_ULTRACODE_ID } from "@/shared/agents/claudeEfforts";
import {
  claudeLocalProfileEnv,
  claudeManagedLocalProfileDir,
  clampClaudeLocalCapabilities,
  type ClaudeLocalProfileRoute,
} from "@/shared/agents/claude/localProfile";
import { poracodeManagedProfileNamespace } from "@/shared/poracodePaths";
import { contextWindowIdFromTokens } from "@/shared/contextWindowOptions";
import {
  assertOneShotControlsMapped,
  brailleSpinnerOscTitleHint,
  buildAgentCommand,
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  iterm2ProgressOscHint,
  prepareAgentLocationEnvironment,
  resolveCheckedOneShotBuilderSelection,
  resolveCheckedOneShotResumeSelection,
  resolveTildePath,
  shortenHomePath,
  type AgentAdapter,
  type CreateStructuredSessionInput,
  type DetectProbeCtx,
} from "../base";
import {
  buildClaudeArgs,
  claudeEffortAndUltracode,
  claudeExtraArgsPosition,
  rewriteClaudeLaunchArgsForConfig,
} from "./argv";
import {
  claudeContextSizeCapabilities,
  claudeContextWindowEnv,
  CLAUDE_LONG_CONTEXT_SIZES,
  isClaudeExternalLongContextModel,
} from "./contextWindow";
import { claudeCapabilities, claudeDetectionSpec, probeClaudeStatus } from "./detection";
import { probeClaudeCapabilities } from "./probe";
import { claudeSkillInvocationFor, claudeSkillText, leadingSkill } from "./skillPrompt";
import { ClaudeSdkSession } from "./sdkSession";
import { createClaudeSessionImport } from "./sessionImport";
import { resolveNativeTildePath } from "../base/sessionFs";
import { claudeMcpLaunch } from "./mcp";
import { claudeNativeChromeArgs } from "./nativeChrome";
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
  /**
   * Typed local route. Its env is rebuilt on every lane and merged after any
   * stored environment, so a user profile cannot override the endpoint or
   * inherit ambient cloud credentials/headers.
   */
  local?: ClaudeLocalProfileRoute;
}

async function profileEnvForLocation(
  configDir: string | undefined,
  customEnv: Record<string, string> | undefined,
  location: ProjectLocation,
  local?: ClaudeLocalProfileRoute,
): Promise<Record<string, string> | undefined> {
  // Stored env is user-owned for ordinary profiles. A typed local route is
  // applied after it and before the config directory, so endpoint, credential
  // shadows, and model aliases always win while CLAUDE_CONFIG_DIR keeps the
  // profile's identity.
  const env: Record<string, string> = {
    ...customEnv,
    ...(local ? claudeLocalProfileEnv(local) : {}),
  };
  if (configDir?.trim()) {
    env.CLAUDE_CONFIG_DIR = await resolveTildePath(configDir, location);
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
 *
 * Profile effort lists keep `ultracode` as a permission rather than a tier: an
 * allow-list without it hides the ultracode toggle, and a per-model list with
 * it offers the toggle for that external model.
 *
 * A picker-only external model never reaches SDK discovery, so an id that
 * declares a 1M maximum (`[1m]`) is given the working windows discovery would
 * derive for it: the provider's configured windows, resolved from
 * `agentSettings`.
 */
export function overrideProfileCapabilities(
  base: AgentCapability,
  models: ClaudeProfileModel[] | undefined,
  efforts: readonly string[] | undefined,
  defaultEffort: string | undefined,
  modelEfforts: Readonly<Record<string, readonly string[]>> | undefined,
  agentSettings?: Record<string, boolean | string>,
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
    const merged = new Map(caps.models.map((model) => [model.id, model]));
    const configuredIds = new Set<string>();
    // Discovery already answered for a model it lists; keep that answer.
    const seededContextSizes: Record<string, string[]> = {};
    for (const model of models) {
      const id = model.id.trim();
      if (!id || configuredIds.has(id)) continue;
      configuredIds.add(id);
      // Explicit profile labels take precedence over SDK alias display names.
      merged.set(id, { id, label: model.label?.trim() || id });
      if (isClaudeExternalLongContextModel(id) && !caps.modelContextSizes?.[id]) {
        seededContextSizes[id] = CLAUDE_LONG_CONTEXT_SIZES;
      }
    }
    caps = { ...caps, models: [...merged.values()] };
    if (Object.keys(seededContextSizes).length > 0) {
      caps = {
        ...caps,
        ...claudeContextSizeCapabilities(
          {
            ...caps,
            modelContextSizes: { ...caps.modelContextSizes, ...seededContextSizes },
          },
          agentSettings,
        ),
      };
    }
  }

  if (defaultEffort && caps.efforts.includes(defaultEffort)) {
    caps = { ...caps, defaultEffort };
  }

  if (modelEfforts) {
    const allowed = new Set(caps.efforts);
    const workflowModels = new Set(caps.workflowModels);
    for (const [modelId, list] of Object.entries(modelEfforts)) {
      if (list.includes(CLAUDE_ULTRACODE_ID)) workflowModels.add(modelId);
      else workflowModels.delete(modelId);
    }
    caps = {
      ...caps,
      modelEfforts: {
        ...caps.modelEfforts,
        ...Object.fromEntries(
          Object.entries(modelEfforts).map(([modelId, list]) => [modelId, keep(list, allowed)]),
        ),
      },
      workflowModels: [...workflowModels],
    };
  }

  if (efforts && efforts.length > 0 && !efforts.includes(CLAUDE_ULTRACODE_ID)) {
    caps = { ...caps, workflowModels: [] };
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
    configDir: cfg.local
      ? claudeManagedLocalProfileDir(instance.id, poracodeManagedProfileNamespace())
      : cfg.configDir,
    ...(customEnv ? { customEnv } : {}),
    ...(cfg.models && cfg.models.length > 0 ? { models: cfg.models } : {}),
    ...(cfg.efforts && cfg.efforts.length > 0 ? { efforts: cfg.efforts } : {}),
    ...(cfg.defaultEffort ? { defaultEffort: cfg.defaultEffort } : {}),
    ...(cfg.modelEfforts ? { modelEfforts: cfg.modelEfforts } : {}),
    ...(cfg.local ? { local: cfg.local } : {}),
  });
}

export function createClaudeAdapter(options: ClaudeAdapterOptions = {}): AgentAdapter {
  const kind = options.kind ?? claudeDetectionSpec.kind;
  const label = options.label ?? claudeDetectionSpec.label;
  const profileEnv = (location: ProjectLocation) =>
    profileEnvForLocation(options.configDir, options.customEnv, location, options.local);
  const pinConfigForLocalRoute = (config: ThreadConfig): ThreadConfig => {
    if (!options.local) return config;
    const { effort: _effort, fast: _fast, ...rest } = config;
    return {
      ...rest,
      model: options.local.model,
      ...(options.local.contextLength !== undefined
        ? { contextSize: contextWindowIdFromTokens(options.local.contextLength) }
        : {}),
    };
  };
  const capabilities = (() => {
    const overridden = overrideProfileCapabilities(
      claudeCapabilities,
      options.models,
      options.efforts,
      options.defaultEffort,
      options.modelEfforts,
    );
    return options.local
      ? clampClaudeLocalCapabilities(overridden, options.local.model)
      : overridden;
  })();

  /**
   * The one-shot lane's native effort/Fast argv mapping — `--effort` and the
   * `fastMode` settings JSON — shared verbatim with the resume extraction lane
   * so both claude print runs consume the same controls the same way.
   */
  function claudeControlArgs(effort: string | undefined, fast: boolean | undefined): string[] {
    const args: string[] = [];
    // A legacy ultracode selection runs at its effort only: one-shots never
    // start dynamic workflows.
    const nativeEffort = claudeEffortAndUltracode({ effort }).effort;
    if (nativeEffort) args.push("--effort", nativeEffort);
    if (fast) {
      // Fast mode is a session flag, not a model/effort value. On the CLI it
      // rides on --settings JSON (the SDK path uses applyFlagSettings). One-shot
      // calls pass no other --settings, so a single inline flag is safe here.
      args.push("--settings", JSON.stringify({ fastMode: true }));
    }
    return args;
  }

  async function buildClaudeOneShotCommand(
    model: string,
    effort: string | undefined,
    prompt: string | undefined,
    location: ProjectLocation | undefined,
    fast: boolean | undefined,
    extraArgs: readonly string[] = [],
  ) {
    if (!prompt) return undefined;
    // --no-session-persistence keeps title/commit/PR-summary calls out of
    // the `/resume` picker. Ordinary profiles keep the Haiku fallback so async
    // title generation degrades instead of failing under throttling. A local
    // route has exactly one model; a cloud fallback would send the local
    // endpoint a model id it does not serve.
    const args = [
      "-p",
      prompt,
      "--model",
      model,
      ...(options.local ? [] : ["--fallback-model", "haiku"]),
      "--no-session-persistence",
      ...extraArgs,
    ];
    args.push(...claudeControlArgs(effort, fast));
    const env = location ? await profileEnv(location) : undefined;
    return {
      command: "claude",
      args,
      stdin: "",
      ...(env ? { env } : {}),
    };
  }

  // Read-only and text-only lanes keep every isolation flag in one list so the
  // local and cloud branches cannot drift apart.
  const readOnlyOneShotArgs = [
    "--safe-mode",
    "--restricted",
    "--disable-slash-commands",
    "--tools",
    "Read,Glob,Grep",
    "--permission-mode",
    "plan",
    "--allowedTools",
    "Read,Glob,Grep",
    "--disallowedTools",
    "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task,Skill,mcp__*",
    "--mcp-config",
    JSON.stringify({ mcpServers: {} }),
    "--strict-mcp-config",
  ];
  const textOnlyOneShotArgs = [
    "--safe-mode",
    "--tools",
    "",
    "--mcp-config",
    JSON.stringify({ mcpServers: {} }),
    "--strict-mcp-config",
  ];

  /**
   * Map a checked one-shot selection onto the route's carriers. A local route
   * serves one model and no cloud effort/Fast; its legacy empty/false carriers
   * are inactive, while real values refuse before the command is built.
   */
  function resolveClaudeOneShotRoute(
    selection: ReturnType<typeof resolveCheckedOneShotBuilderSelection>,
  ): { model: string; effort: string | undefined; fast: boolean | undefined } {
    if (!options.local) {
      assertOneShotControlsMapped(selection, { effort: true, fast: true });
      return { model: selection.model, effort: selection.effort, fast: selection.fast };
    }
    if (selection.model !== options.local.model) {
      throw new Error(
        `This local profile serves only "${options.local.model}", not "${selection.model}".`,
      );
    }
    assertOneShotControlsMapped(selection, {
      effort: { inactive: [""] },
      fast: { inactive: [false] },
    });
    return { model: options.local.model, effort: undefined, fast: undefined };
  }

  return {
    kind,
    label,
    binary: claudeDetectionSpec.binary,
    supportsDeferredMcpAuthorization: true,
    mcpRequiresStdioCwdProxy: true,
    sessionImport: createClaudeSessionImport(
      options.configDir
        ? resolveNativeTildePath(options.configDir)
        : path.join(homedir(), ".claude"),
    ),
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
      // `/name` expands the skill and streams a normal turn in both the SDK
      // and the TUI. It is also the only way to start a skill marked
      // `disable-model-invocation`, because the model's Skill tool refuses it.
      // Skills marked `user-invocable: false` keep the request form instead.
      invocation: "slash",
      invocationForSkill: claudeSkillInvocationFor,
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
      const result = await installClaudePlugin(ctx, { resolvedNodePath: node.nodePath });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      await uninstallClaudePlugin(ctx);
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
              statusProbe: async (probeCtx: DetectProbeCtx) => {
                const env = await profileEnv(probeCtx.location);
                return probeClaudeStatus(probeCtx, env ? { env } : undefined);
              },
              capabilitiesProbe: async (probeCtx: DetectProbeCtx) => {
                const env = await profileEnv(probeCtx.location);
                return probeClaudeCapabilities(probeCtx, env ? { env } : undefined);
              },
            };
      const status = await detectAgentInstall(ctx, spec);
      const overridden = overrideProfileCapabilities(
        status.capabilities,
        options.models,
        options.efforts,
        options.defaultEffort,
        options.modelEfforts,
        ctx?.agentSettings,
      );
      const identity = options.local ? { ...status } : status;
      if (options.local) {
        delete identity.providerMetadata;
        delete identity.loginCommand;
        delete identity.loginCommandDisplay;
        delete identity.authMethods;
        delete identity.authLogoutSupported;
      }
      return {
        ...identity,
        kind,
        label,
        // A local route says nothing about the base account; it is usable
        // without one and never reports the base identity.
        ...(options.local ? { authState: "authenticated" as const } : {}),
        // Re-assert the profile overrides on top of whatever the probe returned,
        // so the model list / effort allow-list always wins.
        capabilities: options.local
          ? clampClaudeLocalCapabilities(overridden, options.local.model)
          : overridden,
      };
    },
    async buildLaunchArgv(location, config, prompt, _sessionRef, launchOptions) {
      const assignedId = randomUUID();
      const pinnedConfig = pinConfigForLocalRoute(config);
      const args = buildClaudeArgs(pinnedConfig, prompt, undefined, assignedId);
      const mcp = await claudeMcpLaunch(location, launchOptions?.mcpServers);
      args.splice(
        claudeExtraArgsPosition(args, prompt),
        0,
        ...claudeNativeChromeArgs(location, launchOptions?.agentSettings),
        ...mcp.args,
      );
      const env = claudeContextWindowEnv(pinnedConfig.contextSize, await profileEnv(location));
      return {
        ...mcp,
        binary: "claude",
        args,
        ...(env ? { env } : {}),
        sessionRef: createKnownSessionRef(assignedId),
      };
    },
    async buildResumeArgv(location, config, prompt, sessionRef, launchOptions) {
      const pinnedConfig = pinConfigForLocalRoute(config);
      const args = buildClaudeArgs(pinnedConfig, prompt, sessionRef.providerSessionId);
      const mcp = await claudeMcpLaunch(location, launchOptions?.mcpServers);
      args.splice(
        claudeExtraArgsPosition(args, prompt),
        0,
        ...claudeNativeChromeArgs(location, launchOptions?.agentSettings),
        ...mcp.args,
      );
      const env = claudeContextWindowEnv(pinnedConfig.contextSize, await profileEnv(location));
      return { ...mcp, binary: "claude", args, ...(env ? { env } : {}) };
    },
    extraArgsPosition: claudeExtraArgsPosition,
    rewriteLaunchArgsForConfig: options.local
      ? (args, config, location) =>
          rewriteClaudeLaunchArgsForConfig(args, pinConfigForLocalRoute(config), location)
      : rewriteClaudeLaunchArgsForConfig,
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      if (input.presentationMode !== "gui") return undefined;
      const env = await profileEnv(input.projectLocation);
      return ClaudeSdkSession.create({
        ...input,
        ...(options.local ? { config: pinConfigForLocalRoute(input.config) } : {}),
        ...(env ? { env } : {}),
      });
    },
    async buildAcpLogoutCommand(ctx) {
      const location = detectProbeLocation(ctx);
      await prepareAgentLocationEnvironment(location, { signal: ctx?.signal });
      return buildAgentCommand(
        location,
        "claude",
        ["auth", "logout"],
        undefined,
        await profileEnv(location),
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
      // A leading skill must open the line for the CLI to run it, so blank
      // text before it is dropped.
      const lead = leadingSkill(rest);
      const restStr = rest
        .slice(lead ? rest.indexOf(lead) : 0)
        .map((s) => (s.kind === "skill" ? claudeSkillText(s, lead) : inlinePromptSegmentText(s)))
        .join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    handleOscNotification: iterm2ProgressOscHint,
    handleOscTitle: brailleSpinnerOscTitleHint,
    spoofsIterm2StatusEnv: true,
    oscHintsDeferToHookPlugin: true,
    workingSilenceTimeoutMs: null,
    defaultOneShotModel: options.local?.model ?? "haiku",
    async buildOneShotCommand(model, effort, prompt, location, fast, oneShotOptions) {
      // Positionals and the shared selection must agree before any effect.
      const selection = resolveCheckedOneShotBuilderSelection(
        { model, effort, fast },
        oneShotOptions,
      );
      const route = resolveClaudeOneShotRoute(selection);
      return buildClaudeOneShotCommand(
        route.model,
        route.effort,
        prompt,
        location,
        route.fast,
        oneShotOptions?.readOnlyWorkspace ? readOnlyOneShotArgs : [],
      );
    },
    async buildTextOnlyOneShotCommand(model, effort, prompt, location, fast, oneShotOptions) {
      const selection = resolveCheckedOneShotBuilderSelection(
        { model, effort, fast },
        oneShotOptions,
      );
      const route = resolveClaudeOneShotRoute(selection);
      return buildClaudeOneShotCommand(
        route.model,
        route.effort,
        prompt,
        location,
        route.fast,
        textOnlyOneShotArgs,
      );
    },
    async buildContextExtractionCommand(sessionRef, location, model, oneShotOptions) {
      const selection = resolveCheckedOneShotResumeSelection(model, oneShotOptions);
      const local = options.local;
      if (local) {
        if (selection.model !== local.model) {
          throw new Error(
            `This local profile serves only "${local.model}", not "${selection.model}".`,
          );
        }
        assertOneShotControlsMapped(selection, {
          effort: { inactive: [""] },
          fast: { inactive: [false] },
        });
      } else {
        // The resume print run consumes the same native effort/Fast mapping as
        // the one-shot lane; every other present carrier refuses before the
        // command is built.
        assertOneShotControlsMapped(selection, { effort: true, fast: true });
      }
      // The resumed session is read-only here; --no-session-persistence
      // prevents the extraction turn from being written back to disk.
      const args = [
        "-p",
        "--resume",
        sessionRef.providerSessionId,
        "--model",
        local?.model ?? model ?? "haiku",
        "--no-session-persistence",
        ...(local ? [] : claudeControlArgs(selection.effort, selection.fast)),
      ];
      const env = await profileEnv(location);
      return {
        command: "claude",
        args,
        ...(env ? { env } : {}),
      };
    },
  };
}
