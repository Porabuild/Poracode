import type { ComponentType } from "react";
import { Button, Dropdown, Label } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { PixelLoader } from "@/renderer/components/common";

export interface NativeAgentCardAction {
  id: string;
  label: string;
}

/**
 * Shared install/update control for native provider cards: a single action
 * renders as one button, several render as a dropdown of the same button. All
 * labels are resolved by the caller so the control stays provider-agnostic.
 */
export function NativeAgentActionControl<Action extends NativeAgentCardAction>(props: {
  actions: readonly Action[];
  icon: ComponentType<{ className?: string }>;
  /** Idle label of the dropdown trigger (several actions). */
  label: string;
  /** Idle label when exactly one action is available. */
  soloLabel: string;
  pendingLabel: string;
  /** `aria-label` of the dropdown menu. */
  menuLabel: string;
  isPending: boolean;
  onRun: (action: Action | undefined) => void;
}) {
  const Icon = props.icon;
  if (props.actions.length === 0) return null;
  if (props.actions.length === 1) {
    const action = props.actions[0];
    return (
      <Button
        size="sm"
        variant="tertiary"
        isPending={props.isPending}
        onPress={() => props.onRun(action)}
      >
        {({ isPending }) => (
          <>
            {isPending ? <PixelLoader size="xs" /> : <Icon className="size-4" />}
            {isPending ? props.pendingLabel : props.soloLabel}
          </>
        )}
      </Button>
    );
  }
  const actionsById = new Map(props.actions.map((action) => [action.id, action]));
  return (
    <Dropdown>
      <Button size="sm" variant="tertiary" isPending={props.isPending}>
        {({ isPending }) => (
          <>
            {isPending ? <PixelLoader size="xs" /> : <Icon className="size-4" />}
            {isPending ? props.pendingLabel : props.label}
            {isPending ? null : <ChevronDown className="size-3.5" />}
          </>
        )}
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label={props.menuLabel}
          onAction={(key) => props.onRun(actionsById.get(String(key)))}
        >
          {props.actions.map((action) => (
            <Dropdown.Item key={action.id} id={action.id} textValue={action.label}>
              <Label>{action.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
