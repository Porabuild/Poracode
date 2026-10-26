import { ChevronDown } from "lucide-react";
import { Button, Dropdown, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { PR_TONE_TEXT_CLASS } from "@/renderer/utils/prStatus";
import { usePrStateChange, type PrStateAction } from "./usePrStateChange";

/**
 * The review's state as a pill. Where the host allows it the pill is a menu of
 * state changes: close, reopen, back to draft, ready for review.
 */
export function PrStateMenu() {
  const { t } = useLingui();
  const change = usePrStateChange();
  const { state, tone, statusLabel, Icon, items } = change;
  if (!state) return null;
  const pill = (
    <>
      <Icon className={`size-3.5 ${PR_TONE_TEXT_CLASS[tone]}`} aria-hidden />
      <span>{statusLabel ?? state}</span>
    </>
  );
  const className = `gap-1.5 rounded-full px-2.5 text-xs font-medium ${PR_TONE_TEXT_CLASS[tone]} hover:text-foreground`;
  if (!change.canChange)
    return (
      <span
        className={`inline-flex items-center rounded-full bg-default-100 ${className}`}
        aria-label={t`State`}
      >
        {pill}
      </span>
    );
  return (
    <Dropdown>
      <Button
        size="sm"
        variant="ghost"
        className={className}
        aria-label={t`Change state`}
        isDisabled={change.busy}
      >
        {pill}
        <ChevronDown className="size-3" aria-hidden />
      </Button>
      <Dropdown.Popover placement="bottom start">
        <Dropdown.Menu
          aria-label={t`Change state`}
          onAction={(key) => change.run(key as PrStateAction)}
        >
          {items.map((item) => (
            <Dropdown.Item
              key={item.id}
              id={item.id}
              textValue={item.label}
              {...(item.danger ? { variant: "danger" as const } : {})}
            >
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
