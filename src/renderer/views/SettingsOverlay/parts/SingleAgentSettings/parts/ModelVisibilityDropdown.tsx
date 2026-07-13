import { useDeferredValue, useEffect, useState } from "react";
import { Button, Popover } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, Minus, Search } from "lucide-react";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  buildProviderModelItems,
  type ProviderModelItem,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu";

export function ModelVisibilityDropdown(props: {
  settingsKey: string;
  provider: ProviderModelMenuProvider;
  /**
   * Include the provider label in the row title. Set when the agent expands
   * to multiple visibility providers (e.g. Cursor's terminal + GUI model
   * surfaces) so sibling rows stay distinguishable.
   */
  showProviderLabel?: boolean;
}) {
  const { t } = useLingui();
  const { settingsKey, provider } = props;
  const hiddenIds = useSharedSettings((s) => s.hiddenModels[settingsKey]);
  const setHiddenModels = useSharedSettings((s) => s.setHiddenModels);

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const allModels = provider.capabilities.models.filter((m) => m.id !== "auto");
  const totalCount = allModels.length;
  const hiddenSet = new Set(hiddenIds ?? []);
  const visibleCount = totalCount - allModels.filter((m) => hiddenSet.has(m.id)).length;

  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  const items = isOpen
    ? buildProviderModelItems({
        providers: [provider],
        search: deferredSearch,
      }).filter((item) => !(item.type === "model" && item.modelId === "auto"))
    : [];

  type SubGroupState = "all" | "some" | "none";
  const subGroupModelIds = new Map<string, string[]>();
  let activeSubHeaderId: string | null = null;
  for (const item of items) {
    if (item.type === "header-sub") {
      activeSubHeaderId = item.id;
      if (!subGroupModelIds.has(item.id)) subGroupModelIds.set(item.id, []);
    } else if (item.type === "header-plain" || item.type === "header-provider") {
      activeSubHeaderId = null;
    } else if (item.type === "model" && activeSubHeaderId) {
      subGroupModelIds.get(activeSubHeaderId)?.push(item.modelId);
    }
  }
  const subGroupStates = new Map<string, SubGroupState>();
  for (const [headerId, modelIds] of subGroupModelIds) {
    const hiddenInGroup = modelIds.filter((id) => hiddenSet.has(id)).length;
    const state: SubGroupState =
      hiddenInGroup === 0 ? "all" : hiddenInGroup === modelIds.length ? "none" : "some";
    subGroupStates.set(headerId, state);
  }

  function toggleModel(modelId: string) {
    const next = new Set(hiddenSet);
    if (next.has(modelId)) next.delete(modelId);
    else next.add(modelId);
    setHiddenModels(settingsKey, [...next]);
  }

  function toggleSubGroup(headerId: string) {
    const modelIds = subGroupModelIds.get(headerId);
    if (!modelIds || modelIds.length === 0) return;
    const state = subGroupStates.get(headerId) ?? "all";
    // all → none; some/none → all
    const nextHidden = state === "all";
    const next = new Set(hiddenSet);
    for (const id of modelIds) {
      if (nextHidden) next.add(id);
      else next.delete(id);
    }
    setHiddenModels(settingsKey, [...next]);
  }

  function setAllHidden(hideAll: boolean) {
    setHiddenModels(settingsKey, hideAll ? allModels.map((m) => m.id) : []);
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/10 last:border-0 group">
      <div className="flex flex-col min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {props.showProviderLabel ? t`Visible ${provider.label} models` : t`Visible models`}
        </p>
        <p className="text-[11px] text-muted line-clamp-1 group-hover:line-clamp-none transition-all">
          <Trans>Toggle models off to hide them from the selector.</Trans>
        </p>
      </div>
      <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger>
          <Button variant="secondary" size="sm" className="min-w-[4.5rem] tabular-nums">
            {visibleCount} / {totalCount}
          </Button>
        </Popover.Trigger>
        <Popover.Content placement="bottom end" className="w-80 p-0">
          <Popover.Dialog className="flex max-h-[28rem] flex-col overflow-hidden !p-0">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted" />
              <input
                aria-label={t`Search models`}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
                placeholder={t`Search models...`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted/80">
              <span className="tabular-nums">
                <Trans>
                  {visibleCount} of {totalCount} visible
                </Trans>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-foreground/70 hover:text-foreground"
                  onClick={() => setAllHidden(false)}
                >
                  <Trans>Show all</Trans>
                </button>
                <span className="text-muted/40">·</span>
                <button
                  type="button"
                  className="text-foreground/70 hover:text-foreground"
                  onClick={() => setAllHidden(true)}
                >
                  <Trans>Hide all</Trans>
                </button>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="px-3 py-3 text-center text-sm text-muted">
                <Trans>No models found</Trans>
              </div>
            ) : (
              <div
                role="listbox"
                aria-label={t`Visible models`}
                aria-multiselectable="true"
                className="poracode-menu no-scrollbar max-h-[22rem] overflow-y-auto py-1.5"
              >
                {items.map((item) => (
                  <ModelVisibilityRow
                    key={item.id}
                    item={item}
                    isVisible={item.type === "model" ? !hiddenSet.has(item.modelId) : false}
                    {...(item.type === "header-sub"
                      ? { subGroupState: subGroupStates.get(item.id) ?? "all" }
                      : {})}
                    onToggle={toggleModel}
                    onToggleSubGroup={toggleSubGroup}
                  />
                ))}
              </div>
            )}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}

function ModelVisibilityRow(props: {
  item: ProviderModelItem;
  isVisible: boolean;
  subGroupState?: "all" | "some" | "none";
  onToggle: (modelId: string) => void;
  onToggleSubGroup?: (headerId: string) => void;
}) {
  const { item, isVisible, subGroupState, onToggle, onToggleSubGroup } = props;
  const { t } = useLingui();

  if (item.type === "header-sub") {
    const state = subGroupState ?? "all";
    const handleToggle = () => onToggleSubGroup?.(item.id);
    const checkClass =
      state === "all"
        ? "opacity-100 text-foreground"
        : state === "some"
          ? "opacity-100 text-foreground"
          : "opacity-0";
    return (
      <div
        role="option"
        aria-selected={state === "all"}
        aria-checked={state === "all" ? "true" : state === "none" ? "false" : "mixed"}
        tabIndex={0}
        className="poracode-menu-item group mx-1.5 mb-1 flex h-7 cursor-default items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80"
        onClick={handleToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleToggle();
          }
        }}
      >
        {state === "some" ? (
          <Minus className={`size-3 shrink-0 transition-opacity ${checkClass}`} />
        ) : (
          <Check className={`size-3 shrink-0 transition-opacity ${checkClass}`} />
        )}
        <span className="ml-1 min-w-0 truncate">{item.label}</span>
      </div>
    );
  }
  if (item.type === "header-plain") {
    return (
      <div
        role="presentation"
        className="mx-1.5 mb-1 flex h-7 items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80"
      >
        {t(item.label)}
      </div>
    );
  }
  if (item.type === "header-provider") {
    return (
      <div
        role="presentation"
        className="mx-1.5 mb-1 flex h-7 items-center gap-1.5 border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80"
      >
        <ProviderIcon
          kind={item.providerKind}
          {...(item.providerIcon ? { icon: item.providerIcon } : {})}
          tone="active"
          className="size-3"
        />
        <span className="min-w-0 truncate">{item.label}</span>
      </div>
    );
  }

  const labelParts = item.label.split(" · ");
  const name = labelParts[0] ?? item.label;
  const hint = labelParts.length > 1 ? labelParts.slice(1).join(" · ") : undefined;
  const mutedHint = [hint, item.contextDescription].filter(Boolean).join(" · ");

  return (
    <div
      role="option"
      aria-selected={isVisible}
      tabIndex={0}
      className="poracode-menu-item group mx-1.5 flex h-7 cursor-default items-center text-foreground"
      onClick={() => onToggle(item.modelId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(item.modelId);
        }
      }}
    >
      <Check
        className={`size-3 shrink-0 transition-opacity ${isVisible ? "opacity-100" : "opacity-0"}`}
      />
      <span className="ml-1 flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate">{name}</span>
        {mutedHint ? (
          <span className="shrink-0 text-[10px] leading-none text-muted/60">· {mutedHint}</span>
        ) : null}
      </span>
      {item.subProviderLabel ? (
        <span className="ml-auto shrink-0 truncate text-[10px] text-muted/70">
          {item.subProviderLabel}
        </span>
      ) : null}
    </div>
  );
}
