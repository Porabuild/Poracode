import { useDeferredValue, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Search, X } from "lucide-react";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
import { useMenuSearchAutofocus } from "@/renderer/components/common/ProviderModelMenu/parts/useMenuSearchAutofocus";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { VisibilityCheckIndicator } from "./VisibilityCheckIndicator";

const SEARCH_THRESHOLD = 6;

export interface SidebarUsageVisibilityProvider {
  readonly id: string;
  readonly label: string;
}

export function SidebarUsageVisibilityPopover(props: {
  providers: readonly SidebarUsageVisibilityProvider[];
  hiddenIds: readonly string[];
  showInSidebar: boolean;
  onChange: (nextHiddenIds: string[]) => void;
}) {
  const { providers, hiddenIds, showInSidebar, onChange } = props;
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (!isOpen) setSearch("");
  }

  const showSearch = providers.length > SEARCH_THRESHOLD;
  useMenuSearchAutofocus(isOpen && showSearch, mobile, searchRef);

  const hiddenSet = new Set(hiddenIds);
  const totalCount = providers.length;
  const visibleCount = providers.filter((p) => !hiddenSet.has(p.id)).length;
  const query = deferredSearch.trim().toLowerCase();
  const filteredProviders = query
    ? providers.filter(
        (p) => p.label.toLowerCase().includes(query) || p.id.toLowerCase().includes(query),
      )
    : providers;

  function toggleProvider(id: string) {
    const next = hiddenSet.has(id)
      ? hiddenIds.filter((entry) => entry !== id)
      : [...new Set([...hiddenIds, id])];
    onChange(next);
  }

  function setAllHidden(hideAll: boolean) {
    const knownIds = new Set(providers.map((p) => p.id));
    const preserved = hiddenIds.filter((id) => !knownIds.has(id));
    onChange(hideAll ? [...new Set([...preserved, ...knownIds])] : preserved);
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const options = listboxRef.current
      ? [...listboxRef.current.querySelectorAll<HTMLElement>('[role="option"]')]
      : [];
    const currentIndex = options.indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options[Math.min(options.length - 1, currentIndex + 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIndex === 0 && showSearch) searchRef.current?.focus();
      else options[Math.max(0, currentIndex - 1)]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      options[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      options[options.length - 1]?.focus();
    }
  }

  const trigger = (
    <Button
      variant="secondary"
      size="sm"
      isDisabled={totalCount === 0}
      aria-label={t`Visible in sidebar`}
      className="min-w-[4.5rem] shrink-0 tabular-nums"
      {...(mobile ? { onPress: () => setIsOpen(true) } : {})}
    >
      {visibleCount} / {totalCount}
    </Button>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      label={t`Visible in sidebar`}
      placement="bottom end"
      contentClassName="w-72 max-w-[calc(100vw-2rem)] p-0"
      dialogClassName="flex max-h-[min(28rem,65vh)] flex-col overflow-hidden !p-0"
      trigger={trigger}
    >
      {showSearch ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-3.5 shrink-0 text-muted" />
          <input
            ref={searchRef}
            aria-label={t`Search providers`}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            placeholder={t`Search providers…`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                listboxRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus();
              } else if (event.key === "Escape" && search) {
                event.preventDefault();
                setSearch("");
              }
            }}
          />
          {search ? (
            <button
              type="button"
              aria-label={t`Clear search`}
              onClick={() => setSearch("")}
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted/80">
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

      {!showInSidebar ? (
        <p className="shrink-0 border-b border-border/40 bg-surface-secondary/30 px-3 py-1.5 text-[11px] text-muted">
          <Trans>Sidebar circles are currently turned off.</Trans>
        </p>
      ) : null}

      {filteredProviders.length === 0 ? (
        <div className="px-3 py-5 text-center text-sm text-muted">
          <Trans>No providers found</Trans>
        </div>
      ) : (
        <div
          ref={listboxRef}
          role="listbox"
          aria-label={t`Visible in sidebar`}
          aria-multiselectable="true"
          className={`poracode-menu min-h-0 flex-1 overflow-y-auto py-1.5 ${
            mobile ? "m-sheet-list pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : ""
          }`}
        >
          {filteredProviders.map((provider) => {
            const isVisible = !hiddenSet.has(provider.id);
            return (
              <button
                key={provider.id}
                type="button"
                role="option"
                aria-label={provider.label}
                aria-selected={isVisible}
                onClick={() => toggleProvider(provider.id)}
                onKeyDown={handleOptionKeyDown}
                className={
                  mobile
                    ? "m-sheet-action group flex w-full items-center gap-2.5 text-left text-sm text-foreground"
                    : "poracode-menu-item group mx-1.5 flex h-8 w-[calc(100%-0.75rem)] cursor-default items-center gap-2 text-left text-foreground"
                }
              >
                <VisibilityCheckIndicator state={isVisible ? "all" : "none"} />
                <span aria-hidden="true" className="inline-flex shrink-0">
                  <ProviderIcon
                    kind={provider.id}
                    fallbackLabel={provider.label}
                    className="size-3.5 text-foreground/80"
                  />
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${
                    isVisible ? "text-foreground" : "text-muted group-hover:text-foreground"
                  }`}
                >
                  {provider.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </ResponsiveMenuSurface>
  );
}
