import { z } from "zod";
import {
  checkpointRevertPayloadSchema,
  DEFAULT_TERMINAL_SIZE,
  editQueuedThreadFollowUpPayloadSchema,
  editQueuedThreadFollowUpPortableSchema,
  getThreadFollowUpQueuePayloadSchema,
  goalItemPayloadSchema,
  invokeThreadSessionActionPayloadSchema,
  invokeThreadSessionActionPortableSchema,
  listThreadSessionActionsPayloadSchema,
  removeQueuedThreadFollowUpPayloadSchema,
  reorderQueuedThreadFollowUpPayloadSchema,
  setPendingSteerPayloadSchema,
  setPendingSteerPortableSchema,
  terminalSizeSchema,
  threadComposerConfigSchema,
  threadGoalControlSchema,
} from "@/shared/contracts";
import { dbGetLatestThreadGoalItem } from "@/host/db";
import { resolveThreadInputSegments } from "@/host/threads/threadInputSegments";
import { resolveProjectLocation } from "@/shared/worktree";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { assertNotSelf, requireAppRuntime, requireProject, requireThread } from "./types";

const threadIdInput = getThreadFollowUpQueuePayloadSchema.strict();
const followUpTarget = removeQueuedThreadFollowUpPayloadSchema;

export const threadRuntimeTools = appControlToolDomain(
  defineAppControlTool({
    name: "thread_follow_ups",
    description:
      "List or manage the ordered follow-ups on a Chat thread. Queue a new prompt, edit or remove an item, move it before another item or to the tail (beforeId: null), steer a pending item immediately, or pause for editing and resume. List first to get item IDs and the edit token stagedAt. This is the same queue shown in the composer.",
    input: z.discriminatedUnion("action", [
      threadIdInput.extend({ action: z.literal("list") }),
      setPendingSteerPortableSchema
        .omit({ clientContext: true })
        .extend({ action: z.literal("enqueue"), config: threadComposerConfigSchema.optional() })
        .strict(),
      editQueuedThreadFollowUpPortableSchema.extend({ action: z.literal("edit") }).strict(),
      followUpTarget.extend({ action: z.literal("remove") }).strict(),
      reorderQueuedThreadFollowUpPayloadSchema.extend({ action: z.literal("reorder") }).strict(),
      followUpTarget.extend({ action: z.literal("steer") }).strict(),
      followUpTarget.extend({ action: z.literal("pause") }).strict(),
      threadIdInput.extend({ action: z.literal("resume") }),
    ]),
    run: async (args, ctx) => {
      const thread = requireThread(ctx, args.threadId);
      const { threadId } = args;
      const owner = requireAppRuntime(ctx);
      switch (args.action) {
        case "list":
          return { threadId, queue: await owner.call("getThreadFollowUpQueue", { threadId }) };
        case "enqueue": {
          const segments = args.segments
            ? await resolveThreadInputSegments(args.segments, args.prompt)
            : undefined;
          await owner.call(
            "queueThreadFollowUp",
            setPendingSteerPayloadSchema.parse({
              threadId,
              prompt: args.prompt,
              config: args.config ?? thread.config,
              ...(segments ? { segments } : {}),
            }),
          );
          break;
        }
        case "edit": {
          const segments = args.segments
            ? await resolveThreadInputSegments(args.segments, args.prompt)
            : undefined;
          await owner.call(
            "editQueuedThreadFollowUp",
            editQueuedThreadFollowUpPayloadSchema.parse({
              ...args,
              ...(segments ? { segments } : {}),
            }),
          );
          break;
        }
        case "remove":
          await owner.call("removeQueuedThreadFollowUp", { threadId, id: args.id });
          break;
        case "reorder":
          await owner.call("reorderQueuedThreadFollowUp", {
            threadId,
            id: args.id,
            beforeId: args.beforeId,
          });
          break;
        case "steer":
          assertNotSelf(ctx, threadId, "steer");
          await owner.call("steerQueuedThreadFollowUp", { threadId, id: args.id });
          break;
        case "pause":
          await owner.call("pauseThreadFollowUps", { threadId, id: args.id });
          break;
        case "resume":
          await owner.call("resumeThreadFollowUps", { threadId });
          break;
      }
      return { threadId, action: args.action, ok: true };
    },
  }),
  defineAppControlTool({
    name: "thread_goal",
    description:
      "Read the latest saved goal in a thread, including the provider's available actions, or edit, pause, resume or clear it through the live provider session. A pause can interrupt a provider's current turn. Use get before changing a goal.",
    input: z.discriminatedUnion("action", [
      threadIdInput.extend({ action: z.literal("get") }),
      threadGoalControlSchema.options[0].extend(threadIdInput.shape).strict(),
      threadGoalControlSchema.options[1].extend(threadIdInput.shape).strict(),
    ]),
    run: async ({ threadId, ...control }, ctx) => {
      requireThread(ctx, threadId);
      if (control.action === "get") {
        const item = await dbGetLatestThreadGoalItem(threadId);
        return {
          threadId,
          goal: item ? { itemId: item.id, ...goalItemPayloadSchema.parse(item.payload) } : null,
        };
      }
      if (control.action === "pause") assertNotSelf(ctx, threadId, "pause");
      await requireAppRuntime(ctx).call("controlThreadGoal", { threadId, ...control });
      return { threadId, action: control.action, ok: true };
    },
  }),
  defineAppControlTool({
    name: "reopen_thread",
    description:
      "Ensure an existing thread is running without sending a message. The owning host resumes the saved configuration and checkout, or keeps the existing live session.",
    input: threadIdInput.extend({ initialSize: terminalSizeSchema.optional() }),
    run: ({ threadId, initialSize }, ctx) => {
      requireThread(ctx, threadId);
      if (!ctx.reopenThread) throw new Error("This host cannot reopen threads.");
      return ctx.reopenThread(threadId, initialSize ?? DEFAULT_TERMINAL_SIZE);
    },
  }),
  defineAppControlTool({
    name: "list_thread_checkpoints",
    description:
      "List file checkpoints and their conversation turns for a thread. Use a checkpoint's message item ID with restore_thread_checkpoint.",
    input: threadIdInput,
    run: ({ threadId }, ctx) => {
      const thread = requireThread(ctx, threadId);
      const project = requireProject(ctx, thread.projectId);
      return requireAppRuntime(ctx).call("listFileCheckpoints", {
        threadId,
        projectLocation: resolveProjectLocation(project.location, thread.worktreePath),
      });
    },
  }),
  defineAppControlTool({
    name: "restore_thread_checkpoint",
    description:
      "Restore a thread to a listed checkpoint, reverting its files and conversation together. Obtain the user's authorization before discarding later work. Reuse the same operationKey to retry this exact checkpoint restore.",
    input: checkpointRevertPayloadSchema.strict(),
    run: (args, ctx) => {
      assertNotSelf(ctx, args.threadId, "restore a checkpoint in");
      requireThread(ctx, args.threadId);
      if (!ctx.revertCheckpoint) throw new Error("This host cannot restore thread checkpoints.");
      return ctx.revertCheckpoint(args);
    },
  }),
  defineAppControlTool({
    name: "thread_background_tasks",
    description: "Inspect the background work reported by a thread's live runtime.",
    input: threadIdInput,
    run: ({ threadId }, ctx) => {
      requireThread(ctx, threadId);
      return requireAppRuntime(ctx).call("readThreadBackgroundTasks", { threadId });
    },
  }),
  defineAppControlTool({
    name: "thread_session_actions",
    description:
      "List the live provider's session actions for a thread or invoke one with its actionId and a bounded JSON payload. Inspect the advertised actions before invoking one.",
    input: z.discriminatedUnion("action", [
      listThreadSessionActionsPayloadSchema.extend({ action: z.literal("list") }).strict(),
      invokeThreadSessionActionPortableSchema.extend({ action: z.literal("invoke") }).strict(),
    ]),
    run: ({ action, ...args }, ctx) => {
      requireThread(ctx, args.threadId);
      if (action === "list")
        return requireAppRuntime(ctx).call("listThreadSessionActions", { threadId: args.threadId });
      assertNotSelf(ctx, args.threadId, "invoke a session action in");
      return requireAppRuntime(ctx).call(
        "invokeThreadSessionAction",
        invokeThreadSessionActionPayloadSchema.parse(args),
      );
    },
  }),
);
