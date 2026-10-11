import { startTransition, useRef, useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronDown } from "lucide-react";
import { Header, Label, ListBox, Tooltip } from "@heroui/react";
import type { LabeledOption } from "@/shared/contracts";
import { Button } from "../Button";
import { ResponsiveMenuSurface, useResponsiveMenu } from "../ResponsiveMenuSurface";
import { shouldConfirmContextSizeReload } from "@/renderer/state/contextSizeReloadPreference";
import { ContextSizeReloadPopover } from "./ContextSizeReloadPopover";

export interface EffortContextMenuProps {
  efforts: readonly LabeledOption[];
  effortValue?: string;
  onEffortChange?: (value: string) => void;
  contextSizes: readonly LabeledOption[];
  contextValue?: string;
  onContextChange?: (value: string) => void;
  /** Confirm a context change first: it reloads an already-started session. */
  confirmContextChange?: boolean;
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
    confirmContextChange = false,
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
  const [pendingContext, setPendingContext] = useState<{
    id: string;
    anchor: { x: number; y: number };
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { mobile } = useResponsiveMenu();

  const hasEffort = efforts.length > 0;
  const hasContext = contextSizes.length > 0;
  const hasThinking = thinkingSupported;

  // An external `openSignal` bump opens the menu. Tracked as a render snapshot
  // (instead of a sync setState in an effect) with the exact re-run semantics
  // of the previous effect: any signal/disabled/availability change re-opens
  // while the request is serviceable.
  const [prevOpenRequest, setPrevOpenRequest] = useState({
    signal: openSignal,
    disabled: isDisabled,
    effort: hasEffort,
    context: hasContext,
    thinking: hasThinking,
  });
  if (
    prevOpenRequest.signal !== openSignal ||
    prevOpenRequest.disabled !== isDisabled ||
    prevOpenRequest.effort !== hasEffort ||
    prevOpenRequest.context !== hasContext ||
    prevOpenRequest.thinking !== hasThinking
  ) {
    setPrevOpenRequest({
      signal: openSignal,
      disabled: isDisabled,
      effort: hasEffort,
      context: hasContext,
      thinking: hasThinking,
    });
    if (openSignal !== undefined && !isDisabled && (hasEffort || hasContext || hasThinking)) {
      setIsOpen(true);
    }
  }

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

  // A deliberate activation always reaches the owner, including an equal
  // reselect: re-picking the stored value is still evidence the user touched
  // that carrier (it can revoke selection-binding evidence), and the owner's
  // complete-config equality check suppresses genuinely unchanged persistence.
  function handleEffort(id: string) {
    if (closeOnSelect) handleOpenChange(false);
    startTransition(() => onEffortChange?.(id));
  }
  function handleContext(id: string) {
    if (closeOnSelect) handleOpenChange(false);
    // An equal reselect keeps the actual size unchanged, so it never needs the
    // reload confirmation a real switch asks for.
    if (id === contextValue) {
      startTransition(() => onContextChange?.(id));
      return;
    }
    if (confirmContextChange && shouldConfirmContextSizeReload()) {
      handleOpenChange(false);
      const rect = triggerRef.current?.getBoundingClientRect();
      setPendingContext({ id, anchor: { x: rect?.left ?? 0, y: rect?.top ?? 0 } });
      return;
    }
    startTransition(() => onContextChange?.(id));
  }

  function confirmPendingContext() {
    const id = pendingContext?.id;
    setPendingContext(null);
    if (id !== undefined) startTransition(() => onContextChange?.(id));
  }

  const trigger = (
    <Button
      ref={triggerRef}
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

  const menu = (
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

  return (
    <>
      {menu}
      {pendingContext ? (
        <ContextSizeReloadPopover
          anchorPosition={pendingContext.anchor}
          contextLabel={
            contextSizes.find((option) => option.id === pendingContext.id)?.label ??
            pendingContext.id
          }
          onCancel={() => setPendingContext(null)}
          onConfirm={confirmPendingContext}
        />
      ) : null}
    </>
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

/** Per-gesture pointer state for the listbox rows: which row the press started
 * on, where it started, and which id the library's own selection event already
 * forwarded for the gesture. Reset on every press start. */
interface PointerActivation {
  downId: string | null;
  downX: number;
  downY: number;
  forwardedId: string | null;
}

function Column(props: {
  label: string;
  options: readonly LabeledOption[];
  value: string | undefined;
  hasNeighbor: boolean;
  onSelect: (id: string) => void;
}) {
  const { label, options, value, hasNeighbor, onSelect } = props;
  // The library suppresses selection events when the activated option is the
  // already-selected key, but re-picking the stored value is still a deliberate
  // carrier touch the owner must see (it can revoke selection-binding
  // evidence). The row items below forward same-value pointer and Enter/Space
  // activations themselves; changed values keep flowing through the library's
  // selection events exactly once, and controlled value updates never fire.
  const activation = useRef<PointerActivation>({
    downId: null,
    downX: 0,
    downY: 0,
    forwardedId: null,
  });
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
          if (typeof sel === "string") {
            activation.current.forwardedId = sel;
            onSelect(sel);
          }
        }}
      >
        {(option) => (
          <ListBox.Item
            id={option.id}
            textValue={option.label}
            className="focus-visible:outline-none"
            onPointerDown={(event) => {
              activation.current = {
                downId: option.id,
                downX: event.clientX,
                downY: event.clientY,
                forwardedId: null,
              };
            }}
            onPointerMove={(event) => {
              // A drag larger than the press slop (e.g. scrolling the rows)
              // cancels the pending activation instead of firing it on release.
              const session = activation.current;
              if (session.downId !== option.id) return;
              if (Math.hypot(event.clientX - session.downX, event.clientY - session.downY) > 8) {
                session.downId = null;
              }
            }}
            onPointerUp={(event) => {
              const session = activation.current;
              activation.current = { downId: null, downX: 0, downY: 0, forwardedId: null };
              if (session.downId !== option.id || session.forwardedId === option.id) return;
              if (option.id === value && event.button === 0) onSelect(option.id);
            }}
            onPointerCancel={() => {
              activation.current = { downId: null, downX: 0, downY: 0, forwardedId: null };
            }}
            onKeyDown={(event) => {
              // The option's own press runs first within the same dispatch, so
              // the closed-over value still predates this gesture: an equal
              // reselect forwards here while a changed selection is left to the
              // library's press (whose equal case is suppressed).
              if (event.repeat) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              if (option.id === value) onSelect(option.id);
            }}
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
