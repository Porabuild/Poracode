import { startTransition, useEffect, useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronDown } from "lucide-react";
import { Header, Label, ListBox, Popover, Tooltip } from "@heroui/react";
import type { LabeledOption } from "@/shared/contracts";
import { Button } from "../Button";

export interface EffortContextMenuProps {
  efforts: readonly LabeledOption[];
  effortValue?: string;
  onEffortChange?: (value: string) => void;
  contextSizes: readonly LabeledOption[];
  contextValue?: string;
  onContextChange?: (value: string) => void;
  thinkingSupported?: boolean;
  thinkingValue?: boolean;
  onThinkingChange?: (value: boolean) => void;
  /** Optional icon to show in the trigger (e.g., effort indicator). */
  icon?: ReactNode;
  isDisabled?: boolean;
  hideLabelOnWrap?: boolean;
  forceHideLabel?: boolean;
  openSignal?: number;
  onOpenChange?: (open: boolean) => void;
}

export function EffortContextMenu(props: EffortContextMenuProps) {
  const {
    efforts,
    effortValue,
    onEffortChange,
    contextSizes,
    contextValue,
    onContextChange,
    thinkingSupported = false,
    thinkingValue = false,
    onThinkingChange,
    icon,
    isDisabled,
    hideLabelOnWrap,
    forceHideLabel = false,
    openSignal,
    onOpenChange,
  } = props;

  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  const hasEffort = efforts.length > 0;
  const hasContext = contextSizes.length > 0;
  const hasThinking = thinkingSupported;

  useEffect(() => {
    if (openSignal === undefined || isDisabled || (!hasEffort && !hasContext && !hasThinking)) {
      return;
    }
    setIsOpen(true);
  }, [openSignal, isDisabled, hasEffort, hasContext, hasThinking]);

  if (!hasEffort && !hasContext && !hasThinking) return null;

  const effortLabel = hasEffort
    ? (efforts.find((o) => o.id === effortValue)?.label ?? effortValue ?? "")
    : "";
  const contextLabel = hasContext
    ? (contextSizes.find((o) => o.id === contextValue)?.label ?? contextValue ?? "")
    : "";

  const triggerLabel =
    [effortLabel, contextLabel].filter((p) => p.length > 0).join(" · ") ||
    (hasThinking ? t`Thinking` : "");

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    onOpenChange?.(open);
  }

  const closeOnSelect = !(hasEffort && hasContext);

  function handleEffort(id: string) {
    if (closeOnSelect) handleOpenChange(false);
    if (id === effortValue) return;
    startTransition(() => onEffortChange?.(id));
  }
  function handleContext(id: string) {
    if (closeOnSelect) handleOpenChange(false);
    if (id === contextValue) return;
    startTransition(() => onContextChange?.(id));
  }

  const trigger = (
    <Button
      aria-label={t`Effort and context`}
      isDisabled={isDisabled ?? false}
      size="sm"
      variant="ghost"
      className="lightcode-composer-menu min-w-0 px-2.5"
    >
      {icon}
      <span
        className={
          hideLabelOnWrap
            ? `lightcode-composer-label-hideable truncate${forceHideLabel ? " is-hidden" : ""}`
            : "truncate"
        }
      >
        {triggerLabel}
      </span>
      <ChevronDown
        className={
          hideLabelOnWrap
            ? `lightcode-composer-label-hideable size-3.5 text-muted${forceHideLabel ? " is-hidden" : ""}`
            : "size-3.5 text-muted"
        }
      />
    </Button>
  );

  const columnCount = (hasEffort ? 1 : 0) + (hasContext ? 1 : 0);
  const popoverWidth = columnCount === 2 ? "w-72" : "w-44";

  return (
    <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger>
        {hideLabelOnWrap ? (
          <Tooltip>
            {trigger}
            <Tooltip.Content placement="top">{triggerLabel}</Tooltip.Content>
          </Tooltip>
        ) : (
          trigger
        )}
      </Popover.Trigger>
      <Popover.Content placement="top start" className={`${popoverWidth} p-0`}>
        <Popover.Dialog className="flex max-h-[24rem] flex-col overflow-hidden">
          {columnCount > 0 ? (
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
            >
              {hasContext ? (
                <Column
                  label={t`Context`}
                  options={contextSizes}
                  value={contextValue}
                  hasNeighbor={hasEffort}
                  onSelect={handleContext}
                />
              ) : null}
              {hasEffort ? (
                <Column
                  label={t`Reasoning`}
                  options={efforts}
                  value={effortValue}
                  hasNeighbor={false}
                  onSelect={handleEffort}
                />
              ) : null}
            </div>
          ) : null}
          {hasThinking ? (
            <div className={columnCount > 0 ? "border-t border-border" : ""}>
              <Header className="block border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/80">
                <Trans>Options</Trans>
              </Header>
              <button
                type="button"
                role="switch"
                aria-checked={thinkingValue}
                className="flex h-9 w-full items-center justify-between gap-3 px-3 text-left text-sm text-foreground hover:bg-surface-hover focus-visible:outline-none"
                onClick={() => startTransition(() => onThinkingChange?.(!thinkingValue))}
              >
                <span className="truncate">
                  <Trans>Thinking</Trans>
                </span>
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    thinkingValue ? "bg-success" : "bg-surface-tertiary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${
                      thinkingValue ? "translate-x-[18px]" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
          ) : null}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function Column(props: {
  label: string;
  options: readonly LabeledOption[];
  value: string | undefined;
  hasNeighbor: boolean;
  onSelect: (id: string) => void;
}) {
  const { label, options, value, hasNeighbor, onSelect } = props;
  return (
    <div className={hasNeighbor ? "border-r border-border" : ""}>
      <Header className="block border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/80">
        {label}
      </Header>
      <ListBox
        aria-label={label}
        className="lightcode-menu max-h-60 overflow-y-auto"
        items={options as LabeledOption[]}
        selectedKeys={value ? new Set([value]) : new Set<string>()}
        selectionMode="single"
        disallowEmptySelection
        onSelectionChange={(keys) => {
          if (keys === "all") return;
          const sel = [...keys][0];
          if (typeof sel === "string") onSelect(sel);
        }}
      >
        {(option) => (
          <ListBox.Item
            id={option.id}
            textValue={option.label}
            className="focus-visible:outline-none"
          >
            <ListBox.ItemIndicator>
              {({ isSelected }) => (isSelected ? <Check className="size-3" /> : null)}
            </ListBox.ItemIndicator>
            <Label className="flex-1 truncate">{option.label}</Label>
          </ListBox.Item>
        )}
      </ListBox>
    </div>
  );
}
