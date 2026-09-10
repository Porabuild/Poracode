import { prepareDevinMcpConfig } from "./mcpConfig";
import { createDevinAcpTransform } from "./acpTransform";
import { runDevinOneShot } from "./oneShot";
import { cachedDevinModels, loadDevinModels } from "./modelCatalog";
import { resolveDevinModel, resolveDevinAcpModel } from "./models";
import { prepareMcpToolFilters } from "../../mcp/McpToolFilterService";
import { createDevinSessionDiscovery } from "./sessionFiles";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { createAcpStructuredSession } from "../acp";
import {
  createKnownSessionRef,
  detectAgentInstall,
  detectProbeLocation,
  type AgentAdapter,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildDevinArgs, buildDevinAcpArgs, buildDevinOneShotArgs } from "./argv";
import { buildDevinCommand, devinDefaultCapabilities, devinDetectionSpec } from "./detection";
import { detectDevinTerminalStatus } from "./terminal";

export function createDevinAdapter(): AgentAdapter {
  const discovery = createDevinSessionDiscovery();
  let capabilities = devinDefaultCapabilities;
  return {
    kind: "devin",
    label: "Devin",
    binary: "devin",
    ...(devinDetectionSpec.update ? { update: devinDetectionSpec.update } : {}),
    get capabilities() {
      return capabilities;
    },
    skillSupport: {
      roots: [
        {
          id: "devin",
          label: "Devin",
          globalPath: ".config/devin/skills",
          globalOverride: { env: "XDG_CONFIG_HOME", path: "devin/skills" },
          projectPath: ".devin/skills",
        },
        {
          id: "agents",
          label: "Shared agent skills",
          globalPath: ".agents/skills",
          projectPath: ".agents/skills",
        },
      ],
      invocation: "slash",
      precedence: { global: ["devin", "agents"], project: ["devin", "agents"] },
    },
    spawnEnv: { wsl: { BROWSER: "/bin/true" } },
    async detectInstall(ctx) {
      const status = await detectAgentInstall(ctx, devinDetectionSpec);
      capabilities = status.capabilities;
      return status;
    },
    buildLaunchArgv(location, config, prompt, sessionRef, options) {
      const id = sessionRef?.providerSessionId ?? options?.resumeThreadId;
      const cleanup = id ? undefined : discovery.prepare(location);
      return {
        binary: "devin",
        args: buildDevinArgs(config, prompt, id),
        ...(cleanup ? { cleanup } : {}),
        ...(id ? { sessionRef: createKnownSessionRef(id) } : {}),
      };
    },
    buildResumeArgv(_location, config, prompt, sessionRef) {
      const id = sessionRef?.providerSessionId;
      // Legacy refs without a provider id use the CLI's cwd-scoped fallback.
      return {
        binary: "devin",
        args: id
          ? buildDevinArgs(config, prompt, id)
          : ["--continue", ...buildDevinArgs(config, prompt)],
      };
    },
    async rewriteLaunchArgsForConfig(args, config, location) {
      await discovery.ready(location);
      const families = cachedDevinModels(location).length
        ? cachedDevinModels(location)
        : await loadDevinModels(location, resolveAgentBinaryPath(location, "devin"));
      const modelIndex = args.indexOf("--model");
      if (modelIndex < 0) return args;
      const resolved = [...args];
      resolved[modelIndex + 1] = resolveDevinModel(config, families);
      return resolved;
    },
    initialSessionRefDiscoveryDelayMs: 1000,
    discoverSessionRef: discovery.discover,
    watchSessionRef: discovery.watch,
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input) {
      // session/new does not persist a native session until a turn runs.
      // Terminal must create its own session in the real PTY.
      if (input.presentationMode !== "gui") return undefined;
      const families = cachedDevinModels(input.projectLocation).length
        ? cachedDevinModels(input.projectLocation)
        : await loadDevinModels(
            input.projectLocation,
            resolveAgentBinaryPath(input.projectLocation, "devin"),
          );
      const mcpServers = await prepareMcpToolFilters(
        input.mcpServers ?? [],
        input.projectLocation,
        { remoteViaStdio: true },
      );
      const overlay = await prepareDevinMcpConfig(input.projectLocation, mcpServers);
      try {
        const command = buildDevinCommand(
          input.projectLocation,
          buildDevinAcpArgs({ ...input.config, model: resolveDevinModel(input.config, families) }),
          resolveAgentBinaryPath(input.projectLocation, "devin"),
        );
        const session = createAcpStructuredSession(
          { ...command, env: { ...command.env, ...overlay.env } },
          { ...input, mcpServers, acpSessionUpdateTransform: createDevinAcpTransform() },
          {
            resolveModelConfig: (config, options) =>
              resolveDevinAcpModel(families, config, options),
            resolveMode: (config) => (config.mode === "plan" ? "plan" : "bypass"),
          },
        );
        if (!session) {
          await overlay.cleanup();
          return undefined;
        }
        const dispose = session.dispose.bind(session);
        session.dispose = async () => {
          try {
            await dispose();
          } finally {
            await overlay.cleanup();
          }
        };
        return session;
      } catch (error) {
        await overlay.cleanup();
        throw error;
      }
    },
    async buildAcpAuthCommand(ctx) {
      const location = detectProbeLocation(ctx);
      return buildDevinCommand(location, ["acp"], resolveAgentBinaryPath(location, "devin"));
    },
    async buildAcpLogoutCommand(ctx) {
      const location = detectProbeLocation(ctx);
      return buildDevinCommand(
        location,
        ["auth", "logout"],
        resolveAgentBinaryPath(location, "devin"),
      );
    },
    preferAcpLogoutRpc: false,
    buildDirectInput(prompt) {
      return ["\x1b[200~", prompt, "\x1b[201~", "@wait:500", "\r"];
    },
    buildTerminalPreInputs(config) {
      return config.mode === "plan" ? [["/plan", "@wait:200", "\r"]] : undefined;
    },
    shouldDeferPromptToTerminal(config) {
      return config.mode === "plan";
    },
    isReadyForInitialPrompt(text) {
      return detectDevinTerminalStatus(text)?.status === "idle";
    },
    formatPromptSegments(segments) {
      return segments
        .map((segment) =>
          segment.kind === "attachment" ? `@${segment.path} ` : inlinePromptSegmentText(segment),
        )
        .join("");
    },
    detectTerminalStatus: detectDevinTerminalStatus,
    defaultOneShotModel: "swe-1-6-fast",
    runOneShot: runDevinOneShot,
    buildOneShotCommand(model, effort, prompt, location, fast) {
      return prompt
        ? {
            command: "devin",
            args: buildDevinOneShotArgs(
              location
                ? resolveDevinModel(
                    {
                      model,
                      ...(effort ? { effort } : {}),
                      ...(fast !== undefined ? { fast } : {}),
                    },
                    cachedDevinModels(location),
                  )
                : model,
              prompt,
            ),
            stdin: "",
          }
        : undefined;
    },
  };
}
