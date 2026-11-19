import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  DEFAULT_TERMINAL_SIZE,
  type Project,
  type RemoteThreadCommand,
  type Thread,
} from "@/shared/contracts";
import type { ThreadHandoffInput, ThreadHandoffResult } from "@/shared/contracts/threadHandoff";
import {
  buildForkMentionLaunchInput,
  buildHandoffLaunchInput,
} from "@/shared/providerHandoffLaunch";
import { ThreadLaunchFailedRefusalError } from "@/shared/threadLaunchRefusal";
import { WorkspaceLaunchUnavailableError } from "@/shared/threadWorkspaceRefusal";
import { resolveProjectLocation } from "@/shared/worktree";
import {
  dbAssertNoRunningCheckpointRevert,
  dbDeleteThread,
  dbGetProject,
  dbGetThread,
  dbSetThreadGroup,
  dbUpdateThreadMetadata,
} from "@/host/db";
import {
  retainThreadAttachmentDirectory,
  saveUploadedAttachmentFile,
} from "@/host/attachments/attachmentStorage";
import { dbGetUnresolvedThreadWorkspaceGrantOperation } from "@/host/db/threadWorkspaceGrants";
import { hasSameProjectExecutionScope } from "@/host/threads/projectExecutionScope";
import { assertRemoteThreadStartExperimentSafe } from "../experimentOwnership";
import type { RemoteServerContext } from "./context";
import { commandOutcomeUncertainAfterEffect, runRemoteCommand } from "./remoteCommandIdempotency";
import { startPersistedThread } from "./threadCommands";
import { prepareHandoffContext } from "./threadHandoffContext";
import { applyThreadMetadataCommand } from "./threadMetadataCommands";
import { applyRemoteThreadSwitch, isPlainThreadStartPreEffectFailure } from "./threadSwitch";

function requireSource(threadId: string): { source: Thread; project: Project } {
  const source = dbGetThread(threadId);
  if (!source || source.archived || source.status === "launching") {
    throw new Error("Choose a saved, non-archived thread that has finished starting.");
  }
  const project = dbGetProject(source.projectId);
  if (!project) throw new Error("The source project no longer exists.");
  assertRemoteThreadStartExperimentSafe(threadId);
  dbAssertNoRunningCheckpointRevert([threadId]);
  if (dbGetUnresolvedThreadWorkspaceGrantOperation(threadId)) {
    throw new Error("Reconcile the thread's pending workspace access change before continuing.");
  }
  return { source, project };
}

export function handoffHostThread(
  ctx: RemoteServerContext,
  attachmentsDir: string,
  input: ThreadHandoffInput,
): Promise<ThreadHandoffResult> {
  const runThreadMutation = ctx.options.runThreadMutation;
  if (!runThreadMutation) throw new Error("The owning host cannot coordinate provider handoffs.");
  const { sourceThreadId, operationKey, agentKind, agentInstanceId, presentationMode } = input;
  let confirmedNoNewThread = false;
  return runRemoteCommand({
    commandId: `app-controls:handoff-thread:${operationKey}`,
    route: "app-controls:handoff_thread",
    principalId: "app-controls",
    requestPayload: input,
    isPreEffectFailure: () => confirmedNoNewThread,
    operation: async (markDispatched) => {
      const { source, project } = requireSource(sourceThreadId);
      if (agentKind === source.agentKind) throw new Error("Choose a different provider.");
      const controlIsCurrent = ctx.options.captureThreadControlState?.(sourceThreadId, 0);
      const assertCheckoutCurrent = () => {
        const current = dbGetThread(sourceThreadId);
        const currentProject = current?.projectId === project.id ? dbGetProject(project.id) : null;
        if (
          !current ||
          current.createdAt !== source.createdAt ||
          current.archived ||
          current.worktreePath !== source.worktreePath ||
          !currentProject ||
          !hasSameProjectExecutionScope(currentProject, project) ||
          (controlIsCurrent && !controlIsCurrent())
        ) {
          throw new Error("The source thread or checkout changed during the handoff.");
        }
      };
      const admitSource = () => {
        assertCheckoutCurrent();
        const { source: current } = requireSource(sourceThreadId);
        if (
          current.agentKind !== source.agentKind ||
          current.agentInstanceId !== source.agentInstanceId ||
          current.presentationMode !== source.presentationMode ||
          !isDeepStrictEqual(current.sessionRef, source.sessionRef)
        ) {
          throw new Error("The source session changed during the handoff.");
        }
      };

      const { inPlace, config, context, strategy, extracted, prompt, promptSegments } =
        await prepareHandoffContext(ctx, input, source, project, admitSource);
      const mode = inPlace ? "in_place" : input.intent === "fork" ? "fork" : "replacement";
      const threadId = inPlace ? sourceThreadId : randomUUID();

      admitSource();
      const release = extracted ? retainThreadAttachmentDirectory(threadId) : undefined;
      try {
        const readsSource = mode === "fork" && strategy === "thread-transcript";
        const launch = readsSource
          ? buildForkMentionLaunchInput({ sourceThread: source, prompt, segments: promptSegments })
          : await buildHandoffLaunchInput({
              threadId,
              prompt,
              segments: promptSegments,
              extractedContext: extracted,
              saveContext: ({ content }) =>
                saveUploadedAttachmentFile(
                  { attachmentsDir },
                  { threadId, fileName: "handoff-context.md", data: Buffer.from(content) },
                ),
            });
        const common = {
          threadId,
          agentKind,
          ...(agentInstanceId !== undefined ? { agentInstanceId } : {}),
          config,
          prompt: launch.prompt,
          ...(launch.segments ? { segments: launch.segments } : {}),
          presentationMode,
          initialSize: input.initialSize ?? DEFAULT_TERMINAL_SIZE,
        };
        if (inPlace) {
          await applyRemoteThreadSwitch(
            ctx,
            {
              ...common,
              projectLocation: resolveProjectLocation(project.location, source.worktreePath),
              providerSwitch: {
                fromAgentKind: source.agentKind,
                handoffItemId: `handoff-${randomUUID()}`,
                contextStrategy: strategy,
              },
            },
            markDispatched,
            { admit: admitSource, assertCheckoutCurrent },
          );
          return { threadId, sourceThreadId, mode, context, sourceDisposition: "continued" };
        }

        return await runThreadMutation(sourceThreadId, async () => {
          admitSource();
          const current = dbGetThread(sourceThreadId)!;
          const groupId = mode === "fork" ? (current.groupId ?? randomUUID()) : undefined;
          const groupName = groupId ? (current.groupName ?? current.title) : undefined;
          const title =
            mode === "fork" && !current.title.endsWith(" (fork)")
              ? `${current.title} (fork)`
              : current.title;
          const command = {
            ...common,
            kind: "start",
            projectId: project.id,
            title,
            focus: false,
            ...(current.worktreePath ? { worktreePath: current.worktreePath } : {}),
            ...(current.worktreeBranch ? { worktreeBranch: current.worktreeBranch } : {}),
            ...(current.workspaceId ? { workspaceId: current.workspaceId } : {}),
            ...(groupId ? { groupId, groupName } : {}),
          } satisfies RemoteThreadCommand;
          markDispatched();
          let refusedBeforeLaunch = false;
          const admitLaunch = () => {
            try {
              admitSource();
            } catch (error) {
              refusedBeforeLaunch = true;
              throw error;
            }
          };
          try {
            await startPersistedThread(ctx.options, command, admitLaunch, (payload) =>
              ctx.options.callSupervisor(
                "startThread",
                { ...payload, ...(readsSource ? { mentionHandoff: true } : {}) },
                { assertLaunchCurrent: admitLaunch },
              ),
            );
          } catch (error) {
            const targetRow = dbGetThread(threadId);
            const definite =
              refusedBeforeLaunch ||
              error instanceof WorkspaceLaunchUnavailableError ||
              isPlainThreadStartPreEffectFailure(error);
            if (definite && (!targetRow || targetRow.status === "launching")) {
              if (targetRow) dbDeleteThread(threadId);
              confirmedNoNewThread = true;
            }
            try {
              ctx.publishThreadsChanged([threadId]);
            } catch (publishError) {
              console.warn(
                "[app-controls] handoff launch outcome publication failed:",
                publishError,
              );
            }
            if (confirmedNoNewThread) {
              if (isPlainThreadStartPreEffectFailure(error)) throw error;
              throw new ThreadLaunchFailedRefusalError(
                error instanceof Error ? error.message : "The target launch was refused.",
              );
            }
            throw commandOutcomeUncertainAfterEffect(
              new Error(`Inspect target thread ${threadId} before launching again.`, {
                cause: error,
              }),
            );
          }
          let sourceDisposition: ThreadHandoffResult["sourceDisposition"] = "open";
          try {
            const latestSource = dbGetThread(sourceThreadId);
            if (
              groupId &&
              groupName &&
              !current.groupId &&
              latestSource?.createdAt === current.createdAt &&
              !latestSource.archived &&
              !latestSource.groupId
            ) {
              dbSetThreadGroup(sourceThreadId, groupId, groupName);
            } else if (mode === "replacement") {
              admitSource();
              const { confirmed } = await ctx.options.callSupervisor("closeThreadConfirmed", {
                threadId: sourceThreadId,
              });
              if (confirmed) {
                const done = { kind: "set-done", threadId: sourceThreadId, done: true } as const;
                if (
                  dbUpdateThreadMetadata(sourceThreadId, (thread) =>
                    applyThreadMetadataCommand(thread, done),
                  )
                ) {
                  sourceDisposition = "done";
                }
              }
            }
          } catch (error) {
            console.warn(
              "[app-controls] continued thread started but source update failed:",
              error,
            );
          }
          try {
            ctx.publishThreadsChanged([sourceThreadId, threadId]);
            await ctx.options.dispatchThreadCommand?.({ ...command, launchRuntime: false });
          } catch (error) {
            console.warn(
              "[app-controls] provider handoff committed but publication failed:",
              error,
            );
          }
          return { threadId, sourceThreadId, mode, context, sourceDisposition };
        });
      } finally {
        release?.();
      }
    },
  });
}
