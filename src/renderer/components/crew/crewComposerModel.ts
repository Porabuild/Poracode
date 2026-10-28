import type { AgentStatus, ThreadConfig } from "@/shared/contracts";
import { capabilitiesForPresentation } from "@/shared/agentSelection";
import {
  CREW_BINDING_VERSION,
  MAX_CREW_ROLES,
  crewBindingFromSavedCrew,
  nextCrewRoleId,
  threadCrewBinding,
  type CrewMemberSelection,
  type CrewRole,
  type SavedCrew,
  type ThreadCrewBinding,
} from "@/shared/crew";
import type { ProviderModelMenuProvider } from "@/renderer/components/common/ProviderModelMenu/parts/buildItems";
import { formatEffortLabel } from "@/renderer/components/common/effortLabel";
import type { CrewHelperOptions } from "./crewHelperOptions";
import type { CrewRoleTemplate } from "./crewRoleTemplates";

export interface CrewRosterModel {
  binding: ThreadCrewBinding;
  lead: CrewMemberSelection;
  savedCrew?: SavedCrew;
  helperOptions: CrewHelperOptions;
  roleTemplates: readonly CrewRoleTemplate[];
  leadProviders: ProviderModelMenuProvider[];
  defaultHelper?: CrewMemberSelection;
  summary: string;
  isDraft: boolean;
  isDisabled: boolean;
  helperNote?: string;
  showFallbacks?: boolean;
  onBindingChange: (binding: ThreadCrewBinding) => void;
  onLeadChange: (lead: CrewMemberSelection) => void;
  onSaveToCrew: (savedCrew: SavedCrew, binding: ThreadCrewBinding) => void;
  onSaveAsNewCrew: (savedCrew: SavedCrew, binding: ThreadCrewBinding) => void;
  onHandOff?: () => void;
}

export function leadSelectionOf(
  agentKind: string,
  config: Pick<ThreadConfig, "model" | "effort" | "fast" | "contextSize">,
): CrewMemberSelection {
  return {
    agentKind,
    model: config.model,
    ...(config.effort !== undefined ? { effort: config.effort } : {}),
    ...(config.fast !== undefined ? { fast: config.fast } : {}),
    ...(config.contextSize ? { contextSize: config.contextSize } : {}),
  };
}

export function savedCrewFor(
  binding: ThreadCrewBinding | undefined,
  crews: readonly SavedCrew[],
): SavedCrew | undefined {
  return binding?.crewId ? crews.find((crew) => crew.id === binding.crewId) : undefined;
}

export function draftCrewFromConfig(
  crew: ThreadConfig["crew"],
  crews: readonly SavedCrew[],
): ThreadCrewBinding | undefined {
  const binding = threadCrewBinding({ crew });
  if (!binding) return undefined;
  const saved = savedCrewFor(binding, crews);
  return saved ? crewBindingFromSavedCrew(saved) : binding;
}

function sameEffort(left: string | undefined, right: string | undefined): boolean {
  return (left || undefined) === (right || undefined);
}

function sameSelection(left: CrewMemberSelection, right: CrewMemberSelection): boolean {
  return (
    left.agentKind === right.agentKind &&
    left.model === right.model &&
    sameEffort(left.effort, right.effort) &&
    left.fast === right.fast &&
    (left.contextSize || undefined) === (right.contextSize || undefined)
  );
}

function sameRole(left: CrewRole, right: CrewRole): boolean {
  const leftFallbacks = left.fallbacks ?? [];
  const rightFallbacks = right.fallbacks ?? [];
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.brief === right.brief &&
    (left.noEdits === true) === (right.noEdits === true) &&
    (left.parallel ?? 1) === (right.parallel ?? 1) &&
    sameSelection(left.selection, right.selection) &&
    leftFallbacks.length === rightFallbacks.length &&
    leftFallbacks.every((fallback, index) => sameSelection(fallback, rightFallbacks[index]!))
  );
}

export function isRoleEdited(role: CrewRole, savedCrew: SavedCrew | undefined): boolean {
  if (!savedCrew) return false;
  const savedRole = savedCrew.roles.find((candidate) => candidate.id === role.id);
  return !savedRole || !sameRole(role, savedRole);
}

export function isLeadEdited(lead: CrewMemberSelection, savedCrew: SavedCrew | undefined): boolean {
  return savedCrew !== undefined && !sameSelection(lead, savedCrew.lead);
}

export function isCrewEdited(
  binding: ThreadCrewBinding | undefined,
  lead: CrewMemberSelection,
  savedCrew: SavedCrew | undefined,
): boolean {
  if (!binding || !savedCrew) return false;
  if (binding.policy !== savedCrew.policy || isLeadEdited(lead, savedCrew)) return true;
  if (binding.roles.length !== savedCrew.roles.length) return true;
  return binding.roles.some((role) => isRoleEdited(role, savedCrew));
}

export function newCrewBinding(
  helperSelection: CrewMemberSelection,
  builder: Pick<CrewRoleTemplate, "label" | "brief">,
): ThreadCrewBinding {
  return {
    version: CREW_BINDING_VERSION,
    policy: "crew-only",
    roles: [
      {
        id: "builder",
        label: builder.label,
        ...(builder.brief ? { brief: builder.brief } : {}),
        selection: { ...helperSelection },
      },
    ],
  };
}

export function addRole(
  binding: ThreadCrewBinding,
  templates: readonly CrewRoleTemplate[],
  defaultHelper: CrewMemberSelection,
): { binding: ThreadCrewBinding; roleId?: string } {
  if (binding.roles.length >= MAX_CREW_ROLES) return { binding };
  const ids = new Set(binding.roles.map((role) => role.id));
  const labels = new Set(binding.roles.map((role) => role.label.trim().toLowerCase()));
  const template = templates
    .filter((candidate) => candidate.id !== "helper")
    .find(
      (candidate) => !ids.has(candidate.id) && !labels.has(candidate.label.trim().toLowerCase()),
    );
  const helperTemplate = templates.find((candidate) => candidate.id === "helper");
  let role: CrewRoleTemplate;
  if (template) {
    role = template;
  } else {
    const helperLabel = helperTemplate?.label ?? "Helper";
    let suffix = 1;
    let label = helperLabel;
    while (labels.has(label.trim().toLowerCase())) {
      suffix += 1;
      label = `${helperLabel} ${suffix}`;
    }
    role = {
      ...(helperTemplate ?? { id: "helper", label: helperLabel, tone: "custom" as const }),
      id: ids.has(helperTemplate?.id ?? "helper")
        ? nextCrewRoleId([...ids], label)
        : (helperTemplate?.id ?? "helper"),
      label,
    };
  }
  return {
    binding: {
      ...binding,
      roles: [
        ...binding.roles,
        {
          id: role.id,
          label: role.label,
          ...(role.brief ? { brief: role.brief } : {}),
          ...(role.noEdits ? { noEdits: true as const } : {}),
          selection: { ...defaultHelper },
        },
      ],
    },
    roleId: role.id,
  };
}

export function updateRole(
  binding: ThreadCrewBinding,
  roleId: string,
  patch: Partial<CrewRole>,
): ThreadCrewBinding {
  return {
    ...binding,
    roles: binding.roles.map((role) => (role.id === roleId ? { ...role, ...patch } : role)),
  };
}

export function removeRole(binding: ThreadCrewBinding, roleId: string): ThreadCrewBinding {
  if (binding.roles.length <= 1) return binding;
  return { ...binding, roles: binding.roles.filter((role) => role.id !== roleId) };
}

export function setPolicy(
  binding: ThreadCrewBinding,
  policy: ThreadCrewBinding["policy"],
): ThreadCrewBinding {
  return binding.policy === policy ? binding : { ...binding, policy };
}

export function resetBinding(savedCrew: SavedCrew): ThreadCrewBinding {
  return crewBindingFromSavedCrew(savedCrew);
}

export function saveToCrew(
  savedCrew: SavedCrew,
  binding: ThreadCrewBinding,
  lead: CrewMemberSelection,
  updatedAt = Date.now(),
): SavedCrew {
  return {
    id: savedCrew.id,
    name: savedCrew.name,
    lead: { ...lead },
    roles: binding.roles.map((role) => ({
      ...role,
      selection: { ...role.selection },
      ...(role.fallbacks
        ? { fallbacks: role.fallbacks.map((selection) => ({ ...selection })) }
        : {}),
    })),
    policy: binding.policy,
    updatedAt,
  };
}

function newCrewId(): string {
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  return `crew-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function isCrewNameValid(name: string): boolean {
  const trimmedName = name.trim();
  return trimmedName.length >= 1 && trimmedName.length <= 40;
}

export function saveAsNewCrew(
  name: string,
  binding: ThreadCrewBinding,
  lead: CrewMemberSelection,
  options?: { id?: string; updatedAt?: number },
): SavedCrew {
  const trimmedName = name.trim();
  return {
    id: options?.id ?? newCrewId(),
    name: trimmedName,
    lead: { ...lead },
    roles: binding.roles.map((role) => ({
      ...role,
      selection: { ...role.selection },
      ...(role.fallbacks
        ? { fallbacks: role.fallbacks.map((selection) => ({ ...selection })) }
        : {}),
    })),
    policy: binding.policy,
    updatedAt: options?.updatedAt ?? Date.now(),
  };
}

export function crewSummary(
  leadLabel: string,
  roles: readonly CrewRole[],
  modelLabelOf: (selection: CrewMemberSelection) => string,
): string {
  if (roles.length === 1 && (roles[0]?.parallel ?? 1) === 1) {
    return `${leadLabel} + ${modelLabelOf(roles[0]!.selection)}`;
  }
  return `${leadLabel} + ${roles.length}`;
}

export function crewModelLabelOf(
  statuses: readonly AgentStatus[],
  selection: CrewMemberSelection,
): string {
  const capabilities = statuses.find(
    (status) => status.kind === selection.agentKind && status.installed,
  )?.capabilities;
  if (!capabilities) return selection.model;
  return (
    capabilitiesForPresentation(capabilities, "gui").models.find(
      (model) => model.id === selection.model,
    )?.label ?? selection.model
  );
}

export function crewMenuMeta(
  crew: SavedCrew,
  modelLabelOf: (selection: CrewMemberSelection) => string,
): string {
  return crewSummary(modelLabelOf(crew.lead), crew.roles, modelLabelOf);
}

export function crewPickerEntry(
  crew: SavedCrew,
  modelLabelOf: (selection: CrewMemberSelection) => string,
  labels: { lead: string; readOnly: string },
): {
  crewId: string;
  name: string;
  leadLabel: string;
  leadKind: string;
  helperKinds: string[];
  details: string;
} {
  const memberLine = (selection: CrewMemberSelection) =>
    [
      modelLabelOf(selection),
      selection.effort ? formatEffortLabel(selection.effort) : undefined,
      selection.contextSize,
    ]
      .filter((part): part is string => !!part)
      .join(" · ");
  const roleLines = crew.roles.map((role) => {
    const roleName = (role.parallel ?? 1) > 1 ? `${role.label} ×${role.parallel}` : role.label;
    const readOnly = role.noEdits ? ` · ${labels.readOnly}` : "";
    return `${roleName}: ${memberLine(role.selection)}${readOnly}`;
  });
  return {
    crewId: crew.id,
    name: crew.name,
    leadLabel: modelLabelOf(crew.lead),
    leadKind: crew.lead.agentKind,
    helperKinds: [...new Set(crew.roles.map((role) => role.selection.agentKind))],
    details: [`${labels.lead}: ${memberLine(crew.lead)}`, ...roleLines].join("\n"),
  };
}
