import { z } from "zod";
import { resolveComposerMcpScope, type AgentCapability } from "./contracts/agent";
import type { ThreadPresentationMode } from "./contracts/common";

// Absence stays compatible with pre-crew writers; unknown future versions are preserved and inert.
export const CREW_BINDING_VERSION = 1;
export const MAX_CREW_ROLES = 6;
export const MAX_CREW_ROLE_PARALLEL = 4;
export const MAX_CREW_ROLE_FALLBACKS = 3;
export const MAX_SAVED_CREWS = 24;
export const CREW_NAME_MAX_LENGTH = 40;
export const CREW_ROLE_LABEL_MAX_LENGTH = 24;
export const CREW_ROLE_BRIEF_MAX_LENGTH = 160;
export const CREW_POLICIES = ["crew-only", "crew-first"] as const;

export const crewPolicySchema = z.enum(CREW_POLICIES);

const crewMemberSelectionShape = {
  agentKind: z.string().min(1).max(128),
  model: z.string().min(1).max(256),
  effort: z.string().min(1).max(64).optional(),
  fast: z.boolean().optional(),
  contextSize: z.string().min(1).max(64).optional(),
};

export const crewMemberSelectionSchema = z.object(crewMemberSelectionShape).strict();
export const crewRoleIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);

const crewRoleShape = {
  id: crewRoleIdSchema,
  label: z.string().min(1).max(CREW_ROLE_LABEL_MAX_LENGTH),
  brief: z.string().max(CREW_ROLE_BRIEF_MAX_LENGTH).optional(),
  noEdits: z.literal(true).optional(),
  selection: crewMemberSelectionSchema,
  fallbacks: z.array(crewMemberSelectionSchema).max(MAX_CREW_ROLE_FALLBACKS).optional(),
  parallel: z.number().int().min(1).max(MAX_CREW_ROLE_PARALLEL).optional(),
};

export const crewRoleSchema = z.object(crewRoleShape).strict();

export const threadCrewBindingSchema = z
  .object({
    version: z.literal(CREW_BINDING_VERSION),
    crewId: z.string().min(1).max(64).optional(),
    name: z.string().min(1).max(CREW_NAME_MAX_LENGTH).optional(),
    policy: crewPolicySchema,
    roles: z.array(crewRoleSchema).min(1).max(MAX_CREW_ROLES),
  })
  .strict();

export const unsupportedThreadCrewBindingSchema = z.looseObject({
  version: z
    .number()
    .int()
    .min(CREW_BINDING_VERSION + 1),
});

export const threadConfigCrewSchema = z
  .union([threadCrewBindingSchema, unsupportedThreadCrewBindingSchema])
  .nullable();

export const savedCrewRoleSchema = z.object(crewRoleShape);
export const savedCrewSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(CREW_NAME_MAX_LENGTH),
  lead: z.object(crewMemberSelectionShape),
  roles: z.array(savedCrewRoleSchema).min(1).max(MAX_CREW_ROLES),
  policy: crewPolicySchema,
  updatedAt: z.number().int().nonnegative().optional(),
});

export type CrewPolicy = z.infer<typeof crewPolicySchema>;
export type CrewMemberSelection = z.infer<typeof crewMemberSelectionSchema>;
export type CrewRole = z.infer<typeof crewRoleSchema>;
export type ThreadCrewBinding = z.infer<typeof threadCrewBindingSchema>;
export type SavedCrew = z.infer<typeof savedCrewSchema>;
export type ThreadConfigCrew = z.infer<typeof threadConfigCrewSchema>;

export function normalizeCrewRoles(roles: readonly CrewRole[]): CrewRole[] {
  const ids = new Set<string>();
  const labels = new Set<string>();
  const normalized: CrewRole[] = [];
  for (const role of roles) {
    const label = collapseWhitespace(role.label);
    const normalizedLabel = label.toLowerCase();
    if (ids.has(role.id) || labels.has(normalizedLabel)) continue;
    ids.add(role.id);
    labels.add(normalizedLabel);
    const brief = role.brief === undefined ? undefined : collapseWhitespace(role.brief);
    const next = {
      id: role.id,
      label,
      ...(brief ? { brief } : {}),
      ...(role.noEdits ? { noEdits: role.noEdits } : {}),
      selection: role.selection,
      ...(role.fallbacks !== undefined ? { fallbacks: role.fallbacks } : {}),
      ...(role.parallel !== undefined ? { parallel: role.parallel } : {}),
    };
    const parsed = crewRoleSchema.safeParse(next);
    if (parsed.success) normalized.push(parsed.data);
  }
  return normalized;
}

export function threadCrewBinding(
  config: { crew?: ThreadConfigCrew | undefined } | undefined,
): ThreadCrewBinding | undefined {
  const parsed = threadCrewBindingSchema.safeParse(config?.crew);
  if (!parsed.success) return undefined;
  const roles = normalizeCrewRoles(parsed.data.roles);
  return roles.length > 0 ? { ...parsed.data, roles } : undefined;
}

export function hasUnsupportedCrewBinding(
  config: { crew?: ThreadConfigCrew | undefined } | undefined,
): boolean {
  const crew = config?.crew;
  return (
    typeof crew === "object" &&
    crew !== null &&
    "version" in crew &&
    typeof crew.version === "number" &&
    Number.isInteger(crew.version) &&
    crew.version > CREW_BINDING_VERSION
  );
}

export function crewBindingFromSavedCrew(crew: SavedCrew): ThreadCrewBinding {
  const roles = crew.roles.map((role) =>
    crewRoleSchema.parse({
      id: role.id,
      label: role.label,
      ...(role.brief !== undefined ? { brief: role.brief } : {}),
      ...(role.noEdits !== undefined ? { noEdits: role.noEdits } : {}),
      selection: role.selection,
      ...(role.fallbacks !== undefined ? { fallbacks: role.fallbacks } : {}),
      ...(role.parallel !== undefined ? { parallel: role.parallel } : {}),
    }),
  );
  const normalizedRoles = normalizeCrewRoles(roles);
  if (normalizedRoles.length === 0) throw new Error("Saved crew has no valid roles");
  return {
    version: CREW_BINDING_VERSION,
    crewId: crew.id,
    name: crew.name,
    policy: crew.policy,
    roles: normalizedRoles,
  };
}

export function crewFingerprint(binding?: ThreadCrewBinding): string {
  if (!binding) return "";
  return canonicalJson({
    ...(binding.name !== undefined ? { name: binding.name } : {}),
    policy: binding.policy,
    roles: binding.roles,
  });
}

/** Null and absence both mean no crew at runtime; retention preserves their wire difference. */
export function isThreadConfigCrewEqual(
  left: ThreadConfigCrew | undefined,
  right: ThreadConfigCrew | undefined,
): boolean {
  const normalizedLeft = left == null ? undefined : left;
  const normalizedRight = right == null ? undefined : right;
  return canonicalJson(normalizedLeft) === canonicalJson(normalizedRight);
}

export function nextCrewRoleId(existingIds: readonly string[], label: string): string {
  const base =
    collapseWhitespace(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .replace(/-+$/g, "") || "role";
  const existing = new Set(existingIds);
  if (!existing.has(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const tail = `-${suffix}`;
    const id = `${base.slice(0, 32 - tail.length).replace(/-+$/g, "")}${tail}`;
    if (!existing.has(id)) return id;
  }
}

export function crewRoleMatches(role: CrewRole, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return false;
  return (
    role.id.trim().toLowerCase() === normalizedQuery ||
    role.label.trim().toLowerCase() === normalizedQuery
  );
}

export function canLeadCrew(
  capabilities: Pick<AgentCapability, "mcpConfigSource" | "crossagentMcpRouting" | "mcpScope">,
  presentationMode: ThreadPresentationMode,
): boolean {
  if (capabilities.mcpConfigSource === "agentSettings") {
    return presentationMode === "gui" && capabilities.crossagentMcpRouting === "provider-session";
  }
  return resolveComposerMcpScope(capabilities.mcpScope, presentationMode) !== "none";
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value) ?? "null";
  const entries = Object.entries(value).filter(([, member]) => member !== undefined);
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(",")}}`;
}
