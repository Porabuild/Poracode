import { startTransition, useEffect, useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronDown } from "lucide-react";
import { Header, Label, ListBox, Tooltip } from "@heroui/react";
import type { LabeledOption } from "@/shared/contracts";
import { Button } from "../Button";
import { ResponsiveMenuSurface, useResponsiveMenu } from "../ResponsiveMenuSurface";

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
  collapseTier?: number;
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
    collapseTier,
    openSignal,
    onOpenChange,
  } = props;

  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const { mobile } = useResponsiveMenu();

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
      className="poracode-composer-menu poracode-composer-effort-control min-w-0 px-2.5"
      {...(mobile ? { onPress: () => handleOpenChange(true) } : {})}
    >
      {icon}
      <span
        data-collapse-tier={collapseTier}
        className={
          hideLabelOnWrap
            ? `poracode-composer-label-hideable truncate${forceHideLabel ? " is-hidden" : ""}`
            : "truncate"
        }
      >
        {triggerLabel}
      </span>
      <ChevronDown
        data-collapse-tier={collapseTier}
        className={
          hideLabelOnWrap
            ? `poracode-composer-label-hideable size-3.5 text-muted${forceHideLabel ? " is-hidden" : ""}`
            : "size-3.5 text-muted"
        }
      />
    </Button>
  );

  const columnCount = (hasEffort ? 1 : 0) + (hasContext ? 1 : 0);
  const popoverWidth = columnCount === 2 ? "w-72" : "w-44";

  const thinkingToggle = hasThinking ? (
    <button
      type="button"
      role="switch"
      aria-checked={thinkingValue}
      aria-label={t`Thinking`}
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
  ) : null;

  const desktopContent = (
    <>
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
      {thinkingToggle ? (
        <div className={columnCount > 0 ? "border-t border-border" : ""}>
          <Header className="block border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/80">
            <Trans>Options</Trans>
          </Header>
          {thinkingToggle}
        </div>
      ) : null}
    </>
  );

  // Mobile: sections stack full-width with finger-sized rows instead of the
  // side-by-side desktop columns.
  const mobileContent = (
    <div className="m-sheet-list">
      {hasContext ? (
        <MobileSection
          label={t`Context`}
          options={contextSizes}
          value={contextValue}
          onSelect={handleContext}
        />
      ) : null}
      {hasEffort ? (
        <MobileSection
          label={t`Reasoning`}
          options={efforts}
          value={effortValue}
          onSelect={handleEffort}
        />
      ) : null}
      {thinkingToggle ? (
        <div>
          <MobileSectionHeader label={t`Options`} />
          {thinkingToggle}
        </div>
      ) : null}
    </div>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      label={t`Effort and context`}
      trigger={
        mobile ? (
          trigger
        ) : hideLabelOnWrap ? (
          <Tooltip>
            {trigger}
            <Tooltip.Content placement="top">{triggerLabel}</Tooltip.Content>
          </Tooltip>
        ) : (
          trigger
        )
      }
      placement="top start"
      contentClassName={`${popoverWidth} p-0`}
      dialogClassName="flex max-h-[24rem] flex-col overflow-hidden"
    >
      {mobile ? mobileContent : desktopContent}
    </ResponsiveMenuSurface>
  );
}

function MobileSectionHeader(props: { label: string }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80">
      {props.label}
    </div>
  );
}

function MobileSection(props: {
  label: string;
  options: readonly LabeledOption[];
  value: string | undefined;
  onSelect: (id: string) => void;
}) {
  const { label, options, value, onSelect } = props;
  return (
    <div>
      <MobileSectionHeader label={label} />
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="m-sheet-action"
          aria-pressed={option.id === value || undefined}
          onClick={() => onSelect(option.id)}
        >
          <span className="flex-1 truncate">{option.label}</span>
          {option.id === value ? <Check className="size-4 shrink-0 text-accent" /> : null}
        </button>
      ))}
    </div>
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
        className="poracode-menu max-h-60 overflow-y-auto"
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
