import type { AgentCapability, PromptSegment, ProjectLocation } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import {
  createKnownSessionRef,
  detectAgentInstall,
  watchSessionPaths,
  type AgentAdapter,
} from "../base";
import { probeAntigravityAccount } from "./antigravityAccountProbe";
import { buildAntigravityArgs, resolveAntigravityModel } from "./argv";
import {
  ANTIGRAVITY_DEFAULT_MODEL_ID,
  antigravityDetectionSpec,
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
import { detectAntigravityTerminalStatus } from "./terminal";

export { detectAntigravityInvalidSessionRef } from "./session";

export function createAntigravityAdapter(): AgentAdapter {
  let capabilities: AgentCapability = defaultAntigravityCapabilities;
  let preSpawnConversationIds = new Set<string>();
  let preSpawnLastConversationForCwd: string | undefined;
  let preSpawnStartedAt = 0;

  return {
    kind: antigravityDetectionSpec.kind,
    label: antigravityDetectionSpec.label,
    binary: antigravityDetectionSpec.binary,
    skillSupport: {
      roots: [
        {
          id: "antigravity",
          label: antigravityDetectionSpec.label,
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
          label: antigravityDetectionSpec.label,
          globalPath: ".gemini/config/skills",
        },
      ],
      invocation: "prompt",
      precedence: {
        global: ["antigravity", "agents"],
        project: ["agents", "antigravity"],
      },
    },
    ...(antigravityDetectionSpec.update ? { update: antigravityDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    // BROWSER=/bin/true keeps the WSL OAuth flow from trying to `xdg-open`
    // a browser inside the distro and hanging the PTY.
    spawnEnv: {
      wsl: { BROWSER: "/bin/true" },
    },

    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, antigravityDetectionSpec);
      capabilities = status.capabilities;
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
      const args = buildAntigravityArgs(config, prompt);
      return { binary: "agy", args };
    },

    buildResumeArgv(_location, config, prompt, sessionRef) {
      const args = buildAntigravityArgs(config, prompt, sessionRef.providerSessionId);
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
    detectTerminalStatus: detectAntigravityTerminalStatus,
    detectInvalidSessionRef: detectAntigravityInvalidSessionRef,

    defaultOneShotModel: ANTIGRAVITY_DEFAULT_MODEL_ID,

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
        args: ["--model", resolveAntigravityModel(model, effort), "-p", prompt],
        stdin: "",
        isolateCwd: true,
        pty: true,
      };
    },

    // Antigravity has no structured (GUI) runtime, so it joins the subagent
    // roster via the one-shot child lane. Unlike title/commit generation this
    // does NOT isolate the cwd — a child runs in the parent's project directory
    // so it can actually read/edit the repo. `agy -p` print mode is fully
    // non-interactive (no approval prompts), so there is no extra bypass flag.
    buildSubagentOneShotCommand({ model, effort, prompt }) {
      return {
        command: "agy",
        args: ["--model", resolveAntigravityModel(model, effort), "-p", prompt],
        stdin: "",
        pty: true,
      };
    },
  };
}
