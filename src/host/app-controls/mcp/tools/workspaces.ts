import { z } from "zod";
import { WORKSPACE_ICON_IDS, workspaceIconIdSchema } from "@/shared/contracts";
import type { ToolDomain } from "./types";
import {
  createWorkspaceRecord,
  getWorkspaces,
  persistWorkspaces,
  requireWorkspace,
  workspaceView,
} from "./workspaceLookup";

const createArgsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  icon: workspaceIconIdSchema.optional(),
});
const updateArgsSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  icon: workspaceIconIdSchema.optional(),
});

const workspaceIdProp = { type: "string", minLength: 1 };
const workspaceIconProp = { type: "string", enum: [...WORKSPACE_ICON_IDS] };

export const workspaceTools: ToolDomain = {
  specs: [
    {
      name: "list_workspaces",
      description:
        "List the user's workspaces (sidebar groupings of projects and Home threads) with id, name, icon, and counts. Projects and Home threads with no workspaceId, or one that no longer exists, stay visible in every workspace. Distinct from git worktrees.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "create_workspace",
      description:
        "Create a workspace the user can file projects and Home threads into. Returns the new workspace's id. Explain this to the user before creating it.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          icon: workspaceIconProp,
        },
      },
    },
    {
      name: "update_workspace",
      description:
        "Rename a workspace or change its icon. workspaceId accepts an id or a unique workspace name from list_workspaces.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["workspaceId"],
        properties: {
          workspaceId: workspaceIdProp,
          name: { type: "string", minLength: 1, maxLength: 120 },
          icon: workspaceIconProp,
        },
      },
    },
  ],
  handlers: {
    list_workspaces: (_args, ctx) => {
      const workspaces = getWorkspaces(ctx).map((workspace) => workspaceView(workspace, ctx));
      return { count: workspaces.length, workspaces };
    },
    create_workspace: (args, ctx) => {
      const { name, icon } = createArgsSchema.parse(args);
      const current = getWorkspaces(ctx);
      const created = createWorkspaceRecord(current, name, icon);
      const workspaces = persistWorkspaces(ctx, [...current, created]);
      const workspace = workspaces.find((entry) => entry.id === created.id) ?? created;
      return { created: true, workspace: workspaceView(workspace, ctx) };
    },
    update_workspace: (args, ctx) => {
      const parsed = updateArgsSchema.parse(args);
      if (parsed.name === undefined && parsed.icon === undefined) {
        throw new Error("Provide at least one field to update (name or icon).");
      }
      const current = getWorkspaces(ctx);
      const target = requireWorkspace(ctx, parsed.workspaceId);
      const next = current.map((workspace) => {
        if (workspace.id !== target.id) return workspace;
        return {
          ...workspace,
          ...(parsed.name ? { name: parsed.name } : {}),
          ...(parsed.icon ? { icon: parsed.icon } : {}),
        };
      });
      const workspaces = persistWorkspaces(ctx, next);
      const workspace = workspaces.find((entry) => entry.id === target.id) ?? target;
      return { updated: true, workspace: workspaceView(workspace, ctx) };
    },
  },
};
