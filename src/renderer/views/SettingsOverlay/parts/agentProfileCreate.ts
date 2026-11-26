import { msg } from "@lingui/core/macro";
import {
  agentProfileKind,
  type AgentInstanceConfig,
  type AgentStatus,
  type CreateProfilePayload,
} from "@/shared/contracts";
import {
  isOllamaContextLength,
  isValidOllamaInstalledModelId,
  ollamaContextAlias,
} from "@/shared/agents/ollamaContext";
import { i18n } from "@/renderer/i18n/i18n";
import type { AgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { rediscoverHostAgents } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { refreshPairedHostProfilesNow } from "@/renderer/state/pairedHostProfiles";
import { flushSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { NativeAgentProfileSupport } from "./agentRegistryNative";
import { OllamaContextPreparationError, prepareOllamaContextModel } from "./ollamaModelContext";
import { uniqueProfileId } from "./profileIds";

/** The Add profile dialog's connection choice. */
export type AgentProfileConnection = "default" | "local";

/** Everything the shared Add profile dialog collects before sealing a profile. */
export interface AgentProfileDraft {
  displayName: string;
  connection: AgentProfileConnection;
  /** The provider's existing add-form field (a config/home directory, …). */
  field: string;
  endpoint: string;
  /** On a local profile this is the exact route sent on the wire. */
  model: string;
  /** Original installed model when `model` is a context-derived alias. */
  baseModel?: string;
  /** Chosen Ollama context window before (and after) the alias is prepared. */
  contextLength?: number;
}

export function agentProfileDraftId(
  displayName: string,
  agentInstances: Readonly<Record<string, AgentInstanceConfig>>,
): string {
  return uniqueProfileId(displayName.trim(), agentInstances);
}

/**
 * Build the exact payload the existing profile flow already sends. The agent
 * default branch keeps every provider's current `createPayload` and derived
 * field default; the local branch is provider-owned and only exists when the
 * descriptor declares a route factory.
 */
export function agentProfileDraftPayload(
  support: NativeAgentProfileSupport,
  draft: AgentProfileDraft,
  agentInstances: Readonly<Record<string, AgentInstanceConfig>>,
): CreateProfilePayload {
  const displayName = draft.displayName.trim();
  const id = agentProfileDraftId(displayName, agentInstances);
  if (draft.connection === "local") {
    const local = support.addProfile?.local;
    if (!local) throw new Error("This harness has no local model route.");
    return local.createPayload({
      id,
      displayName,
      endpoint: draft.endpoint.trim(),
      model: draft.model.trim(),
      ...(draft.baseModel ? { baseModel: draft.baseModel.trim() } : {}),
      ...(draft.contextLength !== undefined ? { contextLength: draft.contextLength } : {}),
    });
  }
  const field = support.field?.placeholderFor
    ? draft.field.trim() || support.field.placeholderFor(displayName, id)
    : draft.field.trim();
  return support.createPayload({ id, displayName, field });
}

/**
 * Turns an explicit Ollama context choice into the derived alias on the
 * selected host. The profile itself is only persisted after the host reports
 * its success marker, so a failed preparation never leaves a claimed context.
 */
export async function prepareAgentProfileDraft(input: {
  settingsHost: AgentSettingsHost;
  draft: AgentProfileDraft;
}): Promise<AgentProfileDraft> {
  const { settingsHost, draft } = input;
  if (draft.connection !== "local" || draft.contextLength === undefined) return draft;
  const baseModel = draft.model.trim();
  if (!isValidOllamaInstalledModelId(baseModel)) {
    throw new Error(i18n._(msg`Enter a safe installed Ollama model id.`));
  }
  if (!isOllamaContextLength(draft.contextLength)) {
    throw new Error(i18n._(msg`Choose a supported Ollama context length.`));
  }
  const canOperateTerminal = settingsHost.canOperateTerminal ?? !settingsHost.isRemote;
  const canReadTerminal = settingsHost.canReadTerminal ?? !settingsHost.isRemote;
  const project = settingsHost.machineProject;
  if (
    !settingsHost.isOnline ||
    !settingsHost.canWrite ||
    !canOperateTerminal ||
    !canReadTerminal ||
    !project
  ) {
    throw new OllamaContextPreparationError("terminal-unavailable", baseModel, draft.contextLength);
  }
  const alias = ollamaContextAlias(baseModel, draft.contextLength);
  const preparedAlias = await prepareOllamaContextModel({
    project,
    baseModel,
    alias,
    contextLength: draft.contextLength,
    ...(settingsHost.connectionKey ? { remoteServerId: settingsHost.connectionKey } : {}),
  });
  return {
    ...draft,
    model: preparedAlias,
    baseModel,
    contextLength: draft.contextLength,
  };
}

/**
 * Creates one profile through the selected host, runs the provider hook that
 * must exist before the first detection pass, and flushes local settings so
 * the supervisor's registry rebuild sees the new instance.
 */
export async function createAgentProfile(input: {
  support: NativeAgentProfileSupport;
  settingsHost: AgentSettingsHost;
  agentInstances: Readonly<Record<string, AgentInstanceConfig>>;
  statuses: readonly AgentStatus[];
  draft: AgentProfileDraft;
}): Promise<{
  instance: AgentInstanceConfig;
  kind: string;
  displayName: string;
  flushError?: unknown;
}> {
  const { support, settingsHost } = input;
  const draft = await prepareAgentProfileDraft({ settingsHost, draft: input.draft });
  const displayName = draft.displayName.trim();
  const payload = agentProfileDraftPayload(support, draft, input.agentInstances);
  const instance = await settingsHost.createProfile(payload);
  const kind = agentProfileKind(support.driver, payload.id);
  const onCreated = support.onCreated?.({
    profileKind: kind,
    instance,
    statuses: input.statuses,
    settingsHost,
  });
  if (onCreated) await onCreated;
  if (!settingsHost.isRemote) {
    try {
      await flushSharedSettings();
    } catch (flushError) {
      // The profile already committed on the host. Report this separately so
      // the dialog closes instead of inviting a retry that creates a second
      // profile.
      return { instance, kind, displayName, flushError };
    }
  }
  return { instance, kind, displayName };
}

/** Refreshes the profile inventory on whichever host owns it. */
export function refreshAgentProfiles(
  settingsHost: AgentSettingsHost,
  kind?: string,
): ReturnType<AgentSettingsHost["rediscoverAgents"]> {
  if (settingsHost.isRemote && settingsHost.connectionKey) {
    refreshPairedHostProfilesNow(settingsHost.connectionKey);
  }
  return rediscoverHostAgents(settingsHost, kind);
}
