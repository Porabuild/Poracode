import { useState, type ReactNode } from "react";
import { Popover } from "@heroui/react";
import { Check, ChevronDown } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";

export interface DeviceOption {
  id: string;
  label: string;
  icon: ReactNode;
  hint?: string;
}

/**
 * Profile-local device selector. A dedicated picker (rather than the shared
 * OptionMenu) so the option/trigger text renders in full `text-foreground`
 * white, matching the monochrome profile styling.
 */
export function DevicePicker(props: {
  value: string;
  options: DeviceOption[];
  onChange: (id: string) => void;
}) {
  const { t } = useLingui();
  const { value, options, onChange } = props;
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? options[0];

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button size="sm" variant="ghost" className="gap-1.5 text-foreground">
          {selected?.icon}
          <span className="truncate text-foreground">{selected?.label ?? t`Select device`}</span>
          <ChevronDown className="size-3.5 text-muted" />
        </Button>
      </Popover.Trigger>
      {open ? (
        <Popover.Content placement="bottom" className="p-0">
          <Popover.Dialog className="min-w-[220px] overflow-hidden p-1">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className="poracode-menu-action flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground transition-colors hover:bg-default"
              >
                {opt.icon}
                <span className="flex-1 truncate text-foreground">{opt.label}</span>
                {opt.hint ? <span className="shrink-0 text-xs text-muted">{opt.hint}</span> : null}
                {value === opt.id ? <Check className="size-3.5 shrink-0 text-foreground" /> : null}
              </button>
            ))}
          </Popover.Dialog>
        </Popover.Content>
      ) : null}
    </Popover>
  );
}
