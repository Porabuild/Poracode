import { ListFilter } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ProfileAccountRef } from "@/shared/contracts";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { DevicePicker, type DeviceOption } from "./DevicePicker";

const ALL_ACCOUNTS = "__all__";

/**
 * Per-account stats filter. A thin wrapper over the shared monochrome
 * {@link DevicePicker} shell: lists every account with its provider icon plus an
 * "All accounts" entry. `undefined` value = no filter.
 */
export function AccountFilter(props: {
  value: string | undefined;
  options: ProfileAccountRef[];
  onChange: (account: string | undefined) => void;
}) {
  const { t } = useLingui();
  const { value, options, onChange } = props;
  const pickerOptions: DeviceOption[] = [
    {
      id: ALL_ACCOUNTS,
      label: t`All accounts`,
      icon: <ListFilter className="size-4 text-muted" />,
    },
    ...options.map((o) => ({
      id: o.key,
      label: o.label,
      icon: <ProviderIcon kind={o.key} fallbackLabel={o.label} className="size-4 rounded" />,
    })),
  ];
  return (
    <DevicePicker
      value={value ?? ALL_ACCOUNTS}
      options={pickerOptions}
      onChange={(id) => onChange(id === ALL_ACCOUNTS ? undefined : id)}
    />
  );
}
