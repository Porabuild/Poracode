import type { ComponentProps, ReactNode } from "react";
import { Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "./Button";

type ButtonVariant = ComponentProps<typeof Button>["variant"];
type PopoverPlacement = ComponentProps<typeof Popover.Content>["placement"];

export interface ConfirmationPopoverAction {
  label: string;
  variant?: ButtonVariant;
  className?: string;
  onPress: () => void;
}

type ConfirmationPopoverProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  body: ReactNode;
  actions: readonly ConfirmationPopoverAction[];
  placement?: PopoverPlacement;
  className?: string;
  children?: ReactNode;
  returnFocusElement?: HTMLElement | null;
} & (
  | { trigger: ReactNode; anchorPosition?: never }
  | { trigger?: never; anchorPosition: { x: number; y: number } }
);

export function ConfirmationPopover(props: ConfirmationPopoverProps) {
  const { t } = useLingui();
  const handleOpenChange = (isOpen: boolean) => {
    props.onOpenChange(isOpen);
    if (!isOpen && props.returnFocusElement?.isConnected) {
      requestAnimationFrame(() => props.returnFocusElement?.focus({ preventScroll: true }));
    }
  };
  const trigger =
    props.trigger ??
    (props.anchorPosition ? (
      <Button
        isIconOnly
        isDisabled
        size="sm"
        variant="ghost"
        aria-label={props.title}
        className="size-px min-w-0 p-0 opacity-0"
      />
    ) : null);
  const popover = (
    <Popover isOpen={props.isOpen} onOpenChange={handleOpenChange}>
      {trigger}
      <Popover.Content
        placement={props.placement ?? "top end"}
        className={props.className ?? "w-64"}
      >
        <Popover.Dialog className="p-3 normal-case tracking-normal">
          <Popover.Arrow />
          <Popover.Heading className="text-sm font-medium text-foreground">
            {props.title}
          </Popover.Heading>
          <div className="mt-1 text-xs font-normal text-muted">{props.body}</div>
          {props.children ? <div className="mt-3">{props.children}</div> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={() => handleOpenChange(false)}>
              {t`Cancel`}
            </Button>
            {props.actions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant={action.variant ?? "primary"}
                {...(action.className ? { className: action.className } : {})}
                onPress={action.onPress}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );

  if (!props.anchorPosition) return popover;
  return (
    <div
      className="fixed z-50 size-0"
      style={{ left: props.anchorPosition.x, top: props.anchorPosition.y }}
    >
      {popover}
    </div>
  );
}
