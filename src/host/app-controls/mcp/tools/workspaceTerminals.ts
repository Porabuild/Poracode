import { randomUUID } from "node:crypto";
import { z } from "zod";
import { startShellPayloadSchema } from "@/shared/contracts";
import {
  WORKSPACE_TERMINAL_CONTROL_VERSION,
  workspaceTerminalActionSchema,
} from "@/shared/contracts/workspaceTerminal";
import { resolveProjectLocation } from "@/shared/worktree";
import { matchesWorkspaceTerminal } from "@/shared/workspaceTerminalScope";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireAppRuntime, requireProject, requireThread, resolveWorktreeInfo } from "./types";

const scopeFields = {
  projectId: z.string().min(1).optional(),
  worktreePath: z.string().min(1).nullable().optional(),
};

export const workspaceTerminalTools = appControlToolDomain(
  defineAppControlTool({
    name: "manage_terminal",
    description:
      "List, start, read, write, resize, or close integrated workspace shells on this host. Omit the target to use the calling thread's exact checkout. Supply projectId to select a project and worktreePath to select a registered worktree. Use worktreePath:null for the project root. The start action creates a live shell and returns its terminalId. Use list to find existing shell IDs. Write sends the exact supplied terminal input, including Enter as a carriage return only when provided. Read returns recent output and cursors. Close reports whether the PTY exited. Obtain the user's authorization before sending commands to or closing their shell.",
    input: z.discriminatedUnion("action", [
      z.strictObject({ ...scopeFields, action: z.literal("list") }),
      startShellPayloadSchema
        .pick({ initialSize: true })
        .extend({ ...scopeFields, action: z.literal("start") })
        .strict(),
      ...workspaceTerminalActionSchema.options.map((command) =>
        command.extend({ ...scopeFields, terminalId: z.string().min(1) }),
      ),
    ]),
    run: async (args, ctx) => {
      const caller =
        args.projectId === undefined && ctx.identity.threadId
          ? requireThread(ctx, ctx.identity.threadId)
          : undefined;
      const projectId = args.projectId ?? caller?.projectId;
      if (!projectId) throw new Error("Supply projectId when calling outside a Poracode thread.");
      const project = requireProject(ctx, projectId);
      const selectedPath =
        args.worktreePath === undefined ? caller?.worktreePath : (args.worktreePath ?? undefined);
      const worktreePath =
        selectedPath && (args.action === "start" || args.worktreePath !== undefined)
          ? (await resolveWorktreeInfo(ctx, project.location, selectedPath)).path
          : selectedPath;
      const scope = {
        projectLocation: resolveProjectLocation(project.location, worktreePath),
        ...(worktreePath ? { worktreePath } : {}),
      };
      if (args.action === "list") {
        const snapshots = await ctx.supervisor.getTerminalShellSnapshots();
        const terminals = snapshots
          .filter((snapshot) => matchesWorkspaceTerminal(snapshot, scope))
          .map(({ terminalId, outputLength }) => ({ terminalId, outputLength }));
        return { count: terminals.length, terminals };
      }
      const owner = requireAppRuntime(ctx);
      if (args.action === "start") {
        const terminalId = `shell:${randomUUID()}`;
        await owner.call("startShell", {
          ...scope,
          shellId: terminalId,
          ...(args.initialSize ? { initialSize: args.initialSize } : {}),
        });
        return { terminalId, projectId, worktreePath: worktreePath ?? null };
      }
      const { projectId: _projectId, worktreePath: _worktreePath, terminalId, ...command } = args;
      const result = await owner.call("controlWorkspaceTerminal", {
        version: WORKSPACE_TERMINAL_CONTROL_VERSION,
        ...scope,
        terminalId,
        command,
      });
      return { terminalId, ...result };
    },
  }),
);
