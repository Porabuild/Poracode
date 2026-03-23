export function withCurrentValue(options: readonly string[], currentValue: string): string[] {
  if (!currentValue || options.includes(currentValue)) {
    return [...options];
  }

  return [currentValue, ...options];
}

export function formatCompactLabel(value: string): string {
  const labels: Record<string, string> = {
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
