import { statSync } from "node:fs";
import { join } from "node:path";
import type { AgentCapability, PromptSegment, ProjectLocation } from "@/shared/contracts";
import { compareVersions } from "@/shared/changelog";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { EXTRACTION_PROMPT } from "@/supervisor/contextExtractor";
import {
  createKnownSessionRef,
  detectAgentInstall,
  watchSessionPaths,
  type AgentAdapter,
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

export { detectAntigravityInvalidSessionRef } from "./session";

export function shouldUseAntigravityPrintPty(version: string | undefined): boolean {
  return !version || compareVersions(version, "1.1.1") < 0;
}

function isLinkedGitWorktree(location: ProjectLocation): boolean {
  const root = location.kind === "wsl" ? location.uncPath : location.path;
  try {
    return statSync(join(root, ".git")).isFile();
  } catch {
    return false;
  }
}

export function createAntigravityAdapter(): AgentAdapter {
  let capabilities: AgentCapability = defaultAntigravityCapabilities;
  let preSpawnConversationIds = new Set<string>();
  let preSpawnLastConversationForCwd: string | undefined;
  let preSpawnStartedAt = 0;
  let supportsSeparateModelEffort = false;
  let usePtyForPrint = true;
  let defaultModel = ANTIGRAVITY_DEFAULT_MODEL_ID;
  const detectionSpec = createAntigravityDetectionSpec((probe) => {
    supportsSeparateModelEffort = probe.dialect.separateModelEffort;
    defaultModel = probe.capabilities?.models[0]?.id ?? ANTIGRAVITY_DEFAULT_MODEL_ID;
  });

  return {
    kind: detectionSpec.kind,
    label: detectionSpec.label,
    binary: detectionSpec.binary,
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

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, detectionSpec);
      capabilities = status.capabilities;
      supportsSeparateModelEffort ||= Boolean(
        status.version && compareVersions(status.version, "1.1.5") >= 0,
      );
      usePtyForPrint = shouldUseAntigravityPrintPty(status.version);
      return status;
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
      // agy's default project loses linked-worktree scope when its Git watcher
      // rejects worktreeConfig; an explicit project keeps file tools in this cwd.
      if (isLinkedGitWorktree(location)) args.unshift("--new-project");
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
      return detectAntigravityTerminalStatus(text, capabilities);
    },
    syncConfigFromTerminalState(input) {
      return syncAntigravityConfigFromTerminalState(input, capabilities);
    },
    detectInvalidSessionRef: detectAntigravityInvalidSessionRef,

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

    // Antigravity has no structured (GUI) runtime, so it joins the subagent
    // roster via the one-shot child lane. Unlike title/commit generation this
    // does NOT isolate the cwd — a child runs in the parent's project directory
    // so it can actually read/edit the repo. Since agy 1.1.3, headless mode
    // soft-denies tools requiring confirmation, so subagents need the explicit
    // bypass to perform their assigned project work.
    buildSubagentOneShotCommand({ model, effort, prompt, location }) {
      return {
        command: "agy",
        args: [
          ...(isLinkedGitWorktree(location) ? ["--new-project"] : []),
          ...buildAntigravityModelArgs(model, effort, supportsSeparateModelEffort, defaultModel),
          "--dangerously-skip-permissions",
          "-p",
          prompt,
        ],
        stdin: "",
        ...(usePtyForPrint ? { pty: true } : {}),
      };
    },
  };
}
