import { isDeepStrictEqual } from "node:util";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import { dbGetProject, dbGetThread } from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { assertStoredThreadSelectionReplaceable } from "@/host/db/persistedSelectionData";
import { dbReadThreadWorkspaceGrantOwner } from "@/host/db/threadWorkspaceGrants";
import {
  captureProjectExecutionScope,
  hasSameProjectExecutionScope,
} from "@/host/threads/projectExecutionScope";
import {
  agentStatusForPresentation,
  runtimeVariantForSession,
  validateAgentModelSelection,
} from "@/shared/agentSelection";
import { extractAgentProfileInstanceId } from "@/shared/contracts/agentProfiles";
import { baseAgentKind, extractAcpGenericInstanceId } from "@/shared/contracts/agentInstance";
import type { HostRunCommand, HostRunResumeCommand } from "@/shared/contracts/hostRun";
import {
  sessionRefSchema,
  threadConfigSchema,
  type SessionRef,
  type ThreadConfig,
} from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { resolveNewThreadMcpConfig } from "@/shared/contracts/mcpServer";
import { effectiveAgentSettings, effectiveDisabledAgents } from "@/shared/machineSettings";
import { localMachineKey } from "@/shared/machines";
import type { AdminSupervisorCall } from "./hostProviderAuth";
import {
  SELECTED_AGENT_PROBE_VERSION,
  selectedAgentProbeResultSchema,
} from "@/shared/contracts/agent";

export async function readHostRunTarget(
  input: Pick<
    Extract<HostRunCommand, { action: "run-prepare" }>,
    "projectId" | "agentKind" | "wslDistro"
  >,
  context: HostControlContext,
  call: AdminSupervisorCall,
  readSettings: () => SharedSettings,
  sessionRef?: SessionRef,
) {
  context.assertActive();
  const project = dbGetProject(input.projectId);
  if (!project || project.disabled || project.remoteServerId || project.location.remoteServerId)
    throw new Error("Select an enabled project owned by this server. Run projects list.");
  const providerDisabled = () =>
    effectiveDisabledAgents(readSettings(), localMachineKey({ kind: "native" })).includes(
      input.agentKind,
    );
  if (providerDisabled())
    throw new Error(
      "The selected provider is disabled. Enable it explicitly before running a task.",
    );
  const scope = captureProjectExecutionScope(project);
  const instanceId =
    extractAgentProfileInstanceId(input.agentKind) ?? extractAcpGenericInstanceId(input.agentKind);
  const instance = instanceId ? readSettings().agentInstances[instanceId] : undefined;
  if (
    instanceId &&
    (!instance || instance.enabled === false || instance.driver !== baseAgentKind(input.agentKind))
  )
    throw new Error("The selected provider profile is missing or disabled. Run providers list.");
  const revision = JSON.stringify(instance);
  const nativeSettingsRevision = () =>
    JSON.stringify(
      effectiveAgentSettings(readSettings(), localMachineKey({ kind: "native" }), input.agentKind),
    );
  const selectedNativeSettings = nativeSettingsRevision();
  const assertSelection = () => {
    context.assertActive();
    const current = dbGetProject(input.projectId);
    if (
      !current ||
      current.disabled ||
      providerDisabled() ||
      nativeSettingsRevision() !== selectedNativeSettings ||
      !hasSameProjectExecutionScope(current, scope) ||
      JSON.stringify(instanceId ? readSettings().agentInstances[instanceId] : undefined) !==
        revision
    )
      throw new Error("The selected project or provider profile changed. Prepare the run again.");
  };
  const distro =
    input.wslDistro ?? (project.location.kind === "wsl" ? project.location.distro : undefined);
  // Controlled WSL children require a qualified Linux process/pipe retirement path.
  if (distro)
    throw new Error(
      `Controlled runs in WSL distro ${distro} are not qualified for joined cancellation. Use that provider's supported terminal workflow in the selected distro; no native fallback was attempted.`,
    );
  if (project.location.kind !== (process.platform === "win32" ? "windows" : "posix"))
    throw new Error(
      "The selected project's location is not native to this server. Select its owning environment; no path or account fallback was attempted.",
    );
  const selected = selectedAgentProbeResultSchema.parse(
    await call("probeSelectedAgent", {
      version: SELECTED_AGENT_PROBE_VERSION,
      agentKind: input.agentKind,
    }),
  );
  assertSelection();
  if (
    selected.agentKind !== input.agentKind ||
    selected.status?.kind !== input.agentKind ||
    selected.status.envKind === "wsl"
  )
    throw new Error(
      "The exact provider is unavailable or ambiguous on this host. Run providers list.",
    );
  const source = selected.status;
  if (source.runtimeVariants && !runtimeVariantForSession(source, "gui", sessionRef))
    throw new Error(
      "This provider has no unique structured runtime. Select a supported provider profile.",
    );
  const status = agentStatusForPresentation(source, "gui", sessionRef);
  if (
    !status.installed ||
    !(source.capabilities.presentationModes ?? [source.capabilities.presentationMode]).includes(
      "gui",
    )
  )
    throw new Error(
      "This provider has no installed structured runtime. Terminal runs are not supported by this command.",
    );
  if (status.authState === "missing")
    throw new Error(
      "The selected structured runtime requires authentication. Run auth methods for this exact provider or configure its profile credentials.",
    );
  return { status, instanceId, assertSelection };
}

export async function prepareHostRunSelection(
  input: Extract<HostRunCommand, { action: "run-prepare" }>,
  context: HostControlContext,
  call: AdminSupervisorCall,
  readSettings: () => SharedSettings,
) {
  const { status, instanceId, assertSelection } = await readHostRunTarget(
    input,
    context,
    call,
    readSettings,
  );
  const selectionError = validateAgentModelSelection(status.capabilities, {
    model: input.model,
    ...(input.effort !== undefined ? { reasoning: input.effort } : {}),
  });
  if (selectionError)
    throw new Error(`${selectionError}. Run run --options with the same project and provider.`);
  for (const [value, choices, label] of [
    [input.approvalPolicy, status.capabilities.approvalPolicies, "approval policy"],
    [input.sandboxMode, status.capabilities.sandboxModes, "sandbox mode"],
  ] as const) {
    if (value === undefined ? choices.length > 0 : !choices.some((choice) => choice.id === value))
      throw new Error(
        `Select an explicit advertised ${label}. Run run --options with the same project and provider. No task was launched.`,
      );
  }
  // One-shot runs follow the desktop's standing MCP defaults (Crossagents on
  // by default); no mention picks and no implicit client tools.
  const settings = readSettings();
  const project = dbGetProject(input.projectId);
  const config: ThreadConfig = {
    model: input.model,
    ...(input.effort !== undefined ? { effort: input.effort } : {}),
    ...(input.approvalPolicy !== undefined ? { approvalPolicy: input.approvalPolicy } : {}),
    ...(input.sandboxMode !== undefined ? { sandboxMode: input.sandboxMode } : {}),
    ...(project
      ? resolveNewThreadMcpConfig(
          {
            enabledMcpServers: settings.enabledMcpServers,
            disabledBuiltInMcpServers: settings.disabledBuiltInMcpServers,
          },
          status.capabilities,
          "gui",
          project.location,
        )
      : {}),
  };
  return { config, instanceId, assertSelection };
}

export async function prepareHostRunResumeSelection(
  input: HostRunResumeCommand,
  context: HostControlContext,
  call: AdminSupervisorCall,
  readSettings: () => SharedSettings,
) {
  context.assertActive();
  const resume = dbGetThread(input.threadId);
  if (!resume)
    throw new Error(
      "Saved session not found in this profile. Run sessions list with the same --base-dir.",
    );
  if (resume.remoteServerId || resume.remoteId || resume.presentationMode !== "gui")
    throw new Error(
      "Select a structured session on its owning host. Terminal and remote projections cannot be continued here.",
    );
  if (resume.archived || resume.done)
    throw new Error(
      "Unarchive or reopen the saved session explicitly before continuing it. Run sessions --help.",
    );
  if (!resume.sessionRef)
    throw new Error(
      "The saved session has no provider resume reference. Start a new run explicitly; no replacement session was created.",
    );
  assertStoredThreadSelectionReplaceable(getSqlite(), resume.id);
  const config = threadConfigSchema.strict().parse(resume.config);
  if (!isDeepStrictEqual(config, resume.config))
    throw new Error(
      "The saved configuration contains unsupported fields. No configuration fallback was applied.",
    );
  sessionRefSchema.strict().parse(resume.sessionRef);
  const owner = dbReadThreadWorkspaceGrantOwner(resume.id).owner;
  const configRevision = JSON.stringify(resume.config);
  const sessionRevision = JSON.stringify(resume.sessionRef);
  const assertSavedSelection = () => {
    context.assertActive();
    const current = dbGetThread(resume.id);
    if (
      !current ||
      current.archived ||
      current.done ||
      current.remoteServerId ||
      current.remoteId ||
      dbReadThreadWorkspaceGrantOwner(resume.id).owner !== owner ||
      JSON.stringify(current.config) !== configRevision ||
      JSON.stringify(current.sessionRef) !== sessionRevision
    )
      throw new Error(
        "The saved session's execution selection changed. Prepare the continuation again.",
      );
    assertStoredThreadSelectionReplaceable(getSqlite(), resume.id);
  };
  const target = await readHostRunTarget(
    {
      projectId: resume.projectId,
      agentKind: resume.agentKind,
      ...(config.executionEnvironment ? { wslDistro: config.executionEnvironment.distro } : {}),
    },
    context,
    call,
    readSettings,
    resume.sessionRef,
  );
  assertSavedSelection();
  if (resume.agentInstanceId !== undefined && resume.agentInstanceId !== target.instanceId)
    throw new Error(
      "The saved provider profile does not match its execution identity. No default account or provider was selected.",
    );
  if (!target.status.capabilities.supportsResume)
    throw new Error(
      "The selected structured runtime does not support saved-session continuation. No new session was created.",
    );
  const selectionError = validateAgentModelSelection(target.status.capabilities, {
    model: config.model,
    ...(config.effort !== undefined ? { reasoning: config.effort } : {}),
  });
  if (selectionError)
    throw new Error(
      `${selectionError}. The saved configuration was not changed; inspect this session in a client.`,
    );
  for (const [value, choices, label] of [
    [config.approvalPolicy, target.status.capabilities.approvalPolicies, "approval policy"],
    [config.sandboxMode, target.status.capabilities.sandboxModes, "sandbox mode"],
  ] as const)
    if (value === undefined ? choices.length > 0 : !choices.some((choice) => choice.id === value))
      throw new Error(
        `The saved ${label} is unavailable on the selected runtime. Inspect the session in a client; no configuration fallback was applied.`,
      );
  return {
    resume,
    config,
    instanceId: target.instanceId,
    assertSelection() {
      target.assertSelection();
      assertSavedSelection();
    },
  };
}
