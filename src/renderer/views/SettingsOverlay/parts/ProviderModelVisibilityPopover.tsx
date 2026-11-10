import { useDeferredValue, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Search, X, Zap } from "lucide-react";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { splitModelLabel } from "@/renderer/components/common/ProviderModelMenu/parts/splitModelLabel";
import { useMenuSearchAutofocus } from "@/renderer/components/common/ProviderModelMenu/parts/useMenuSearchAutofocus";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  computeSetAllVisibilityUpdates,
  computeTargetToggleUpdates,
  countVisibleModels,
  modelGroupCheckState,
  modelRowCheckState,
  type ProviderVisibilityGroup,
  type VisibilityListItem,
  type VisibilityModelRow,
} from "./modelVisibilityCatalog";
import type { ModelVisibilityEntry } from "./modelVisibilityGroups";
import { CheckStateHint, VisibilityCheckIndicator } from "./VisibilityCheckIndicator";

export function ProviderModelVisibilityPopover(props: {
  groups: readonly ProviderVisibilityGroup[];
  hiddenIdsByKey: Readonly<Record<string, readonly string[] | undefined>>;
  onHiddenIdsChange: (updates: ReadonlyMap<string, string[]>) => void;
  listAriaLabel: string;
  triggerClassName?: string;
}) {
  const { groups, hiddenIdsByKey, onHiddenIdsChange, listAriaLabel } = props;
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKind, setSelectedKind] = useState<string | null>(groups[0]?.kind ?? null);
  const [searchScopeKind, setSearchScopeKind] = useState<string | null>(null);
  const [surfaceByKind, setSurfaceByKind] = useState<Record<string, string>>({});
  const [focusedOptionId, setFocusedOptionId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (!isOpen) {
      setSearch("");
      setSearchScopeKind(null);
      setSurfaceByKind({});
      setFocusedOptionId(null);
    }
  }

  useMenuSearchAutofocus(isOpen, mobile, searchRef);

  const hiddenByKey = new Map<string, ReadonlySet<string>>(
    Object.entries(hiddenIdsByKey).map(([key, ids]) => [key, new Set(ids ?? [])]),
  );

  const totalCount = groups.reduce((sum, group) => sum + group.unifiedModels.length, 0);
  const visibleCount = groups.reduce(
    (sum, group) => sum + countVisibleModels(group.unifiedModels, hiddenByKey),
    0,
  );

  const activeKind =
    selectedKind && groups.some((group) => group.kind === selectedKind)
      ? selectedKind
      : (groups[0]?.kind ?? null);

  const multiProvider = groups.length > 1;
  const query = deferredSearch.trim().toLowerCase();
  const isSearching = query.length > 0;

  const matchingGroups = isSearching
    ? groups.flatMap((group) => {
        const providerHit = group.searchText.includes(query);
        const matches = providerHit
          ? group.unifiedModels
          : group.unifiedModels.filter((model) => model.searchText.includes(query));
        return matches.length > 0 ? [{ group, matches }] : [];
      })
    : [];

  const effectiveSearchScope =
    multiProvider &&
    isSearching &&
    searchScopeKind !== null &&
    matchingGroups.some(({ group }) => group.kind === searchScopeKind)
      ? searchScopeKind
      : null;

  const showCrossProviderSearch = multiProvider && isSearching && effectiveSearchScope === null;

  const allFilterLabel = t({
    message: "All",
    context: "modelVisibilityFilter",
    comment: "Filter chip showing all providers or all model surfaces",
  });

  function toggleTargets(targets: readonly ModelVisibilityEntry[], nextHidden: boolean) {
    const updates = computeTargetToggleUpdates(targets, nextHidden, hiddenByKey);
    if (updates.size > 0) onHiddenIdsChange(updates);
  }

  function toggleRow(row: VisibilityModelRow) {
    const state = modelRowCheckState(row, hiddenByKey);
    toggleTargets(row.targets, state === "all");
  }

  function toggleRows(rows: readonly VisibilityModelRow[]) {
    if (rows.length === 0) return;
    const state = modelGroupCheckState(rows, hiddenByKey);
    toggleTargets(
      rows.flatMap((row) => row.targets),
      state === "all",
    );
  }

  function setAllHidden(hideAll: boolean) {
    const updates = computeSetAllVisibilityUpdates(groups, hideAll);
    if (updates.size > 0) onHiddenIdsChange(updates);
  }

  function focusListboxOption(index: number) {
    const options = listboxRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!options || options.length === 0) return;
    const clamped = Math.max(0, Math.min(options.length - 1, index));
    const target = options[clamped];
    if (!target) return;
    const optionId = target.dataset.optionId;
    if (optionId) setFocusedOptionId(optionId);
    target.focus();
  }

  function handleOptionNavigationKey(event: KeyboardEvent<HTMLElement>) {
    const options = listboxRef.current
      ? [...listboxRef.current.querySelectorAll<HTMLElement>('[role="option"]')]
      : [];
    if (options.length === 0) return;
    const currentIdx = options.indexOf(event.currentTarget);
    if (currentIdx < 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusListboxOption(currentIdx + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIdx === 0) searchRef.current?.focus();
      else focusListboxOption(currentIdx - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusListboxOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusListboxOption(options.length - 1);
    }
  }

  const trigger = (
    <Button
      variant="secondary"
      size="sm"
      aria-label={listAriaLabel}
      className={props.triggerClassName ?? "tabular-nums"}
      {...(mobile ? { onPress: () => setIsOpen(true) } : {})}
    >
      <span className="tabular-nums">{`${visibleCount} / ${totalCount}`}</span>
    </Button>
  );

  const focusedGroup =
    multiProvider && isSearching
      ? matchingGroups.find(({ group }) => group.kind === effectiveSearchScope)?.group
      : groups.find((group) => group.kind === activeKind);

  const rawSurfaceId = focusedGroup ? (surfaceByKind[focusedGroup.kind] ?? "all") : "all";
  const effectiveSurface =
    focusedGroup && rawSurfaceId !== "all"
      ? focusedGroup.surfaces.find((surface) => surface.id === rawSurfaceId)
      : undefined;
  const activeSurfaceId = effectiveSurface?.id ?? "all";
  const providerQueryHit = Boolean(
    focusedGroup && isSearching && focusedGroup.searchText.includes(query),
  );

  function renderFocusedPane(group: ProviderVisibilityGroup) {
    const baseModels = effectiveSurface ? effectiveSurface.models : group.unifiedModels;
    const baseItems = effectiveSurface ? effectiveSurface.items : group.unifiedItems;
    const scopeModels =
      isSearching && !providerQueryHit
        ? baseModels.filter((model) => model.searchText.includes(query))
        : baseModels;
    const scopeItems: readonly VisibilityListItem[] = isSearching ? scopeModels : baseItems;

    const scopeVisible = countVisibleModels(scopeModels, hiddenByKey);
    const scopeTotal = scopeModels.length;
    const scopeState = modelGroupCheckState(scopeModels, hiddenByKey);
    const showSurfaceBadges = activeSurfaceId === "all" && group.surfaces.length > 1;
    const activeTabIndexId =
      focusedOptionId && scopeItems.some((item) => item.id === focusedOptionId)
        ? focusedOptionId
        : scopeItems[0]?.id;

    const surfaceTabIds = ["all", ...group.surfaces.map((surface) => surface.id)];

    function handleSurfaceTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      const idx = surfaceTabIds.indexOf(activeSurfaceId);
      if (idx < 0) return;
      let nextIdx = -1;
      if (event.key === "ArrowRight") nextIdx = (idx + 1) % surfaceTabIds.length;
      else if (event.key === "ArrowLeft")
        nextIdx = (idx - 1 + surfaceTabIds.length) % surfaceTabIds.length;
      else if (event.key === "Home") nextIdx = 0;
      else if (event.key === "End") nextIdx = surfaceTabIds.length - 1;
      if (nextIdx < 0) return;
      event.preventDefault();
      const nextId = surfaceTabIds[nextIdx]!;
      setSurfaceByKind((prev) => ({ ...prev, [group.kind]: nextId }));
      const tabs = event.currentTarget
        .closest('[role="tablist"]')
        ?.querySelectorAll<HTMLElement>('[role="tab"]');
      tabs?.[nextIdx]?.focus();
    }

    let activeSubRows: ReadonlySet<VisibilityModelRow> | undefined;

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <button
          type="button"
          role="checkbox"
          aria-checked={scopeState === "all" ? "true" : scopeState === "none" ? "false" : "mixed"}
          aria-label={effectiveSurface ? `${group.label} · ${effectiveSurface.label}` : group.label}
          disabled={scopeTotal === 0}
          onClick={() => toggleRows(scopeModels)}
          className="group flex shrink-0 items-center gap-2 border-b border-border/40 bg-overlay px-3 py-2 text-left transition-colors hover:bg-[var(--row-hover)] disabled:opacity-50"
        >
          <VisibilityCheckIndicator state={scopeState} />
          <ProviderIcon
            kind={group.kind}
            {...(group.icon ? { icon: group.icon } : {})}
            fallbackLabel={group.label}
            tone="active"
            className="size-3.5 shrink-0"
          />
          <span className="min-w-0 truncate text-xs font-semibold text-foreground">
            {effectiveSurface ? `${group.label} · ${effectiveSurface.label}` : group.label}
          </span>
          <span className="ml-auto shrink-0 tabular-nums text-[11px] text-muted">
            {scopeVisible} / {scopeTotal}
          </span>
        </button>

        {group.surfaces.length > 1 ? (
          <div
            role="tablist"
            aria-label={t`Model surface`}
            className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/40 bg-surface-secondary/25 px-2.5 py-1.5"
          >
            <SurfaceTabButton
              isSelected={activeSurfaceId === "all"}
              label={allFilterLabel}
              count={
                isSearching && !providerQueryHit
                  ? group.unifiedModels.filter((m) => m.searchText.includes(query)).length
                  : group.unifiedModels.length
              }
              onKeyDown={handleSurfaceTabKeyDown}
              onSelect={() => setSurfaceByKind((prev) => ({ ...prev, [group.kind]: "all" }))}
            />
            {group.surfaces.map((surface) => {
              const count =
                isSearching && !providerQueryHit
                  ? surface.models.filter((m) => m.searchText.includes(query)).length
                  : surface.models.length;
              return (
                <SurfaceTabButton
                  key={surface.id}
                  isSelected={activeSurfaceId === surface.id}
                  label={surface.label}
                  count={count}
                  onKeyDown={handleSurfaceTabKeyDown}
                  onSelect={() =>
                    setSurfaceByKind((prev) => ({ ...prev, [group.kind]: surface.id }))
                  }
                />
              );
            })}
          </div>
        ) : null}

        {scopeItems.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted">
            <Trans>No models found</Trans>
          </div>
        ) : (
          <div
            ref={listboxRef}
            role="listbox"
            aria-label={listAriaLabel}
            aria-multiselectable="true"
            className={`poracode-menu no-scrollbar min-h-0 flex-1 overflow-y-auto py-1${
              mobile ? " m-sheet-list pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : ""
            }`}
          >
            {scopeItems.map((item) => {
              if (item.type === "header-sub") {
                activeSubRows = new Set(item.modelRows);
                const subState = modelGroupCheckState(item.modelRows, hiddenByKey);
                const subVisible = countVisibleModels(item.modelRows, hiddenByKey);
                return (
                  <div
                    key={item.id}
                    data-option-id={item.id}
                    role="option"
                    tabIndex={item.id === activeTabIndexId ? 0 : -1}
                    aria-selected={subState === "all"}
                    onFocus={() => setFocusedOptionId(item.id)}
                    onClick={() => toggleRows(item.modelRows)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleRows(item.modelRows);
                        return;
                      }
                      handleOptionNavigationKey(event);
                    }}
                    className="poracode-menu-item group mx-1.5 mt-1 flex !min-h-6 cursor-default items-center gap-2 rounded-2xl px-2 font-medium uppercase tracking-wider text-muted/80 first:mt-0"
                  >
                    <VisibilityCheckIndicator state={subState} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[10px]">{item.label}</span>
                    <span className="shrink-0 tabular-nums text-[10px] font-normal text-muted/60">
                      {subVisible}/{item.modelRows.length}
                    </span>
                    <CheckStateHint state={subState} />
                  </div>
                );
              }
              const isUnderSub = Boolean(!isSearching && activeSubRows?.has(item));
              if (!isUnderSub) activeSubRows = undefined;
              return (
                <ModelOptionRow
                  key={item.id}
                  row={item}
                  state={modelRowCheckState(item, hiddenByKey)}
                  tabIndex={item.id === activeTabIndexId ? 0 : -1}
                  indent={isUnderSub}
                  showSubLabel={isSearching}
                  showSurfaceBadges={showSurfaceBadges}
                  onFocus={() => setFocusedOptionId(item.id)}
                  onNavigateKey={handleOptionNavigationKey}
                  onToggle={() => toggleRow(item)}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderCrossProviderSearchPane() {
    if (matchingGroups.length === 0) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-6 text-center text-sm text-muted">
          <Trans>No models found</Trans>
        </div>
      );
    }

    const crossOptionIds = matchingGroups.flatMap(({ group, matches }) => [
      `search-provider:${group.kind}`,
      ...matches.map((row) => row.id),
    ]);
    const activeTabIndexId =
      focusedOptionId && crossOptionIds.includes(focusedOptionId)
        ? focusedOptionId
        : crossOptionIds[0];

    return (
      <div
        ref={listboxRef}
        role="listbox"
        aria-label={listAriaLabel}
        aria-multiselectable="true"
        className={`poracode-menu no-scrollbar min-h-0 flex-1 overflow-y-auto py-1${
          mobile ? " m-sheet-list pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : ""
        }`}
      >
        {matchingGroups.map(({ group, matches }) => {
          const groupState = modelGroupCheckState(matches, hiddenByKey);
          const groupVisible = countVisibleModels(matches, hiddenByKey);
          const showSurfaceBadges = group.surfaces.length > 1;
          const groupOptionId = `search-provider:${group.kind}`;
          return (
            <div key={group.kind} role="group" aria-label={group.label} className="mb-1 last:mb-0">
              <div
                data-option-id={groupOptionId}
                role="option"
                tabIndex={groupOptionId === activeTabIndexId ? 0 : -1}
                aria-selected={groupState === "all"}
                onFocus={() => setFocusedOptionId(groupOptionId)}
                onClick={() => toggleRows(matches)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleRows(matches);
                    return;
                  }
                  handleOptionNavigationKey(event);
                }}
                className="poracode-menu-item group mx-1.5 mb-0.5 mt-1.5 flex h-7 cursor-default items-center gap-2 border-b border-border/50 bg-overlay px-2 text-xs font-semibold text-foreground first:mt-0"
              >
                <VisibilityCheckIndicator state={groupState} />
                <ProviderIcon
                  kind={group.kind}
                  {...(group.icon ? { icon: group.icon } : {})}
                  fallbackLabel={group.label}
                  tone="active"
                  className="size-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <span className="shrink-0 tabular-nums text-[10px] font-normal text-muted">
                  {groupVisible}/{matches.length}
                </span>
                <CheckStateHint state={groupState} />
              </div>
              {matches.map((row) => (
                <ModelOptionRow
                  key={row.id}
                  row={row}
                  state={modelRowCheckState(row, hiddenByKey)}
                  tabIndex={row.id === activeTabIndexId ? 0 : -1}
                  indent={false}
                  showSubLabel
                  showSurfaceBadges={showSurfaceBadges}
                  onFocus={() => setFocusedOptionId(row.id)}
                  onNavigateKey={handleOptionNavigationKey}
                  onToggle={() => toggleRow(row)}
                />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDesktopRail() {
    if (!multiProvider) return null;

    if (isSearching) {
      if (matchingGroups.length === 0) return null;
      const allMatchModels = matchingGroups.flatMap(({ matches }) => matches);
      const allMatchVisible = countVisibleModels(allMatchModels, hiddenByKey);
      return (
        <div
          role="group"
          aria-label={t`Providers`}
          className="no-scrollbar flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/60 bg-surface-secondary/20 p-1.5"
        >
          <button
            type="button"
            aria-current={effectiveSearchScope === null ? "true" : undefined}
            onClick={() => setSearchScopeKind(null)}
            className={`flex h-8 w-full shrink-0 items-center gap-2 rounded-2xl px-2 text-left text-xs transition-colors ${
              effectiveSearchScope === null
                ? "bg-[var(--row-active)] font-medium text-foreground"
                : "text-foreground/80 hover:bg-[var(--row-hover)] hover:text-foreground"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{allFilterLabel}</span>
            <span className="shrink-0 tabular-nums text-[10px] text-muted">
              {allMatchVisible}/{allMatchModels.length}
            </span>
          </button>
          <div className="my-0.5 border-t border-border/40" />
          {matchingGroups.map(({ group, matches }) => {
            const isSelected = effectiveSearchScope === group.kind;
            const matchVisible = countVisibleModels(matches, hiddenByKey);
            return (
              <ProviderRailButton
                key={group.kind}
                group={group}
                isSelected={isSelected}
                visible={matchVisible}
                total={matches.length}
                onSelect={() => {
                  setSelectedKind(group.kind);
                  setSearchScopeKind(group.kind);
                  setSurfaceByKind((prev) => ({ ...prev, [group.kind]: "all" }));
                }}
              />
            );
          })}
        </div>
      );
    }

    return (
      <div
        role="group"
        aria-label={t`Providers`}
        className="no-scrollbar flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/60 bg-surface-secondary/20 p-1.5"
      >
        {groups.map((group) => {
          const isSelected = group.kind === activeKind;
          const groupVisible = countVisibleModels(group.unifiedModels, hiddenByKey);
          return (
            <ProviderRailButton
              key={group.kind}
              group={group}
              isSelected={isSelected}
              visible={groupVisible}
              total={group.unifiedModels.length}
              onSelect={() => setSelectedKind(group.kind)}
            />
          );
        })}
      </div>
    );
  }

  function renderMobileProviderStrip() {
    if (!multiProvider) return null;

    if (isSearching) {
      if (matchingGroups.length <= 1) return null;
      const allMatchModels = matchingGroups.flatMap(({ matches }) => matches);
      return (
        <div
          role="group"
          aria-label={t`Providers`}
          className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/40 px-2.5 py-1.5"
        >
          <MobileFilterChip
            isSelected={effectiveSearchScope === null}
            label={allFilterLabel}
            count={`${allMatchModels.length}`}
            onSelect={() => setSearchScopeKind(null)}
          />
          {matchingGroups.map(({ group, matches }) => (
            <MobileFilterChip
              key={group.kind}
              isSelected={effectiveSearchScope === group.kind}
              label={group.label}
              count={`${matches.length}`}
              onSelect={() => {
                setSelectedKind(group.kind);
                setSearchScopeKind(group.kind);
                setSurfaceByKind((prev) => ({ ...prev, [group.kind]: "all" }));
              }}
            />
          ))}
        </div>
      );
    }

    return (
      <div
        role="group"
        aria-label={t`Providers`}
        className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/40 px-2.5 py-1.5"
      >
        {groups.map((group) => {
          const groupVisible = countVisibleModels(group.unifiedModels, hiddenByKey);
          const isSelected = group.kind === activeKind;
          return (
            <MobileFilterChip
              key={group.kind}
              isSelected={isSelected}
              label={group.label}
              count={`${groupVisible}/${group.unifiedModels.length}`}
              icon={
                <ProviderIcon
                  kind={group.kind}
                  {...(group.icon ? { icon: group.icon } : {})}
                  fallbackLabel={group.label}
                  tone={isSelected ? "active" : "inactive"}
                  className="size-3 shrink-0"
                />
              }
              onSelect={() => setSelectedKind(group.kind)}
            />
          );
        })}
      </div>
    );
  }

  const content = (
    <div
      className={
        multiProvider
          ? "flex min-h-0 flex-1 flex-col overflow-hidden"
          : "flex max-h-[28rem] min-h-0 flex-1 flex-col overflow-hidden"
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Search className="size-3.5 shrink-0 text-muted" />
        <input
          ref={searchRef}
          aria-label={t`Search models`}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
          placeholder={t`Search models...`}
          value={search}
          onChange={(event) => {
            const nextValue = event.target.value;
            setSearch(nextValue);
            if (nextValue.trim() === "") setSearchScopeKind(null);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusListboxOption(0);
              return;
            }
            if (event.key === "Escape") {
              if (search) {
                event.preventDefault();
                setSearch("");
                setSearchScopeKind(null);
              } else {
                setIsOpen(false);
              }
            }
          }}
        />
        {search ? (
          <button
            type="button"
            aria-label={t`Clear search`}
            onClick={() => {
              setSearch("");
              setSearchScopeKind(null);
              searchRef.current?.focus();
            }}
            className="flex size-5 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted/80">
        <span className="tabular-nums">
          <Trans>
            {visibleCount} of {totalCount} visible
          </Trans>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-foreground/70 transition-colors hover:text-foreground"
            onClick={() => setAllHidden(false)}
          >
            <Trans>Show all</Trans>
          </button>
          <span className="text-muted/40">·</span>
          <button
            type="button"
            className="text-foreground/70 transition-colors hover:text-foreground"
            onClick={() => setAllHidden(true)}
          >
            <Trans>Hide all</Trans>
          </button>
        </div>
      </div>

      {mobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {renderMobileProviderStrip()}
          {showCrossProviderSearch
            ? renderCrossProviderSearchPane()
            : focusedGroup
              ? renderFocusedPane(focusedGroup)
              : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {renderDesktopRail()}
          {showCrossProviderSearch
            ? renderCrossProviderSearchPane()
            : focusedGroup
              ? renderFocusedPane(focusedGroup)
              : renderCrossProviderSearchPane()}
        </div>
      )}
    </div>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      label={listAriaLabel}
      trigger={trigger}
      placement="bottom end"
      contentClassName={
        multiProvider
          ? "w-[36rem] max-w-[calc(100vw-2rem)] p-0"
          : "w-96 max-w-[calc(100vw-2rem)] p-0"
      }
      dialogClassName={
        multiProvider
          ? "flex h-[28rem] max-h-[inherit] flex-col overflow-hidden !p-0"
          : "flex max-h-[inherit] flex-col overflow-hidden !p-0"
      }
    >
      {content}
    </ResponsiveMenuSurface>
  );
}

function ProviderRailButton(props: {
  group: ProviderVisibilityGroup;
  isSelected: boolean;
  visible: number;
  total: number;
  onSelect: () => void;
}) {
  const { group, isSelected, visible, total, onSelect } = props;
  return (
    <button
      type="button"
      aria-current={isSelected ? "true" : undefined}
      onClick={onSelect}
      className={`flex h-8 w-full shrink-0 items-center gap-2 rounded-2xl px-2 text-left text-xs transition-colors ${
        isSelected
          ? "bg-[var(--row-active)] font-medium text-foreground"
          : visible === 0
            ? "text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
            : "text-foreground/85 hover:bg-[var(--row-hover)] hover:text-foreground"
      }`}
    >
      <ProviderIcon
        kind={group.kind}
        {...(group.icon ? { icon: group.icon } : {})}
        fallbackLabel={group.label}
        tone={isSelected ? "active" : "inactive"}
        className={`size-3.5 shrink-0 ${visible === 0 && !isSelected ? "opacity-50" : ""}`}
      />
      <span className="min-w-0 flex-1 truncate">{group.label}</span>
      <span
        className={`shrink-0 tabular-nums text-[10px] ${
          visible === 0 ? "text-muted/50" : "text-muted/80"
        }`}
      >
        {visible}/{total}
      </span>
    </button>
  );
}

function SurfaceTabButton(props: {
  isSelected: boolean;
  label: string;
  count: number;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      tabIndex={props.isSelected ? 0 : -1}
      aria-selected={props.isSelected}
      onKeyDown={props.onKeyDown}
      onClick={props.onSelect}
      className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-2 py-0.5 text-[11px] transition-colors ${
        props.isSelected
          ? "bg-foreground/12 font-medium text-foreground"
          : "text-muted hover:bg-foreground/5 hover:text-foreground"
      }`}
    >
      <span>{props.label}</span>
      <span className="tabular-nums text-[10px] text-muted/80">{props.count}</span>
    </button>
  );
}

function MobileFilterChip(props: {
  isSelected: boolean;
  label: string;
  count: string;
  icon?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.isSelected}
      onClick={props.onSelect}
      className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-2 py-1 text-xs transition-colors ${
        props.isSelected
          ? "bg-foreground/12 font-medium text-foreground"
          : "text-muted hover:bg-foreground/5 hover:text-foreground"
      }`}
    >
      {props.icon}
      <span className="max-w-32 truncate">{props.label}</span>
      <span className="tabular-nums text-[10px] text-muted/80">{props.count}</span>
    </button>
  );
}

function ModelOptionRow(props: {
  row: VisibilityModelRow;
  state: "all" | "some" | "none";
  tabIndex: 0 | -1;
  indent: boolean;
  showSubLabel: boolean;
  showSurfaceBadges: boolean;
  onFocus: () => void;
  onNavigateKey: (event: KeyboardEvent<HTMLElement>) => void;
  onToggle: () => void;
}) {
  const {
    row,
    state,
    tabIndex,
    indent,
    showSubLabel,
    showSurfaceBadges,
    onFocus,
    onNavigateKey,
    onToggle,
  } = props;
  const { t } = useLingui();
  const { name, hint } = splitModelLabel(row.label);
  const mutedHint = [hint, row.contextDescription].filter(Boolean).join(" · ");

  return (
    <div
      data-option-id={row.id}
      role="option"
      tabIndex={tabIndex}
      aria-selected={state === "all"}
      onFocus={onFocus}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
          return;
        }
        onNavigateKey(event);
      }}
      className={`poracode-menu-item group mx-1.5 flex h-7 cursor-default items-center gap-2 rounded-2xl px-2 text-xs ${
        indent ? "!pl-5" : ""
      }`}
    >
      <VisibilityCheckIndicator state={state} />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className={`min-w-0 truncate ${
            state === "none" ? "text-muted group-hover:text-foreground" : "text-foreground"
          }`}
        >
          {name}
        </span>
        {row.supportsFast ? (
          <Zap
            role="img"
            aria-label={t`Supports Fast mode`}
            className="size-3 shrink-0 text-muted/60"
          />
        ) : null}
        {mutedHint ? (
          <span className="min-w-0 truncate text-[10px] leading-none text-muted/60">
            · {mutedHint}
          </span>
        ) : null}
      </span>
      {showSubLabel && row.subLabel ? (
        <span className="shrink-0 truncate text-[10px] text-muted/70">{row.subLabel}</span>
      ) : null}
      {showSurfaceBadges && row.surfaceBadges.length > 0 ? (
        <span className="shrink-0 rounded-xl border border-border/50 bg-surface-secondary/60 px-1.5 py-0.5 text-[9px] font-medium leading-none tracking-wide text-muted">
          {row.surfaceBadges.join(" · ")}
        </span>
      ) : null}
      <CheckStateHint state={state} />
    </div>
  );
}
