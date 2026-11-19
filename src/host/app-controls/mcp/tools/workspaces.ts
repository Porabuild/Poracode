import { z } from "zod";
import { nextWorkspaceIconId, WORKSPACE_ICON_IDS, workspaceIconIdSchema } from "@/shared/contracts";
import type { ToolDomain } from "./types";
import {
  createWorkspaceRecord,
  getWorkspaces,
  editWorkspaces,
  resolveWorkspace,
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

const removeArgsSchema = z.strictObject({ workspaceId: z.string().min(1) });

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
    {
      name: "remove_workspace",
      description:
        "Remove a workspace grouping by exact id from list_workspaces. Its projects and Home threads remain available as unfiled items. The last workspace cannot be removed. Requires explicit user authorization.",
      inputSchema: z.toJSONSchema(removeArgsSchema, { io: "input" }),
    },
  ],
  handlers: {
    list_workspaces: (_args, ctx) => {
      const workspaces = getWorkspaces(ctx).map((workspace) => workspaceView(workspace, ctx));
      return { count: workspaces.length, workspaces };
    },
    create_workspace: async (args, ctx) => {
      const { name, icon } = createArgsSchema.parse(args);
      const created = createWorkspaceRecord(getWorkspaces(ctx), name, icon);
      await editWorkspaces(ctx, (current) => [
        ...current,
        { ...created, icon: icon ?? nextWorkspaceIconId(current) },
      ]);
      const workspace = resolveWorkspace(getWorkspaces(ctx), created.id);
      return { created: true, workspace: workspaceView(workspace, ctx) };
    },
    update_workspace: async (args, ctx) => {
      const { workspaceId, name, icon } = updateArgsSchema.parse(args);
      if (name === undefined && icon === undefined) {
        throw new Error("Provide at least one field to update (name or icon).");
      }
      const id = resolveWorkspace(getWorkspaces(ctx), workspaceId).id;
      await editWorkspaces(ctx, (current) => {
        if (!current.some((entry) => entry.id === id)) throw new Error("Workspace was removed.");
        return current.map((workspace) =>
          workspace.id !== id
            ? workspace
            : {
                ...workspace,
                ...(name !== undefined ? { name } : {}),
                ...(icon !== undefined ? { icon } : {}),
              },
        );
      });
      return {
        updated: true,
        workspace: workspaceView(resolveWorkspace(getWorkspaces(ctx), id), ctx),
      };
    },
    remove_workspace: async (args, ctx) => {
      const { workspaceId } = removeArgsSchema.parse(args);
      await editWorkspaces(ctx, (current) => {
        if (!current.some((workspace) => workspace.id === workspaceId))
          throw new Error("Workspace not found. Pass the exact id from list_workspaces.");
        if (current.length <= 1) throw new Error("Cannot remove the last workspace.");
        return current.filter((workspace) => workspace.id !== workspaceId);
      });
      return { removed: true, workspaceId };
    },
  },
};
