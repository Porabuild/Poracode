import { z } from "zod";
import {
  ghListWorkflowsPayloadSchema,
  ghListWorkflowRunsPayloadSchema,
  ghGetWorkflowRunPayloadSchema,
  ghGetWorkflowDefinitionPayloadSchema,
  ghDispatchWorkflowPayloadSchema,
  ghRerunWorkflowRunPayloadSchema,
  ghCancelWorkflowRunPayloadSchema,
  ghDeleteWorkflowRunPayloadSchema,
} from "@/shared/contracts";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireAppRuntime, requireProject, resolveLocation } from "./types";

const target = {
  projectId: z.string().min(1),
  worktreePath: z.string().min(1).optional(),
};

export const githubActionsTools = appControlToolDomain(
  defineAppControlTool({
    name: "github_actions",
    description:
      "List GitHub Actions workflows or runs, inspect a run or workflow definition, dispatch a workflow, rerun, cancel, or delete a run. The owning project provides the repository and default account. Run-changing actions require the user's authorization.",
    input: z.discriminatedUnion("action", [
      ghListWorkflowsPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("list_workflows") })
        .strict(),
      ghListWorkflowRunsPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("list_runs") })
        .strict(),
      ghGetWorkflowRunPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("get_run") })
        .strict(),
      ghGetWorkflowDefinitionPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("get_definition") })
        .strict(),
      ghDispatchWorkflowPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("dispatch") })
        .strict(),
      ghRerunWorkflowRunPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("rerun") })
        .strict(),
      ghCancelWorkflowRunPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("cancel") })
        .strict(),
      ghDeleteWorkflowRunPayloadSchema
        .omit({ projectLocation: true })
        .extend({ ...target, action: z.literal("delete") })
        .strict(),
    ]),
    run: async (args, ctx) => {
      const { projectId, worktreePath } = args;
      const projectLocation = await resolveLocation(ctx, projectId, worktreePath);
      const ghAccount = args.ghAccount ?? requireProject(ctx, projectId).ghAccount;
      const scope = { projectLocation, ...(ghAccount ? { ghAccount } : {}) };
      const owner = requireAppRuntime(ctx);
      switch (args.action) {
        case "list_workflows":
          return owner.call("ghListWorkflows", scope);
        case "list_runs":
          return owner.call("ghListWorkflowRuns", {
            ...scope,
            ...(args.workflowId !== undefined ? { workflowId: args.workflowId } : {}),
          });
        case "get_run":
          return owner.call("ghGetWorkflowRun", { ...scope, runId: args.runId });
        case "get_definition":
          return owner.call("ghGetWorkflowDefinition", {
            ...scope,
            workflowId: args.workflowId,
            ...(args.ref !== undefined ? { ref: args.ref } : {}),
          });
        case "dispatch":
          await owner.call("ghDispatchWorkflow", {
            ...scope,
            workflowId: args.workflowId,
            inputs: args.inputs,
            ...(args.ref !== undefined ? { ref: args.ref } : {}),
          });
          break;
        case "rerun":
          await owner.call("ghRerunWorkflowRun", {
            ...scope,
            runId: args.runId,
            failedOnly: args.failedOnly,
          });
          break;
        case "cancel":
          await owner.call("ghCancelWorkflowRun", { ...scope, runId: args.runId });
          break;
        case "delete":
          await owner.call("ghDeleteWorkflowRun", { ...scope, runId: args.runId });
          break;
      }
      return { projectId, action: args.action, ok: true };
    },
  }),
);
