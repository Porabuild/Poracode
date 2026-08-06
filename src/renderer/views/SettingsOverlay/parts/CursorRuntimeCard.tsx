import type { ReactNode } from "react";
import { Radio } from "@heroui/react";
import { Trans } from "@lingui/react/macro";

/**
 * One Cursor GUI runtime as a self-contained card: the radio in the header
 * picks the default for new chats, the body holds that runtime's own setup
 * (package install, credentials). Grouping setup with the runtime keeps ACP and
 * SDK state from reading as one flat list of unrelated rows.
 */
export function CursorRuntimeCard(props: {
  value: string;
  label: string;
  isSelected: boolean;
  isSelectable: boolean;
  statusLine: ReactNode;
  detailLine?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border transition-colors ${
        props.isSelected
          ? "border-accent/50 bg-accent/5"
          : "border-border/40 bg-surface-secondary/35"
      }`}
    >
      <Radio
        className="group w-full cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
        value={props.value}
        isDisabled={!props.isSelectable}
      >
        <Radio.Content className="block w-full cursor-pointer px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{props.label}</span>
            {props.isSelected ? (
              <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                <Trans>Current</Trans>
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted">{props.statusLine}</p>
          {props.detailLine ? (
            <p className="mt-0.5 text-[11px] text-muted/80">{props.detailLine}</p>
          ) : null}
        </Radio.Content>
      </Radio>
      {props.children ? (
        <div className="flex-1 space-y-1.5 border-t border-border/10 px-3 py-2">
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact label/description + control row used inside a runtime card body.
 * Cards sit in a two-column grid, so wide controls (a credential field) take
 * the `stacked` layout and get the full card width on their own line.
 */
export function CursorRuntimeCardRow(props: {
  label: string;
  description: ReactNode;
  stacked?: boolean;
  children?: ReactNode;
}) {
  const text = (
    <div className="min-w-0">
      <p className="text-xs font-medium text-foreground/90">{props.label}</p>
      <p className="truncate text-[11px] text-muted">{props.description}</p>
    </div>
  );
  if (props.stacked) {
    return (
      <div className="space-y-1">
        {text}
        {props.children}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3">
      {text}
      {props.children}
    </div>
  );
}
