import { z } from "zod";
import type { ProjectLocation, ScanSkillsPayload, SkillEntry } from "@/shared/contracts";
import { requireProject, type AppControlsToolContext, type ToolDomain } from "./types";

const listArgsSchema = z.object({ projectId: z.string().min(1).optional() });
const setEnabledArgsSchema = z.object({
  absolutePath: z.string().min(1),
  enabled: z.boolean(),
  projectId: z.string().min(1).optional(),
});

export const skillTools: ToolDomain = {
  specs: [
    {
      name: "list_skills",
      description:
        "List installed agent skills. Returns global skills always; pass projectId to also include that project's project-scoped skills. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { projectId: { type: "string" } },
      },
    },
    {
      name: "set_skill_enabled",
      description:
        "Enable or disable one skill by its absolutePath (from list_skills). Pass projectId when the skill is project-scoped so it is toggled in that project's scope.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["absolutePath", "enabled"],
        properties: {
          absolutePath: { type: "string", minLength: 1 },
          enabled: { type: "boolean" },
          projectId: { type: "string" },
        },
      },
    },
  ],
  handlers: {
    list_skills: async (args, ctx) => {
      const { projectId } = listArgsSchema.parse(args);
      const scope = projectId ? projectScope(ctx, projectId) : {};
      const result = await ctx.supervisor.scanSkills(scope);
      const skills = result.skills.map(summarizeSkill);
      return {
        ...(projectId ? { projectId } : {}),
        count: skills.length,
        global: skills.filter((skill) => skill.scope === "global"),
        project: skills.filter((skill) => skill.scope === "project"),
        effectiveSkillIds: result.effectiveSkillIds,
      };
    },
    set_skill_enabled: async (args, ctx) => {
      const { absolutePath, enabled, projectId } = setEnabledArgsSchema.parse(args);
      const scope = projectId ? projectScope(ctx, projectId) : {};
      await ctx.supervisor.setSkillEnabled({ absolutePath, enabled, ...scope });
      return { absolutePath, enabled };
    },
  },
};

/** Build the project-scoped `scanSkills`/`setSkillEnabled` target for a projectId. */
function projectScope(
  ctx: AppControlsToolContext,
  projectId: string,
): Pick<ScanSkillsPayload, "projectLocation" | "wslDistro"> {
  const location: ProjectLocation = requireProject(ctx, projectId).location;
  return {
    projectLocation: location,
    ...(location.kind === "wsl" ? { wslDistro: location.distro } : {}),
  };
}

/** A compact, read-friendly view of one skill entry. */
function summarizeSkill(skill: SkillEntry): {
  id: string;
  name: string;
  description: string;
  scope: SkillEntry["scope"];
  enabled: boolean;
  valid: boolean;
  provider: string;
  absolutePath: string;
} {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    scope: skill.scope,
    enabled: skill.enabled,
    valid: skill.valid,
    provider: skill.providerLabel,
    absolutePath: skill.absolutePath,
  };
}
