import {
  homeProfileKind,
  parseHomeProfileInstanceConfig,
  type AgentCapability,
  type AgentInstanceConfig,
  type ProjectLocation,
} from "@/shared/contracts";
import type { OscNotification } from "@/shared/osc";
import {
  batchWslCommandsAsync,
  brailleSpinnerOscTitleHint,
  buildAgentCommand,
  buildAgentLogoutCommand,
  configFileAuthProbe,
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  getOscNotificationText,
  watchSessionPaths,
  type AgentAdapter,
  type CreateStructuredSessionInput,
  type TerminalStatusHint,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { CodexStructuredSession } from "./acp";
import { buildCodexArgvFor, codexExtraArgsPosition, primeCodexGoalsSupport } from "./argv";
import { codexDefaultCapabilities, codexDetectionSpec } from "./detection";
import { codexHomeEnvForLocation } from "./profile";
import { detectRateLimitPrompt } from "./rateLimitPrompt";
import { resolveInstallNodePath, warnIfPluginManifestMissing } from "../plugin/installerBase";
import {
  codexHooksFeatureFlagForSemver,
  installCodexPlugin,
  isCodexPluginInstalled,
  isCodexSemverSupportedForHooks,
  isCodexVersionSupportedForHooks,
  parseCodexVersionLine,
  probeCodexCliSemver,
  readBundledCodexPluginVersion,
  uninstallCodexPlugin,
} from "./plugin/install";
import {
  describeCodexLocation,
  isInteractiveCodexRollout,
  readCodexRolloutMetaForLocationAsync,
  readCodexRolloutsForLocation,
  readCodexRolloutsForLocationAsync,
  readCodexSessionIndexForLocation,
  readCodexSessionIndexForLocationAsync,
  resolveCodexSessionWatchPaths,
} from "./session";
import type { CodexRolloutMeta } from "./sessionFiles";
import { codexAuthPath } from "./sessionFiles";
import { detectCodexReadyForInitialPrompt } from "./terminal";

export { buildCodexAppServerCommand } from "./argv";
export { deriveCodexStructuredState, parseCodexSocketMessage } from "./acp";
export { detectCodexReadyForInitialPrompt, detectCodexUpdatePrompt } from "./terminal";

const CODEX_PLUGIN_VERSION = readBundledCodexPluginVersion();
const CODEX_MIN_HOOKS_VERSION_LABEL = "0.122.0";

warnIfPluginManifestMissing(
  "codex",
  CODEX_PLUGIN_VERSION,
  "Expected at src/supervisor/agents/codex/plugin/ (dev) or " +
    "resources/agent-plugins/codex/ (packaged, staged by scripts/prepare-agent-plugins.mjs).",
);

function codexOscHint(notification: OscNotification): TerminalStatusHint | null {
  const t = getOscNotificationText(notification);
  if (
    t.includes("approval") ||
    t.includes("permission-requested") ||
    t.includes("permission_requested") ||
    t.includes("needs_approval") ||
    // Plan-mode prompt: Codex pauses after presenting a plan until the user
    // approves / edits / rejects. Emits OSC 9 with body "Plan mode prompt: …".
    t.includes("plan mode prompt")
  ) {
    return { status: "needs_approval", attention: "needs_approval", corroborated: true };
  }
  // Codex 0.122+ uses notify (OSC 9 / 777 / 99) per Growl/notify semantics:
  // the terminal emits a notification whenever a turn ends (and then includes
  // the assistant's response text as the body). So any OSC notification that
  // doesn't match an approval / prompt keyword corresponds to "turn complete"
  // → idle.
  //
  // We still keep the explicit keyword match above so an approval-style notify
  // wins, even if it happens to also carry response text.
  if (t.length > 0) {
    return { status: "idle", attention: "none", corroborated: true };
  }
  return null;
}

async function resolveCodexHooksFeatureFlag(ctx: {
  envKind: "windows" | "wsl" | "posix";
  wslDistro?: string;
}): Promise<string> {
  if (ctx.envKind === "wsl" && ctx.wslDistro) {
    const [verOut] = await batchWslCommandsAsync(ctx.wslDistro, ["codex --version"]);
    const versionLine =
      verOut?.stdout
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? "";
    return codexHooksFeatureFlagForSemver(parseCodexVersionLine(versionLine));
  }
  return codexHooksFeatureFlagForSemver(probeCodexCliSemver());
}

interface CodexAdapterOptions {
  kind?: string;
  label?: string;
  homeDir?: string;
}

export function createCodexProfileAdapter(instance: AgentInstanceConfig): AgentAdapter {
  const config = parseHomeProfileInstanceConfig(instance.config);
  const profileLabel = instance.displayName ?? instance.id;
  return createCodexAdapter({
    kind: homeProfileKind("codex", instance.id),
    label: `Codex ${profileLabel}`,
    homeDir: config.homeDir,
  });
}

export function createCodexAdapter(options: CodexAdapterOptions = {}): AgentAdapter {
  const kind = options.kind ?? codexDetectionSpec.kind;
  const label = options.label ?? codexDetectionSpec.label;
  const profileEnv = (location: ProjectLocation) =>
    codexHomeEnvForLocation(options.homeDir, location);
  let capabilities: AgentCapability = codexDefaultCapabilities;
  let preSpawnRolloutIds = new Set<string>();
  let preSpawnStartedAt = 0;

  return {
    kind,
    label,
    binary: codexDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "codex",
          label,
          globalPath: ".codex/skills",
          builtInPath: ".system",
          ...(options.homeDir ? { globalBasePath: options.homeDir } : {}),
          globalOverride: { env: "CODEX_HOME", path: "skills" },
        },
      ],
      invocation: "dollar",
      precedence: {
        global: ["agents", "codex", "codex-built-in"],
        project: ["agents"],
      },
    },
    ...(codexDetectionSpec.update ? { update: codexDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    pluginId: "poracode-status@codex",
    pluginVersion: CODEX_PLUGIN_VERSION,
    minProtocolVersion: 1,
    async isPluginSupported(ctx) {
      // Node availability is now handled by the runtime resolver during
      // installPlugin (probe-first with auto-install fallback). We only
      // gate hook support on the codex CLI version itself.
      if (ctx.envKind === "wsl" && ctx.wslDistro) {
        const [verOut] = await batchWslCommandsAsync(ctx.wslDistro, ["codex --version"]);
        const versionLine =
          verOut?.stdout
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.length > 0) ?? "";
        const v = parseCodexVersionLine(versionLine);
        if (!isCodexSemverSupportedForHooks(v)) {
          console.warn(
            `[codex] WSL hook plugin unsupported in distro ${ctx.wslDistro}: ` +
              `need codex-cli >= ${CODEX_MIN_HOOKS_VERSION_LABEL}, got ${
                versionLine || "(unparseable `codex --version` output)"
              }`,
          );
          return false;
        }
        return true;
      }
      return isCodexVersionSupportedForHooks();
    },
    isPluginInstalled(ctx) {
      return isCodexPluginInstalled(ctx, options.homeDir);
    },
    async installPlugin(ctx) {
      const node = await resolveInstallNodePath(ctx);
      if (!node.ok) return node;
      const result = await installCodexPlugin(ctx, {
        resolvedNodePath: node.nodePath,
        ...(options.homeDir ? { profileHomeDir: options.homeDir } : {}),
      });
      if (!result.ok) return result;
      return { ok: true, version: result.version };
    },
    async uninstallPlugin(ctx) {
      await uninstallCodexPlugin(ctx, options.homeDir);
    },
    async pluginLaunchExtras(ctx) {
      const hooksFeatureFlag = await resolveCodexHooksFeatureFlag(ctx);
      return {
        args: ["--enable", hooksFeatureFlag],
      };
    },
    handleOscNotification: codexOscHint,
    handleOscTitle: brailleSpinnerOscTitleHint,
    oscHintsDeferToHookPlugin: true,
    async detectInstall(ctx) {
      const location = detectProbeLocation(ctx);
      const env = profileEnv(location);
      const detectionSpec = env
        ? {
            ...codexDetectionSpec,
            kind,
            label,
            probeEnv: env,
            authProbes: [
              configFileAuthProbe((probeLocation) =>
                probeLocation.kind === "wsl" ? undefined : codexAuthPath(env.CODEX_HOME),
              ),
            ],
          }
        : codexDetectionSpec;
      const status = await detectAgentInstall(ctx, detectionSpec);
      primeCodexGoalsSupport(location, status.version, status.executablePath);
      capabilities = status.capabilities;
      return status;
    },
    buildLaunchArgv(location: ProjectLocation, config, prompt, sessionRef, launchOptions) {
      const env = profileEnv(location);
      const codexHome = env?.CODEX_HOME;
      preSpawnStartedAt = Date.now();
      if (location.kind === "wsl") {
        preSpawnRolloutIds = new Set();
      } else {
        const sessions = readCodexSessionIndexForLocation(location, codexHome);
        const rollouts = readCodexRolloutsForLocation(location, codexHome);
        preSpawnRolloutIds = new Set(rollouts.map((rollout) => rollout.id));
        console.log(
          [
            `[codex] pre-spawn session snapshot (${describeCodexLocation(location)})`,
            `  sessionIndex: ${sessions.length}`,
            `  latestIndex: ${sessions.at(-1)?.id ?? "(none)"}`,
            `  interactiveRollouts: ${rollouts.length}`,
          ].join("\n"),
        );
      }
      return buildCodexArgvFor(location, config, prompt, sessionRef, launchOptions, env);
    },
    buildResumeArgv(location, config, prompt, sessionRef, launchOptions) {
      return buildCodexArgvFor(
        location,
        config,
        prompt,
        sessionRef,
        launchOptions,
        profileEnv(location),
      );
    },
    extraArgsPosition: codexExtraArgsPosition,
    createInitialSessionRef() {
      return undefined;
    },
    /**
     * Codex app-server backs `presentationMode === "gui"` chat.
     * Terminal threads skip the spawn — the PTY-driven CLI is the only
     * surface and the app server would just waste a process.
     */
    async createStructuredSession(input: CreateStructuredSessionInput) {
      if (input.presentationMode !== "gui") {
        return undefined;
      }
      const wslExecPath = resolveAgentBinaryPath(input.projectLocation, "codex");
      return CodexStructuredSession.create(input, wslExecPath, profileEnv(input.projectLocation));
    },
    buildAcpLogoutCommand: options.homeDir
      ? async (ctx) => {
          const location = detectProbeLocation(ctx);
          return buildAgentCommand(
            location,
            "codex",
            ["logout"],
            resolveAgentBinaryPath(location, "codex"),
            profileEnv(location),
          );
        }
      : buildAgentLogoutCommand("codex", ["logout"]),
    buildDirectInput(prompt) {
      return [prompt, "@wait:160", "\r"];
    },
    isReadyForInitialPrompt(text) {
      return detectCodexReadyForInitialPrompt(text);
    },
    detectAutoResponse(text) {
      if (detectRateLimitPrompt(text)) return "2";
      return null;
    },
    initialSessionRefDiscoveryDelayMs: 1000,
    watchSessionRef(location, onChanged) {
      const paths = resolveCodexSessionWatchPaths(location, profileEnv(location)?.CODEX_HOME);
      if (paths.length === 0) return undefined;
      return watchSessionPaths(
        location,
        paths,
        onChanged,
        `codex:${describeCodexLocation(location)}`,
      );
    },
    async discoverSessionRef(location) {
      try {
        const codexHome = profileEnv(location)?.CODEX_HOME;
        const [sessions, rollouts] = await Promise.all([
          readCodexSessionIndexForLocationAsync(location, codexHome),
          readCodexRolloutsForLocationAsync(location, codexHome),
        ]);
        const newRollouts = rollouts
          .filter((rollout) => !preSpawnRolloutIds.has(rollout.id))
          .filter(
            (rollout) =>
              preSpawnStartedAt === 0 ||
              rollout.updatedAt === undefined ||
              rollout.updatedAt >= preSpawnStartedAt - 1000,
          )
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        let next: CodexRolloutMeta | undefined;
        for (const candidate of newRollouts) {
          const meta = await readCodexRolloutMetaForLocationAsync(location, candidate);
          if (meta && isInteractiveCodexRollout(meta, location)) {
            next = meta;
            break;
          }
        }
        console.log(
          [
            `[codex] discoverSessionRef (${describeCodexLocation(location)})`,
            `  sessionIndex: ${sessions.length}`,
            `  interactiveRollouts: ${rollouts.length}`,
            `  preSpawnRollouts: ${preSpawnRolloutIds.size}`,
            `  newRollouts: ${newRollouts.length}`,
            `  latestIndex: ${sessions.at(-1)?.id ?? "(none)"}`,
            `  candidate: ${next?.id ?? "(none)"}`,
            `  originator: ${next?.originator ?? "(none)"}`,
            `  source: ${next?.source ?? "(none)"}`,
          ].join("\n"),
        );
        if (!next) {
          return undefined;
        }
        console.log("[codex] discovered interactive session id from rollout file: %s", next.id);
        return createKnownSessionRef(next.id);
      } catch (error) {
        console.log(
          "[codex] discoverSessionRef failed (%s): %s",
          describeCodexLocation(location),
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
    },
    defaultOneShotModel: "gpt-5.5",
    buildOneShotCommand(model, effort, _prompt, location) {
      // `--skip-git-repo-check` lets `codex exec` run from worktrees or other
      // directories not on codex's trust list. Title generation only reads
      // the user's prompt from stdin and emits a short string — it never
      // touches the repo, so the trust gate is just noise here.
      const args = ["exec", "--skip-git-repo-check", "-m", model];
      if (effort) {
        args.push("-c", `model_reasoning_effort="${effort}"`);
      }
      args.push("-");
      const env = profileEnv(location ?? detectProbeLocation(undefined));
      return { command: "codex", args, ...(env ? { env } : {}) };
    },
    buildContextExtractionCommand(_sessionRef, _location, _model) {
      return undefined;
    },
  };
}
