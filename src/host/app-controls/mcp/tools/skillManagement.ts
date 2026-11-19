import { z } from "zod";
import {
  importSkillPayloadSchema,
  installMarketplaceSkillPayloadSchema,
  listSkillMarketplacePayloadSchema,
} from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { requireProject, type AppControlsToolContext, type ToolDomain } from "./types";

const projectIdSchema = z.string().min(1).optional();
const listArgs = listSkillMarketplacePayloadSchema
  .extend({ limit: z.number().int().min(1).max(100).default(40) })
  .strict();
const installArgs = installMarketplaceSkillPayloadSchema
  .omit({ projectLocation: true, wslDistro: true })
  .extend({ projectId: projectIdSchema })
  .strict();
const importArgs = importSkillPayloadSchema
  .omit({
    projectLocation: true,
    wslDistro: true,
    sourceProjectLocation: true,
    sourceWslDistro: true,
  })
  .extend({ projectId: projectIdSchema, sourceProjectId: projectIdSchema })
  .strict();
const removeArgs = z.strictObject({ skillId: z.string().min(1), projectId: projectIdSchema });

function skillProjectScope(ctx: AppControlsToolContext, projectId: string) {
  if (isHomeProjectId(projectId)) throw new Error("The Home project has no project skills.");
  const { location } = requireProject(ctx, projectId);
  return {
    projectLocation: location,
    ...(location.kind === "wsl" ? { wslDistro: location.distro } : {}),
  };
}

function destination(ctx: AppControlsToolContext, scope: "global" | "project", projectId?: string) {
  if (scope === "project" && !projectId)
    throw new Error("A project skill destination requires projectId from list_projects.");
  return projectId ? skillProjectScope(ctx, projectId) : {};
}

export const skillManagementTools: ToolDomain = {
  specs: [
    {
      name: "list_skill_marketplace",
      description:
        "Browse or search a skills marketplace (skills-sh or skills-directory). Use its returned marketplace and skill id with install_marketplace_skill.",
      inputSchema: z.toJSONSchema(listArgs, { io: "input" }),
    },
    {
      name: "install_marketplace_skill",
      description:
        "Install a skill from list_skill_marketplace into the chosen global or project scope. Project scope needs projectId. For a WSL global destination, supply a projectId from that distro. Requires user authorization, including authorization to replace an existing skill if replace is true.",
      inputSchema: z.toJSONSchema(installArgs, { io: "input" }),
    },
    {
      name: "import_skill",
      description:
        "Copy or link an external skill into Poracode. Use the source skill folder path as sourcePath. Pass sourceProjectId for a project or WSL source and projectId for a project destination or WSL global destination. Requires user authorization, including authorization to replace an existing skill if replace is true.",
      inputSchema: z.toJSONSchema(importArgs, { io: "input" }),
    },
    {
      name: "remove_skill",
      description:
        "Permanently remove a mutable skill by its exact id from list_skills. Pass the same projectId used to list it. Requires explicit user authorization. Use set_skill_enabled to disable a skill without removing its files.",
      inputSchema: z.toJSONSchema(removeArgs, { io: "input" }),
    },
  ],
  handlers: {
    list_skill_marketplace: async (raw, ctx) => {
      const { limit, ...payload } = listArgs.parse(raw);
      const result = await ctx.supervisor.listSkillMarketplace(payload);
      return { ...result, skills: result.skills.slice(0, limit) };
    },
    install_marketplace_skill: (raw, ctx) => {
      const { projectId, ...payload } = installArgs.parse(raw);
      return ctx.supervisor.installMarketplaceSkill({
        ...payload,
        ...destination(ctx, payload.destinationScope, projectId),
      });
    },
    import_skill: (raw, ctx) => {
      const { projectId, sourceProjectId, ...payload } = importArgs.parse(raw);
      const source = sourceProjectId ? skillProjectScope(ctx, sourceProjectId) : undefined;
      return ctx.supervisor.importSkills({
        skills: [
          {
            ...payload,
            ...(source ? { sourceProjectLocation: source.projectLocation } : {}),
            ...(source && "wslDistro" in source ? { sourceWslDistro: source.wslDistro } : {}),
            ...destination(ctx, payload.destinationScope, projectId),
          },
        ],
      });
    },
    remove_skill: async (raw, ctx) => {
      const { projectId, skillId } = removeArgs.parse(raw);
      const scope = projectId ? skillProjectScope(ctx, projectId) : {};
      const { skills } = await ctx.supervisor.scanSkills(scope);
      const skill = skills.find(({ id }) => id === skillId);
      if (!skill?.mutable) throw new Error("No mutable skill has this id in the selected scope.");
      await ctx.supervisor.deleteSkill({ absolutePath: skill.absolutePath, ...scope });
      return { removed: true, skillId };
    },
  },
};
