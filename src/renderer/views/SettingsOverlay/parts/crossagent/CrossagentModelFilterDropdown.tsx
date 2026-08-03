import { useDeferredValue, useEffect, useState } from "react";
import { Button, Popover } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Search } from "lucide-react";
import {
  buildProviderModelItems,
  type ProviderModelMenuProvider,
} from "@/renderer/components/common/ProviderModelMenu";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ModelVisibilityRow } from "../SingleAgentSettings/parts/ModelVisibilityDropdown";

/**
 * Per-provider Crossagents model filter. The dropdown lists the provider's
 * already-globally-visible models; unchecking one excludes it from Crossagents
 * routing only (`crossagentHiddenModels`, on top of the shared `hiddenModels`
 * visibility filter the rest of the app uses).
 */
export function CrossagentModelFilterDropdown(props: { provider: ProviderModelMenuProvider }) {
  const { t } = useLingui();
  const kind = props.provider.kind;
  const hiddenIds = useSharedSettings((s) => s.crossagentHiddenModels[kind]);
  const setCrossagentModelHidden = useSharedSettings((s) => s.setCrossagentModelHidden);
  const setCrossagentHiddenModels = useSharedSettings((s) => s.setCrossagentHiddenModels);

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const allModels = props.provider.capabilities.models.filter((m) => m.id !== "auto");
  const totalCount = allModels.length;
  const hiddenSet = new Set(hiddenIds ?? []);
  const visibleCount = totalCount - allModels.filter((m) => hiddenSet.has(m.id)).length;

  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  const items = isOpen
    ? buildProviderModelItems({
        providers: [props.provider],
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
    setCrossagentModelHidden(kind, modelId, !hiddenSet.has(modelId));
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
    setCrossagentHiddenModels(kind, [...next]);
  }

  function setAllHidden(hideAll: boolean) {
    setCrossagentHiddenModels(kind, hideAll ? allModels.map((m) => m.id) : []);
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 tabular-nums"
          aria-label={t`Crossagent models for ${props.provider.label}`}
        >
          {visibleCount}/{totalCount}
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
                {visibleCount} of {totalCount} usable
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
              aria-label={t`Crossagent models for ${props.provider.label}`}
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
          <p className="border-t border-border/40 px-3 py-1.5 text-[10px] text-muted">
            <Trans>Unchecked models are skipped by Crossagents only.</Trans>
          </p>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
