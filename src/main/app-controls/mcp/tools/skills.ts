import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ProjectLocation, ScanSkillsPayload, SkillEntry } from "@/shared/contracts";
import { requireProject, type AppControlsToolContext, type ToolDomain } from "./types";

const listArgsSchema = z.object({
  projectId: z.string().min(1).optional(),
  query: z.string().trim().min(1).optional(),
});
const readArgsSchema = z.object({
  skillId: z.string().min(1),
  projectId: z.string().min(1).optional(),
});
const setEnabledArgsSchema = z.object({
  absolutePath: z.string().min(1),
  enabled: z.boolean(),
  projectId: z.string().min(1).optional(),
});
const MAX_READ_SKILL_BYTES = 1024 * 1024;

export const skillTools: ToolDomain = {
  specs: [
    {
      name: "list_skills",
      description:
        "List installed agent skills. Pass query to filter by name, provider, or description; pass projectId to also include that project's project-scoped skills. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          projectId: { type: "string" },
          query: { type: "string", minLength: 1 },
        },
      },
    },
    {
      name: "read_skill",
      description:
        "Read the SKILL.md content of one enabled, valid skill by id from list_skills. Pass projectId for project-scoped skills. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["skillId"],
        properties: {
          skillId: { type: "string", minLength: 1 },
          projectId: { type: "string" },
        },
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
      const { projectId, query } = listArgsSchema.parse(args);
      const scope = projectId ? projectScope(ctx, projectId) : {};
      const result = await ctx.supervisor.scanSkills(scope);
      const normalizedQuery = query?.toLowerCase();
      const skills = result.skills
        .filter((skill) => !normalizedQuery || skillMatchesQuery(skill, normalizedQuery))
        .map(summarizeSkill);
      const skillIds = new Set(skills.map((skill) => skill.id));
      return {
        ...(projectId ? { projectId } : {}),
        ...(query ? { query } : {}),
        count: skills.length,
        global: skills.filter((skill) => skill.scope === "global"),
        project: skills.filter((skill) => skill.scope === "project"),
        effectiveSkillIds: result.effectiveSkillIds.filter((id) => skillIds.has(id)),
      };
    },
    read_skill: async (args, ctx) => {
      const { skillId, projectId } = readArgsSchema.parse(args);
      const scope = projectId ? projectScope(ctx, projectId) : {};
      const result = await ctx.supervisor.scanSkills(scope);
      const skill = result.skills.find((entry) => entry.id === skillId);
      if (!skill) throw new Error(`Unknown skill id: ${skillId}`);
      if (!skill.enabled) throw new Error(`Skill is disabled: ${skillId}`);
      if (!skill.valid) throw new Error(`Skill is invalid: ${skillId}`);
      const content = await readFile(join(skill.absolutePath, "SKILL.md"));
      if (content.length > MAX_READ_SKILL_BYTES) {
        throw new Error(`Skill is too large to read through app controls: ${skillId}`);
      }
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: content.toString("utf8"),
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

function skillMatchesQuery(skill: SkillEntry, query: string): boolean {
  return [skill.name, skill.providerLabel, skill.description].some((value) =>
    value.toLowerCase().includes(query),
  );
}

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
