import { isNegativeOption } from "@/shared/runtimeRequestForms";

export type PermissionOption = { optionId: string; name: string };

export const DEFAULT_PERMISSION_OPTIONS: PermissionOption[] = [
  { optionId: "allow", name: "Allow" },
  { optionId: "deny", name: "Deny" },
];

export function selectPermissionOption(
  options: readonly PermissionOption[],
  decision: "once" | "always" | "reject",
) {
  const isNegative = (option: PermissionOption) =>
    isNegativeOption({ optionId: option.optionId, label: option.name });
  const label = (option: PermissionOption) => `${option.optionId} ${option.name}`;
  const positive = options.filter((option) => !isNegative(option));
  const once =
    positive.find((option) => !/(always|session|forever)/i.test(label(option))) ?? positive[0];
  if (decision === "reject") return options.find(isNegative)?.optionId;
  if (decision === "once") return once?.optionId;
  return (
    positive.find((option) => /(always|session)/i.test(label(option)))?.optionId ?? once?.optionId
  );
}
