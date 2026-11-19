import type {
  AppThreadTransferRequest,
  AppThreadTransferResult,
} from "@/shared/contracts/appThreadTransfer";
import { capabilitiesForPresentation, validateAgentModelSelection } from "@/shared/agentSelection";
import { useAppStore } from "@/renderer/state/appStore";
import { entityHost, hostHandle } from "@/renderer/state/entityHost";
import { getProjectGroupIndex } from "@/renderer/state/projectGroups/useProjectGroups";
import {
  loadThreadTransferPreview,
  moveThreadToHost,
  transferCandidateMembers,
  transferTargetForMember,
} from "./threadTransferActions";

/** Use the client's existing paired connections. The backend never receives their grants. */
export async function runAppThreadTransfer(
  { input, ids, reconcile }: AppThreadTransferRequest,
  begin: () => Promise<void>,
): Promise<AppThreadTransferResult> {
  if (reconcile) {
    if (input.action !== "move" || !ids) throw new Error("Invalid transfer recovery request.");
    return readCommittedTransfer(input, ids, begin);
  }
  const thread = useAppStore.getState().threads.find((entry) => entry.id === input.threadId);
  const source = thread && entityHost(thread);
  if (!thread || !source || source.kind !== "managed") {
    throw new Error("The thread is not available on this desktop's owning host.");
  }
  const members = getProjectGroupIndex().groupByProjectId.get(thread.projectId)?.members ?? [];
  const destinations = transferCandidateMembers(thread, members).flatMap((member) => {
    const resolved = transferTargetForMember(member);
    return resolved ? [{ member, ...resolved }] : [];
  });
  if (input.action === "destinations") {
    await begin();
    return {
      action: input.action,
      destinations: destinations.map(({ member, target }) => ({
        destinationProjectId: member.id,
        projectName: member.name,
        hostLabel: target.label,
        online: target.online,
      })),
    };
  }
  const selected = destinations.find(({ member }) => member.id === input.destinationProjectId);
  if (!selected?.target.online) {
    throw new Error("Choose an online destination from the thread's paired projects.");
  }
  const { target, hostProjectId } = selected;
  const destination = hostHandle(target.key);
  const preview = await loadThreadTransferPreview(thread, target, hostProjectId);
  if (!source.isCurrent() || !destination?.isCurrent()) {
    throw new Error("A paired connection changed during the transfer preview.");
  }
  if (input.action === "preview") {
    await begin();
    return {
      action: input.action,
      source: preview.source,
      ...(preview.project ? { project: preview.project } : {}),
      agents: preview.agents.map(({ kind, label, capabilities }) => ({
        kind,
        label,
        capabilities,
      })),
      sourceAgentReady: preview.sourceAgentReady,
    };
  }
  if (!ids) throw new Error("The owning host did not assign transfer identities.");
  if (!preview.project) throw new Error("The paired project is no longer available.");
  if (input.agent) {
    const { kind, config } = input.agent;
    const status = preview.agents.find((agent) => agent.kind === kind);
    if (!status) throw new Error("Choose a Chat provider from the destination preview.");
    const invalidSelection = validateAgentModelSelection(
      capabilitiesForPresentation(status.capabilities, "gui"),
      {
        model: config.model,
        ...(config.effort !== undefined ? { reasoning: config.effort } : {}),
        ...(config.fast !== undefined ? { fast: config.fast } : {}),
      },
    );
    if (invalidSelection) throw new Error(invalidSelection);
  }
  if (preview.source.blocker && !(preview.source.blocker === "busy" && input.stopFirst)) {
    throw new Error(`The source cannot be moved right now (${preview.source.blocker}).`);
  }
  await begin();
  if (!source.isCurrent() || !destination?.isCurrent()) {
    throw new Error("A paired connection changed before the transfer began.");
  }
  const result = await moveThreadToHost({
    thread,
    target,
    projectId: hostProjectId,
    transferIds: ids,
    withoutNavigation: true,
    ...(input.agent ? { agent: input.agent } : {}),
    ...(input.continuePrompt !== undefined ? { continuePrompt: input.continuePrompt } : {}),
    stopFirst: input.stopFirst,
  });
  return {
    action: input.action,
    // The destination's raw id is portable to tools on that host.
    threadId: ids.targetThreadId,
    destinationProjectId: input.destinationProjectId,
    targetLabel: result.targetLabel,
    ...(result.branch ? { branch: result.branch } : {}),
    branchRenamed: result.branchRenamed,
    sourceArchived: false,
    continueFailed: result.continueFailed,
  };
}

/** Recovery only observes the addressed target. It never packages or uploads again. */
async function readCommittedTransfer(
  input: Extract<AppThreadTransferRequest["input"], { action: "move" }>,
  ids: NonNullable<AppThreadTransferRequest["ids"]>,
  begin: () => Promise<void>,
): Promise<AppThreadTransferResult> {
  const project = useAppStore
    .getState()
    .projects.find((member) => member.id === input.destinationProjectId);
  const selected = project && transferTargetForMember(project);
  const destination = selected && hostHandle(selected.target.key);
  if (!selected?.target.online || !destination || destination.kind !== "paired") {
    throw new Error("The original paired destination is unavailable.");
  }
  const snapshot = await destination.withClient((client) => {
    if (!destination.isCurrent()) throw new Error("The destination pairing changed.");
    return client.threadHistory(ids.targetThreadId, {
      targetTimelineEntryCount: 1,
      omitScrollback: true,
      noticesCapable: true,
    });
  });
  const { thread } = snapshot;
  const lineage = thread?.forkedFrom;
  if (
    !destination.isCurrent() ||
    thread?.id !== ids.targetThreadId ||
    thread.projectId !== selected.hostProjectId ||
    lineage?.threadId !== input.threadId ||
    lineage.transfer?.transferId !== ids.transferId ||
    lineage.transfer?.sourceHostId !== ids.sourceHostId
  ) {
    throw new Error("The destination did not confirm the saved transfer.");
  }
  await begin();
  if (!destination.isCurrent()) throw new Error("The destination pairing changed.");
  return {
    action: "move",
    threadId: thread.id,
    destinationProjectId: input.destinationProjectId,
    targetLabel: selected.target.label,
    ...(thread.worktreeBranch ? { branch: thread.worktreeBranch } : {}),
    sourceArchived: false,
    recovered: true,
  };
}
