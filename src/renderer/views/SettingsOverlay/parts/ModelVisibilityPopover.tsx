import { useDeferredValue, useEffect, useState, type Key, type ReactNode } from "react";
import { Button, Input, ListBox, Popover } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, Minus, Search, Zap } from "lucide-react";
import {
  buildProviderModelItems,
  type ProviderModelItem,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu";
import { providerVisibilityKey } from "@/renderer/components/common/ProviderModelMenu/parts/providerIdentity";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  collectHeaderModelGroups,
  headerGroupState,
  type ModelVisibilityCheckState as CheckState,
} from "./modelVisibilityGroups";

/** Provider-level checkboxes: unchecked providers are skipped entirely. */
export interface ModelVisibilityProviderToggle {
  uncheckedKinds: readonly string[];
  onCheckedChange: (kind: string, checked: boolean) => void;
}

export function ModelVisibilityPopover(props: {
  providers: ProviderModelMenuProvider[];
  /** Hidden model ids keyed by each provider's visibility key. */
  hiddenIdsByKey: Readonly<Record<string, readonly string[] | undefined>>;
  onHiddenIdsChange: (visibilityKey: string, hiddenIds: string[]) => void;
  /** When set, provider headers become checkboxes toggling whole providers. */
  providerToggle?: ModelVisibilityProviderToggle;
  /** Visible trigger label rendered before the count (count-only otherwise). */
  triggerLabel?: ReactNode;
  listAriaLabel: string;
  summaryKind: "visible" | "usable";
  footer?: ReactNode;
  compactTriggerCount?: boolean;
  triggerAriaLabel?: string;
  triggerClassName?: string;
}) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const uncheckedKinds = new Set(props.providerToggle?.uncheckedKinds ?? []);
  let totalCount = 0;
  let visibleCount = 0;
  const providerEntries = props.providers.map((provider) => {
    const key = providerVisibilityKey(provider);
    const hidden = new Set(props.hiddenIdsByKey[key] ?? []);
    const models = provider.capabilities.models.filter((model) => model.id !== "auto");
    const hiddenCount = models.filter((model) => hidden.has(model.id)).length;
    totalCount += models.length;
    if (!uncheckedKinds.has(provider.kind)) visibleCount += models.length - hiddenCount;
    return { provider, key, hidden, models, hiddenCount };
  });
  const hiddenByKey = new Map(providerEntries.map((entry) => [entry.key, entry.hidden]));
  const entriesByKind = new Map(providerEntries.map((entry) => [entry.provider.kind, entry]));

  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  const items = isOpen
    ? buildProviderModelItems({
        providers: props.providers,
        search: deferredSearch,
      }).filter((item) => !(item.type === "model" && item.modelId === "auto"))
    : [];

  function isHidden(hiddenModelsKey: string, modelId: string): boolean {
    return hiddenByKey.get(hiddenModelsKey)?.has(modelId) ?? false;
  }

  const headerGroups = collectHeaderModelGroups(items);

  function groupState(headerId: string): CheckState {
    return headerGroupState(headerGroups.get(headerId) ?? [], isHidden);
  }

  // A provider whose every model is unchecked contributes nothing, so it reads
  // as fully unchecked rather than mixed — same as unchecking the provider.
  function providerState(kind: string): CheckState {
    if (uncheckedKinds.has(kind)) return "none";
    const entry = entriesByKind.get(kind);
    if (!entry || entry.hiddenCount === 0) return "all";
    return entry.hiddenCount === entry.models.length ? "none" : "some";
  }

  function setModelHidden(hiddenModelsKey: string, modelId: string) {
    const next = new Set(hiddenByKey.get(hiddenModelsKey) ?? []);
    if (next.has(modelId)) next.delete(modelId);
    else next.add(modelId);
    props.onHiddenIdsChange(hiddenModelsKey, [...next]);
  }

  function toggleGroup(headerId: string) {
    const entries = headerGroups.get(headerId);
    if (!entries || entries.length === 0) return;
    const nextHidden = groupState(headerId) === "all";
    const byKey = new Map<string, Set<string>>();
    for (const entry of entries) {
      let next = byKey.get(entry.hiddenModelsKey);
      if (!next) {
        next = new Set(hiddenByKey.get(entry.hiddenModelsKey) ?? []);
        byKey.set(entry.hiddenModelsKey, next);
      }
      if (nextHidden) next.add(entry.modelId);
      else next.delete(entry.modelId);
    }
    for (const [key, next] of byKey) props.onHiddenIdsChange(key, [...next]);
  }

  // "Show all" and "Hide all" are inverses: both reset model visibility *and*
  // provider checkboxes, so "Hide all" leaves nothing usable and "Show all"
  // restores everything.
  function setAllHidden(hideAll: boolean) {
    for (const entry of providerEntries) {
      props.onHiddenIdsChange(entry.key, hideAll ? entry.models.map((model) => model.id) : []);
      if (uncheckedKinds.has(entry.provider.kind) === hideAll) continue;
      props.providerToggle?.onCheckedChange(entry.provider.kind, !hideAll);
    }
  }

  function activateItem(id: Key) {
    const item = items.find((candidate) => candidate.id === id);
    if (item?.type === "model") setModelHidden(item.hiddenModelsKey, item.modelId);
    else if (item?.type === "header-sub") toggleGroup(item.id);
    else if (item?.type === "header-provider" && props.providerToggle) {
      props.providerToggle.onCheckedChange(
        item.providerKind,
        uncheckedKinds.has(item.providerKind),
      );
    }
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Button
          variant="secondary"
          size="sm"
          className={props.triggerClassName ?? "tabular-nums"}
          {...(props.triggerAriaLabel ? { "aria-label": props.triggerAriaLabel } : {})}
        >
          {props.triggerLabel ? <span>{props.triggerLabel}</span> : null}
          <span className="tabular-nums">
            {props.compactTriggerCount
              ? `${visibleCount}/${totalCount}`
              : `${visibleCount} / ${totalCount}`}
          </span>
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="bottom end" maxHeight={448} className="w-80 p-0">
        {/* max-h-[inherit] tracks the available-height cap React Aria sets on the
            popover element, so the list shrinks near screen edges instead of
            overflowing the window. */}
        <Popover.Dialog className="flex max-h-[inherit] flex-col overflow-hidden !p-0">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted" />
            <Input
              aria-label={t`Search models`}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
              placeholder={t`Search models...`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted/80">
            <span className="tabular-nums">
              {props.summaryKind === "usable" ? (
                <Trans>
                  {visibleCount} of {totalCount} usable
                </Trans>
              ) : (
                <Trans>
                  {visibleCount} of {totalCount} visible
                </Trans>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-auto min-w-0 p-0 text-[10px] text-foreground/70 hover:text-foreground"
                onPress={() => setAllHidden(false)}
              >
                <Trans>Show all</Trans>
              </Button>
              <span className="text-muted/40">·</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-auto min-w-0 p-0 text-[10px] text-foreground/70 hover:text-foreground"
                onPress={() => setAllHidden(true)}
              >
                <Trans>Hide all</Trans>
              </Button>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-3 text-center text-sm text-muted">
              <Trans>No models found</Trans>
            </div>
          ) : (
            <ListBox
              aria-label={props.listAriaLabel}
              selectionMode="none"
              onAction={activateItem}
              className="poracode-menu no-scrollbar min-h-0 overflow-y-auto py-1.5"
            >
              {items.map((item) => (
                <ModelVisibilityRow
                  key={item.id}
                  item={item}
                  isVisible={
                    item.type === "model" ? !isHidden(item.hiddenModelsKey, item.modelId) : false
                  }
                  isProviderUnchecked={
                    (item.type === "model" || item.type === "header-sub") &&
                    uncheckedKinds.has(item.providerKind)
                  }
                  {...(item.type === "header-sub" ? { subGroupState: groupState(item.id) } : {})}
                  {...(item.type === "header-provider" && props.providerToggle
                    ? { providerState: providerState(item.providerKind) }
                    : {})}
                />
              ))}
            </ListBox>
          )}
          {props.footer ? (
            <p className="shrink-0 border-t border-border/40 px-3 py-1.5 text-[10px] text-muted">
              {props.footer}
            </p>
          ) : null}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function checkGlyph(state: CheckState) {
  const checkClass = state === "none" ? "opacity-0" : "opacity-100 text-foreground";
  return state === "some" ? (
    <Minus className={`size-3 shrink-0 transition-opacity ${checkClass}`} />
  ) : (
    <Check className={`size-3 shrink-0 transition-opacity ${checkClass}`} />
  );
}

function checkAria(state: CheckState) {
  return {
    "aria-selected": state === "all",
    "aria-checked":
      state === "all"
        ? ("true" as const)
        : state === "none"
          ? ("false" as const)
          : ("mixed" as const),
  };
}

function CheckStateHint(props: { state: CheckState }) {
  const { t } = useLingui();
  const labels = {
    all: t`Checked`,
    some: t`Partially checked`,
    none: t`Unchecked`,
  } as const;
  // HeroUI's ListBox strips custom aria-checked, so expose the state to
  // screen readers through the accessible name instead.
  return <span className="sr-only">({labels[props.state]})</span>;
}

function ModelVisibilityRow(props: {
  item: ProviderModelItem;
  isVisible: boolean;
  /** Whole provider is unchecked — its child rows render dimmed and inert. */
  isProviderUnchecked?: boolean;
  subGroupState?: CheckState;
  /** Present only when provider headers are checkable. */
  providerState?: CheckState;
}) {
  const { item, isVisible, isProviderUnchecked, subGroupState, providerState } = props;
  const { t } = useLingui();
  const uncheckedClass = isProviderUnchecked ? " opacity-40 data-[disabled=true]:opacity-40" : "";

  if (item.type === "header-sub") {
    const state = subGroupState ?? "all";
    return (
      <ListBox.Item
        id={item.id}
        textValue={item.label}
        isDisabled={isProviderUnchecked === true}
        {...checkAria(state)}
        className={`poracode-menu-item group mx-1.5 mb-1 flex h-7 cursor-default items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80${uncheckedClass}`}
      >
        {checkGlyph(state)}
        <span className="ml-1 min-w-0 truncate">{item.label}</span>
        <CheckStateHint state={state} />
      </ListBox.Item>
    );
  }
  if (item.type === "header-plain") {
    return (
      <ListBox.Item
        id={item.id}
        textValue={t(item.label)}
        isDisabled
        className="mx-1.5 mb-1 flex h-7 items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80 data-[disabled=true]:opacity-100"
      >
        {t(item.label)}
      </ListBox.Item>
    );
  }
  if (item.type === "header-provider") {
    return (
      <ListBox.Item
        id={item.id}
        textValue={item.label}
        {...(providerState ? checkAria(providerState) : { isDisabled: true })}
        className={`mx-1.5 mb-1 flex h-7 items-center gap-1.5 border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80 data-[disabled=true]:opacity-100 ${providerState ? "poracode-menu-item group cursor-default" : ""}`}
      >
        {providerState ? checkGlyph(providerState) : null}
        <ProviderIcon
          kind={item.providerKind}
          {...(item.providerIcon ? { icon: item.providerIcon } : {})}
          tone="active"
          className="size-3"
        />
        <span className="min-w-0 truncate">{item.label}</span>
        {providerState ? <CheckStateHint state={providerState} /> : null}
      </ListBox.Item>
    );
  }

  const labelParts = item.label.split(" · ");
  const name = labelParts[0] ?? item.label;
  const hint = labelParts.length > 1 ? labelParts.slice(1).join(" · ") : undefined;
  const mutedHint = [hint, item.contextDescription].filter(Boolean).join(" · ");

  return (
    <ListBox.Item
      id={item.id}
      textValue={item.label}
      isDisabled={isProviderUnchecked === true}
      aria-selected={isVisible}
      className={`poracode-menu-item group mx-1.5 flex h-7 cursor-default items-center text-foreground${uncheckedClass}`}
    >
      <Check
        className={`size-3 shrink-0 transition-opacity ${isVisible ? "opacity-100" : "opacity-0"}`}
      />
      <span className="ml-1 flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate">{name}</span>
        {item.supportsFast ? (
          <Zap
            role="img"
            aria-label={t`Supports Fast mode`}
            className="size-3 shrink-0 text-muted/60"
          />
        ) : null}
        {mutedHint ? (
          <span className="shrink-0 text-[10px] leading-none text-muted/60">· {mutedHint}</span>
        ) : null}
      </span>
      {item.subProviderLabel ? (
        <span className="ml-auto shrink-0 truncate text-[10px] text-muted/70">
          {item.subProviderLabel}
        </span>
      ) : null}
      <CheckStateHint state={isVisible ? "all" : "none"} />
    </ListBox.Item>
  );
}
