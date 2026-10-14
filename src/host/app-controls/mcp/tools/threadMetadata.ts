import { z } from "zod";
import type { RemoteThreadCommand, Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  canChangeThreadGroup,
  clearThreadGroupFields,
  dissolveGroupMembership,
} from "@/shared/threadGroups";
import {
  applyThreadMetadataCommand,
  threadMetadataClosesSession,
  type ThreadMetadataCommand,
} from "@/host/remote/server/threadMetadataCommands";
import { requireThread, type AppControlsToolContext } from "./types";
import { requireWorkspace } from "./workspaceLookup";

const updateArgsSchema = z.object({
  threadId: z.string().min(1),
  rename: z.string().trim().min(1).max(200).optional(),
  group: z.string().trim().min(1).max(200).optional(),
  ungroup: z.boolean().optional(),
  ungroupAll: z.boolean().optional(),
  workspaceId: z.union([z.string().trim().min(1), z.null()]).optional(),
  done: z.boolean().optional(),
  starred: z.boolean().optional(),
  archived: z.boolean().optional(),
  acknowledge: z.boolean().optional(),
});

function mirrorCommittedCommand(
  ctx: AppControlsToolContext,
  command: RemoteThreadCommand,
): boolean | undefined {
  try {
    const delivery = ctx.emitRemoteThreadCommand(command);
    if (typeof delivery === "boolean") return delivery;
    void delivery.then(
      () => undefined,
      (error: unknown) => ctx.reportError?.(error),
    );
  } catch (error) {
    ctx.reportError?.(error);
  }
  return undefined;
}

/**
 * The host owns the durable mutation and lifecycle effect. Renderer delivery
 * is a best-effort mirror after commit, including on a headless host.
 */
export async function updateThreadMetadata(
  args: Record<string, unknown>,
  ctx: AppControlsToolContext,
): Promise<unknown> {
  const parsed = updateArgsSchema.parse(args);
  const current = requireThread(ctx, parsed.threadId);
  if (
    parsed.rename === undefined &&
    parsed.group === undefined &&
    !parsed.ungroup &&
    !parsed.ungroupAll &&
    parsed.workspaceId === undefined &&
    parsed.done === undefined &&
    parsed.starred === undefined &&
    parsed.archived === undefined &&
    !parsed.acknowledge
  ) {
    throw new Error("Provide at least one field to update.");
  }
  if (parsed.group !== undefined && (parsed.ungroup || parsed.ungroupAll)) {
    throw new Error(
      "Pass group to assign a sidebar group, or ungroup/ungroupAll to remove one — not both.",
    );
  }
  if (parsed.ungroup && parsed.ungroupAll) {
    throw new Error("Pass ungroup or ungroupAll, not both.");
  }
  if ((parsed.ungroup || parsed.ungroupAll) && !current.groupId) {
    throw new Error("Thread is not in a sidebar group.");
  }
  if (
    (parsed.group !== undefined || parsed.ungroup || parsed.ungroupAll) &&
    !canChangeThreadGroup(current.groupId, parsed.group, ctx.isExperimentGroup)
  ) {
    throw new Error(
      "Experiment candidates can only be changed from the desktop experiment controls.",
    );
  }

  let nextWorkspaceId: string | undefined;
  if (parsed.workspaceId !== undefined) {
    if (!isHomeProjectId(current.projectId)) {
      throw new Error(
        "workspaceId on update_thread only applies to Home threads. File a project with update_project instead.",
      );
    }
    nextWorkspaceId =
      parsed.workspaceId === null ? undefined : requireWorkspace(ctx, parsed.workspaceId).id;
  }

  const threadId = parsed.threadId;
  const applied: string[] = [];
  const commands: RemoteThreadCommand[] = [];
  const mutations: Array<(thread: Thread) => Thread> = [];
  const siblingMutations: Array<{ threadId: string; mutate: (thread: Thread) => Thread }> = [];
  const changedIds = new Set<string>([threadId]);
  const stamp = new Date().toISOString();
  const addMetadata = (label: string, command: ThreadMetadataCommand): void => {
    commands.push(command);
    mutations.push((thread) => applyThreadMetadataCommand(thread, command, stamp));
    applied.push(label);
  };

  if (parsed.rename !== undefined) {
    addMetadata("rename", { kind: "rename", threadId, title: parsed.rename });
  }
  if (parsed.group !== undefined) {
    addMetadata("group", {
      kind: "set-group",
      threadId,
      groupId: parsed.group,
      groupName: parsed.group,
    });
  }
  if (parsed.ungroup || parsed.ungroupAll) {
    const result = dissolveGroupMembership(ctx.getThreads(), threadId, {
      all: !!parsed.ungroupAll,
    });
    for (const clearedId of result.clearedIds) {
      if (clearedId === threadId) mutations.push(clearThreadGroupFields);
      else siblingMutations.push({ threadId: clearedId, mutate: clearThreadGroupFields });
      commands.push({ kind: "set-group", threadId: clearedId });
      changedIds.add(clearedId);
    }
    applied.push(parsed.ungroupAll ? "ungroupAll" : "ungroup");
  }
  if (parsed.workspaceId !== undefined) {
    commands.push({
      kind: "set-workspace",
      threadId,
      workspaceId: nextWorkspaceId ?? null,
    });
    mutations.push((thread) => {
      const { workspaceId: _oldWorkspaceId, ...rest } = thread;
      return nextWorkspaceId
        ? { ...rest, workspaceId: nextWorkspaceId, updatedAt: stamp }
        : { ...rest, updatedAt: stamp };
    });
    applied.push("workspace");
  }
  if (parsed.done !== undefined) {
    addMetadata("done", { kind: "set-done", threadId, done: parsed.done });
  }
  if (parsed.starred !== undefined) {
    addMetadata("starred", { kind: "set-starred", threadId, starred: parsed.starred });
  }
  if (parsed.archived !== undefined) {
    addMetadata(
      "archived",
      parsed.archived ? { kind: "archive", threadId } : { kind: "unarchive", threadId },
    );
  }
  if (parsed.acknowledge) {
    addMetadata("acknowledge", { kind: "acknowledge", threadId });
  }

  // A done/archive update ends the live run even when no renderer is present.
  if (
    commands.some((command) =>
      command.kind === "set-done" || command.kind === "archive"
        ? threadMetadataClosesSession(command)
        : false,
    )
  ) {
    await ctx.supervisor.closeThread({ threadId }).catch(() => undefined);
  }

  for (const sibling of siblingMutations) {
    ctx.updateThreadRow(sibling.threadId, sibling.mutate);
  }
  ctx.updateThreadRow(threadId, (thread) =>
    mutations.reduce((next, mutate) => mutate(next), thread),
  );
  ctx.publishThreadsChanged?.([...changedIds]);

  let sawNoRenderer = false;
  for (const command of commands) {
    if (mirrorCommittedCommand(ctx, command) === false) sawNoRenderer = true;
  }
  if (sawNoRenderer) {
    return {
      threadId,
      applied,
      note: "No Poracode UI is connected; the update was applied directly to the stored thread row.",
    };
  }
  return { threadId, applied };
}
