export function withCurrentValue(options: readonly string[], currentValue: string): string[] {
  if (!currentValue || options.includes(currentValue)) {
    return [...options];
  }

  return [currentValue, ...options];
}

import { getModelLabel } from "../providers";

const DEFAULT_LABEL = (id: string) => id.replace(/\b\w/g, (c) => c.toUpperCase());

export function modelOptions(
  models: readonly string[],
  currentValue: string,
  agentKind?: string,
): { id: string; label: string }[] {
  return withCurrentValue(models, currentValue).map((id) => ({
    id,
    label: (agentKind ? getModelLabel(agentKind, id) : undefined) ?? DEFAULT_LABEL(id),
  }));
}

export function formatCompactLabel(value: string): string {
  const labels: Record<string, string> = {
    never: "Full Access",
    "danger-full-access": "Full access",
    "workspace-write": "Workspace write",
    "read-only": "Read only",
    "on-request": "On request",
  };

  return (
    labels[value] ??
    value.replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

export function buildPermissionOptions(
  approvalPolicies: readonly string[],
  sandboxModes: readonly string[],
) {
  if (approvalPolicies.length > 0 && sandboxModes.length > 0) {
    return approvalPolicies.flatMap((approvalPolicy) =>
      sandboxModes.map((sandboxMode) => ({
        id: `${approvalPolicy}::${sandboxMode}`,
        label: `${formatCompactLabel(approvalPolicy)} · ${formatCompactLabel(sandboxMode)}`,
      })),
    );
  }

  if (sandboxModes.length > 0) {
    return sandboxModes.map((sandboxMode) => ({
      id: `::${sandboxMode}`,
      label: formatCompactLabel(sandboxMode),
    }));
  }

  return approvalPolicies.map((approvalPolicy) => ({
    id: `${approvalPolicy}::`,
    label: formatCompactLabel(approvalPolicy),
  }));
}
