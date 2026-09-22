import { z } from "zod";
import type { RemoteThreadCommand, Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  canChangeThreadGroup,
  clearThreadGroupFields,
  dissolveGroupMembership,
} from "@/shared/threadGroups";
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
export function updateThreadMetadata(
  args: Record<string, unknown>,
  ctx: AppControlsToolContext,
): unknown {
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
    throw new Error(
      "Pass ungroup to remove this thread from its group, or ungroupAll to dissolve the whole group — not both.",
    );
  }
  if ((parsed.ungroup || parsed.ungroupAll) && !current.groupId) {
    throw new Error(`Thread ${parsed.threadId} is not in a sidebar group.`);
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
  const applied: string[] = [];
  // Persist every mutation before mirroring it to the renderer. The
  // renderer periodically writes a complete dbSyncAll snapshot, so a stale
  // renderer must not be the only owner of an MCP-issued update.
  const rowMutations: Array<(thread: Thread) => Thread> = [];
  const commands: RemoteThreadCommand[] = [];
  const threadId = parsed.threadId;
  const stamp = (): string => new Date().toISOString();
  // Queue one optional metadata mutation and its renderer mirror.
  // Skipped when the field was not provided.
  const applyField = <T>(
    value: T | undefined,
    label: string,
    build: (value: T) => { command: RemoteThreadCommand; mutate: (thread: Thread) => Thread },
  ): void => {
    if (value === undefined) return;
    const { command, mutate } = build(value);
    commands.push(command);
    rowMutations.push(mutate);
    applied.push(label);
  };
  // `applied` follows handler order: rename, group/ungroup, workspace, then
  // done/starred/archived/acknowledge.
  applyField(parsed.rename, "rename", (title) => ({
    command: { kind: "rename", threadId, title },
    mutate: (thread) => ({ ...thread, title }),
  }));
  applyField(parsed.group, "group", (group) => ({
    command: { kind: "set-group", threadId, groupId: group, groupName: group },
    mutate: (thread) => ({ ...thread, groupId: group, groupName: group }),
  }));
  if (parsed.ungroup || parsed.ungroupAll) {
    const result = dissolveGroupMembership(ctx.getThreads(), threadId, {
      all: !!parsed.ungroupAll,
    });
    for (const clearedId of result.clearedIds) {
      if (clearedId === threadId) rowMutations.push(clearThreadGroupFields);
      else ctx.updateThreadRow(clearedId, clearThreadGroupFields);
      commands.push({ kind: "set-group", threadId: clearedId });
    }
    applied.push(parsed.ungroupAll ? "ungroupAll" : "ungroup");
  }
  if (parsed.workspaceId !== undefined) {
    applyField(parsed.workspaceId, "workspace", () => ({
      command: {
        kind: "set-workspace",
        threadId,
        ...(nextWorkspaceId ? { workspaceId: nextWorkspaceId } : {}),
      },
      mutate: (thread) => {
        const cleared = withoutThreadWorkspace(thread);
        return nextWorkspaceId
          ? { ...cleared, workspaceId: nextWorkspaceId, updatedAt: stamp() }
          : { ...cleared, updatedAt: stamp() };
      },
    }));
  }
  applyField(parsed.done, "done", (done) => ({
    command: { kind: "set-done", threadId, done },
    mutate: (thread) =>
      done
        ? { ...thread, done: true, doneAt: stamp(), starred: false }
        : { ...thread, done: false, doneAt: undefined },
  }));
  applyField(parsed.starred, "starred", (starred) => ({
    command: { kind: "set-starred", threadId, starred },
    mutate: (thread) => ({ ...thread, starred }),
  }));
  applyField(parsed.archived, "archived", (archived) => ({
    command: { kind: archived ? "archive" : "unarchive", threadId },
    mutate: (thread) => {
      const now = stamp();
      return {
        ...thread,
        archived,
        archivedAt: archived ? now : undefined,
        updatedAt: now,
      };
    },
  }));
  if (parsed.acknowledge) {
    const command: RemoteThreadCommand = { kind: "acknowledge", threadId };
    commands.push(command);
    // Mirror the renderer/remote-server semantics: acknowledging only clears
    // a finished thread's completion marker (status finished → idle).
    rowMutations.push((thread) =>
      thread.status === "finished" ? { ...thread, status: "idle" } : thread,
    );
    applied.push("acknowledge");
  }
  ctx.updateThreadRow(parsed.threadId, (thread) =>
    rowMutations.reduce((next, mutate) => mutate(next), thread),
  );
  const deliveredToRenderer = commands
    .map((command) => ctx.emitRemoteThreadCommand(command))
    .every(Boolean);
  if (deliveredToRenderer) return { threadId: parsed.threadId, applied };
  return {
    threadId: parsed.threadId,
    applied,
    note: "No Poracode UI is connected; the update was applied directly to the stored thread row.",
  };
}

function withoutThreadWorkspace(thread: Thread): Thread {
  const { workspaceId: _workspaceId, ...rest } = thread;
  return rest;
}
