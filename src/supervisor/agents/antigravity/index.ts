import type {
  AgentCapability,
  AgentInstanceConfig,
  PromptSegment,
  ProjectLocation,
} from "@/shared/contracts";
import { ANTIGRAVITY_ACP_REGISTRY_ID } from "@/shared/agents/antigravity";
import { compareVersions } from "@/shared/changelog";
import { isHomeScopeLocation } from "@/shared/homeScope";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { EXTRACTION_PROMPT } from "@/supervisor/contextExtractor";
import {
  createKnownSessionRef,
  detectAgentInstall,
  watchSessionPaths,
  type AgentAdapter,
  inheritBaseSpawnEnv,
} from "../base";
import { probeAntigravityAccount } from "./antigravityAccountProbe";
import { buildAntigravityArgs, buildAntigravityModelArgs } from "./argv";
import {
  ANTIGRAVITY_DEFAULT_MODEL_ID,
  createAntigravityDetectionSpec,
  defaultAntigravityCapabilities,
} from "./detection";
import {
  describeAntigravityLocation,
  detectAntigravityInvalidSessionRef,
  locationCwd,
  readAntigravityConversationIds,
  readAntigravityLastConversationForCwd,
  readAntigravityLastConversationForCwdAsync,
  readNewestAntigravityConversationForCwd,
  readNewestAntigravityConversationIdAsync,
  resolveAntigravityWatchPaths,
} from "./session";
import {
  detectAntigravityTerminalStatus,
  syncAntigravityConfigFromTerminalState,
} from "./terminal";
import { applyAntigravityAcpStatus, createAntigravityAcpRuntime } from "./acp";

export { detectAntigravityInvalidSessionRef } from "./session";

export function shouldUseAntigravityPrintPty(version: string | undefined): boolean {
  return !version || compareVersions(version, "1.1.1") < 0;
}

export function createAntigravityAdapter(acpInstance?: AgentInstanceConfig): AgentAdapter {
  const acpRuntime = createAntigravityAcpRuntime(acpInstance);
  const createAcpSession = acpRuntime?.createStructuredSession;
  const buildAcpAuthCommand = acpRuntime?.buildAcpAuthCommand;
  let terminalCapabilities: AgentCapability = defaultAntigravityCapabilities;
  let capabilities: AgentCapability = acpRuntime
    ? {
        ...defaultAntigravityCapabilities,
        presentationModes: ["terminal", "gui"],
        mcpScope: { terminal: "none", gui: "launch" },
        presentationCapabilities: { gui: acpRuntime.capabilities },
      }
    : defaultAntigravityCapabilities;
  let preSpawnConversationIds = new Set<string>();
  let preSpawnLastConversationForCwd: string | undefined;
  let preSpawnStartedAt = 0;
  let supportsSeparateModelEffort = false;
  let usePtyForPrint = true;
  // Detection updates this; `true` until the first probe keeps the CLI lane
  // for anything that reads the adapter before a status refresh lands.
  let cliRuntimeInstalled = true;
  let defaultModel = ANTIGRAVITY_DEFAULT_MODEL_ID;
  const detectionSpec = createAntigravityDetectionSpec((probe) => {
    supportsSeparateModelEffort = probe.dialect.separateModelEffort;
    defaultModel = probe.capabilities?.models[0]?.id ?? ANTIGRAVITY_DEFAULT_MODEL_ID;
  });

  return {
    kind: detectionSpec.kind,
    label: detectionSpec.label,
    binary: detectionSpec.binary,
    firstClassAcpRegistryId: ANTIGRAVITY_ACP_REGISTRY_ID,
    skillSupport: {
      roots: [
        {
          id: "antigravity",
          label: detectionSpec.label,
          globalPath: ".gemini/config/skills",
          projectPath: ".agent/skills",
        },
        {
          // Antigravity loads `{workspace}/.agents/skills/{name}/SKILL.md`
          // (verified against the shipped binary); no global `.agents` scan.
          id: "agents",
          label: "Shared agent skills",
          projectPath: ".agents/skills",
        },
      ],
      projectionRoots: [
        {
          id: "antigravity",
          label: detectionSpec.label,
          globalPath: ".gemini/config/skills",
        },
      ],
      invocation: "prompt",
      precedence: {
        global: ["antigravity", "agents"],
        project: ["agents", "antigravity"],
      },
    },
    ...(detectionSpec.update ? { update: detectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    // BROWSER=/bin/true keeps the WSL OAuth flow from trying to `xdg-open`
    // a browser inside the distro and hanging the PTY.
    spawnEnv: {
      wsl: { BROWSER: "/bin/true" },
    },
    // Stops `agy`'s background self-updater from detaching out of the thread's
    // pseudoconsole and popping a stray terminal window.
    ...inheritBaseSpawnEnv(detectionSpec),

    async detectInstall(ctx) {
      const [status, acpStatus] = await Promise.all([
        detectAgentInstall(ctx, detectionSpec),
        acpRuntime?.detectInstall(ctx),
      ]);
      terminalCapabilities = status.capabilities;
      cliRuntimeInstalled = status.installed;
      const merged = applyAntigravityAcpStatus(status, acpStatus);
      capabilities = merged.capabilities;
      supportsSeparateModelEffort ||= Boolean(
        status.version && compareVersions(status.version, "1.1.5") >= 0,
      );
      usePtyForPrint = shouldUseAntigravityPrintPty(status.version);
      return merged;
    },

    async resolveAccount({ status, wslDistros }) {
      // Spawning `agy` is only safe once the user is signed in (the config-dir
      // probe's soft signal) — a never-authenticated spawn would drop into the
      // interactive OAuth flow. Otherwise restrict to reusing a running LS.
      return probeAntigravityAccount({
        ...(status?.executablePath ? { executablePath: status.executablePath } : {}),
        wslDistros,
        allowSpawn: status?.authState === "authenticated",
      });
    },

    buildLaunchArgv(location, config, prompt) {
      // `agy` has no flag to pre-assign a conversation id; the conversation db
      // only appears once the session starts. Snapshot the existing ids + the
      // workspace's cached "last" id so `discoverSessionRef` can pick out the
      // brand-new conversation created for this launch. On WSL we can't read
      // those files synchronously, so leave the snapshot empty and rely on the
      // post-spawn start time to window the async discovery instead.
      preSpawnStartedAt = Date.now();
      if (location.kind === "wsl") {
        preSpawnConversationIds = new Set();
        preSpawnLastConversationForCwd = undefined;
      } else {
        preSpawnConversationIds = readAntigravityConversationIds(location);
        preSpawnLastConversationForCwd = readAntigravityLastConversationForCwd(
          location,
          locationCwd(location),
        );
      }
      const args = buildAntigravityArgs(
        config,
        prompt,
        undefined,
        supportsSeparateModelEffort,
        defaultModel,
      );
      // Keep file tools in the selected project. Home remains projectless so it
      // can continue to serve as an OS-level session spanning user folders.
      if (!isHomeScopeLocation(location)) args.unshift("--new-project");
      return { binary: "agy", args };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      const args = buildAntigravityArgs(
        config,
        prompt,
        sessionRef.providerSessionId,
        supportsSeparateModelEffort,
        defaultModel,
      );
      return { binary: "agy", args };
    },

    createInitialSessionRef() {
      return undefined;
    },
    initialSessionRefDiscoveryDelayMs: 1000,

    async discoverSessionRef(location: ProjectLocation) {
      const cwd = locationCwd(location);
      // WSL can't synchronously read the conversation db's workspace URI over
      // the bridge, so fall back to the cached "last" id plus a time-windowed
      // newest-by-mtime scan (anchored to the launch time) for the live case.
      if (location.kind === "wsl") {
        const latest = await readAntigravityLastConversationForCwdAsync(location, cwd);
        if (
          latest &&
          latest !== preSpawnLastConversationForCwd &&
          !preSpawnConversationIds.has(latest)
        ) {
          return createKnownSessionRef(latest);
        }
        const newest = await readNewestAntigravityConversationIdAsync(
          location,
          preSpawnConversationIds,
          preSpawnStartedAt - 1000,
        );
        return newest ? createKnownSessionRef(newest) : undefined;
      }
      // Primary: the conversation db created for THIS workspace. It exists as
      // soon as the interactive session starts, and the workspace match rules
      // out concurrent one-shot calls (title/commit/PR), which run in an
      // isolated cwd. Required to be correct on the first hit — the runtime
      // locks the first discovered ref and stops watching.
      const matched = readNewestAntigravityConversationForCwd(
        location,
        preSpawnConversationIds,
        cwd,
      );
      if (matched) return createKnownSessionRef(matched);
      // Fallback: the workspace → last-conversation cache. `agy` only writes
      // this on exit, so it covers re-discovery of an already-closed session
      // (e.g. after an app restart) rather than the live case above.
      const latest = readAntigravityLastConversationForCwd(location, cwd);
      if (
        latest &&
        latest !== preSpawnLastConversationForCwd &&
        !preSpawnConversationIds.has(latest)
      ) {
        return createKnownSessionRef(latest);
      }
      return undefined;
    },

    watchSessionRef(location, onChanged) {
      const paths = resolveAntigravityWatchPaths(location);
      if (paths.length === 0) return undefined;
      return watchSessionPaths(
        location,
        paths,
        onChanged,
        `antigravity:${describeAntigravityLocation(location)}`,
      );
    },

    buildDirectInput(prompt) {
      // The TUI treats bulk writes as paste, so an embedded `\r` becomes a
      // literal newline in the input field instead of submitting. Pause ~40ms
      // between the text and the Enter key so they arrive as separate events.
      return [prompt, "@wait:40", "\r"];
    },

    formatPromptSegments(segments: PromptSegment[]) {
      const attachments = segments.filter((s) => s.kind === "attachment");
      const rest = segments.filter((s) => s.kind !== "attachment");
      const attachmentLines = attachments.map((s) => `@${s.path}`).join(" ");
      const restStr = rest.map(inlinePromptSegmentText).join("");
      return attachmentLines ? `${restStr}\n\n${attachmentLines} ` : restStr;
    },
    detectTerminalStatus(text) {
      return detectAntigravityTerminalStatus(text, terminalCapabilities);
    },
    syncConfigFromTerminalState(input) {
      return syncAntigravityConfigFromTerminalState(input, terminalCapabilities);
    },
    detectInvalidSessionRef: detectAntigravityInvalidSessionRef,
    // The one-shot child lane runs `agy`, so it is only usable while the CLI
    // runtime is detected. On a machine with just the ACP chat artifact the
    // structured runtime is the child lane instead (as the pre-adoption
    // registry provider was).
    get subagentExecutionPreference() {
      return cliRuntimeInstalled ? ("one-shot" as const) : ("structured" as const);
    },

    get defaultOneShotModel() {
      return defaultModel;
    },

    buildOneShotCommand(model, effort, prompt) {
      if (!prompt) return undefined;
      // `agy -p` persists a throwaway conversation AND rewrites
      // last_conversations.json[cwd] with its id. Running it in the project cwd
      // would race the real `--prompt-interactive` session for that cache key
      // and make `discoverSessionRef` latch onto the one-shot conversation
      // (title gen, commit-msg, PR summary). `agy` has no flag to pre-assign a
      // conversation id, so isolate the cwd instead — the prompt is fully
      // self-contained, so the working directory is irrelevant to the output.
      return {
        command: "agy",
        args: [
          ...buildAntigravityModelArgs(model, effort, supportsSeparateModelEffort, defaultModel),
          "-p",
          prompt,
        ],
        stdin: "",
        isolateCwd: true,
        ...(usePtyForPrint ? { pty: true } : {}),
      };
    },

    buildContextExtractionCommand(sessionRef, _location, model) {
      return {
        command: "agy",
        args: [
          "--conversation",
          sessionRef.providerSessionId,
          ...buildAntigravityModelArgs(model, undefined, supportsSeparateModelEffort, defaultModel),
          "-p",
          EXTRACTION_PROMPT,
        ],
        stdin: "",
      };
    },

    // Subagents stay on the agy one-shot lane so the terminal CLI remains the
    // execution source for child work. Unlike title/commit generation this does
    // NOT isolate the cwd — a child runs in the parent's project directory.
    buildSubagentOneShotCommand({ model, effort, prompt, location }) {
      return {
        command: "agy",
        args: [
          ...(!isHomeScopeLocation(location) ? ["--new-project"] : []),
          ...buildAntigravityModelArgs(model, effort, supportsSeparateModelEffort, defaultModel),
          "--dangerously-skip-permissions",
          "-p",
          prompt,
        ],
        stdin: "",
        ...(usePtyForPrint ? { pty: true } : {}),
      };
    },

    ...(createAcpSession
      ? {
          createStructuredSession: async (input) => {
            if (input.presentationMode !== "gui") return undefined;
            return createAcpSession(input);
          },
        }
      : {}),
    ...(buildAcpAuthCommand
      ? {
          buildAcpAuthCommand: (ctx) => buildAcpAuthCommand(ctx),
        }
      : {}),
  };
}
