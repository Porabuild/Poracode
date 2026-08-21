import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronDown, Search, Star, Zap } from "lucide-react";
import { Tooltip } from "@heroui/react";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { ResponsiveMenuSurface, useResponsiveMenu } from "../ResponsiveMenuSurface";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { ThreadPresentationMode } from "@/shared/contracts";
import { migrateCursorBaseId, parseCursorModelId } from "@/shared/cursorModelId";
import { Button } from "../Button";
import {
  buildProviderModelItems,
  type ModelRef,
  type ProviderModelMenuProvider,
} from "./parts/buildItems";
import { deriveSubProvider } from "./parts/deriveSubProvider";
import { providerMenuKey } from "./parts/providerIdentity";
import type { ProviderModelItem } from "./parts/types";

export type { ProviderModelMenuProvider };

const MODEL_MENU_ROW_HEIGHT = 28;
/** Model rows grow to a finger-friendly target in the mobile PWA drawer; headers
 * stay compact. Threaded through the virtualizer so the JS row math and the
 * rendered row height never disagree (a mismatch desyncs the scroll spacers). */
const MODEL_MENU_ROW_HEIGHT_MOBILE = 44;
const MODEL_MENU_EXPANDED_MOBILE_CHROME_HEIGHT = 180;
const MODEL_MENU_PROVIDER_HEADER_BOTTOM_GAP = 4;
const MODEL_MENU_MAX_HEIGHT = 288;
const MODEL_MENU_LISTBOX_PADDING_BOTTOM = 6;
const MODEL_MENU_MOBILE_SCROLL_END_GAP = 32;
const MODEL_MENU_OVERSCAN_ROWS = 16;
const MODEL_DESCRIPTION_TOOLTIP_DELAY_MS = 1000;

interface WindowedItemsMeta {
  structureKey: string;
  modelRowIndices: number[];
  itemIndexById: Map<string, number>;
  modelPositionByIndex: Map<number, number>;
  firstModelId: string | null;
  stickyHeaderIndexByRow: number[];
  stickySubHeaderIndexByRow: number[];
  itemTopByIndex: number[];
  totalHeight: number;
}

const windowedItemsMetaCache = new WeakMap<
  ProviderModelItem[],
  { rowHeight: number; meta: WindowedItemsMeta }
>();

export interface ProviderModelMenuProps {
  /** Providers to surface (typically all installed agents for draft, locked-only otherwise). */
  providers: ProviderModelMenuProvider[];
  currentAgentKind: string;
  currentModel: string;
  /** When set, only this provider's rows are rendered. */
  lockedAgentKind?: string;
  presentationMode?: ThreadPresentationMode;
  isDisabled?: boolean;
  hideLabelOnWrap?: boolean;
  forceHideLabel?: boolean;
  collapseTier?: number;
  openSignal?: number;
  onChange: (next: {
    agentKind: string;
    model: string;
    presentationMode?: ThreadPresentationMode;
  }) => void;
  onOpenChange?: (open: boolean) => void;
}

function normalizeCurrentModelForProvider(
  provider: ProviderModelMenuProvider | undefined,
  modelId: string,
): string {
  if (!provider || provider.capabilities.models.some((model) => model.id === modelId)) {
    return modelId;
  }
  if (provider.kind !== "cursor") {
    return modelId;
  }
  const normalized = migrateCursorBaseId(parseCursorModelId(modelId).baseId);
  return provider.capabilities.models.some((model) => model.id === normalized)
    ? normalized
    : modelId;
}

function windowedItemHeight(item: ProviderModelItem, modelRowHeight: number): number {
  if (
    item.type === "header-plain" ||
    item.type === "header-provider" ||
    item.type === "header-sub"
  ) {
    // Headers stay compact on every platform.
    return MODEL_MENU_ROW_HEIGHT + MODEL_MENU_PROVIDER_HEADER_BOTTOM_GAP;
  }
  return modelRowHeight;
}

function itemIndexAtOffset(meta: WindowedItemsMeta, offset: number): number {
  let low = 0;
  let high = meta.itemTopByIndex.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const top = meta.itemTopByIndex[mid] ?? 0;
    if (top <= offset) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

function itemTop(meta: WindowedItemsMeta, index: number): number {
  if (index >= meta.itemTopByIndex.length) return meta.totalHeight;
  return meta.itemTopByIndex[index] ?? 0;
}

function isPrimaryHeader(
  item: ProviderModelItem | undefined,
): item is Extract<ProviderModelItem, { type: "header-plain" | "header-provider" }> {
  return item?.type === "header-plain" || item?.type === "header-provider";
}

function isSubHeader(
  item: ProviderModelItem | undefined,
): item is Extract<ProviderModelItem, { type: "header-sub" }> {
  return item?.type === "header-sub";
}

function getWindowedItemsMeta(
  items: ProviderModelItem[],
  modelRowHeight: number,
): WindowedItemsMeta {
  const cached = windowedItemsMetaCache.get(items);
  if (cached && cached.rowHeight === modelRowHeight) return cached.meta;

  const idParts: string[] = [];
  const modelRowIndices: number[] = [];
  const itemIndexById = new Map<string, number>();
  const modelPositionByIndex = new Map<number, number>();
  const stickyHeaderIndexByRow: number[] = [];
  const stickySubHeaderIndexByRow: number[] = [];
  const itemTopByIndex: number[] = [];
  let firstModelId: string | null = null;
  let currentStickyHeaderIndex = -1;
  let currentStickySubHeaderIndex = -1;
  let totalHeight = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    idParts.push(item.id);
    itemIndexById.set(item.id, index);
    itemTopByIndex.push(totalHeight);

    if (item.type === "header-plain" || item.type === "header-provider") {
      currentStickyHeaderIndex = index;
      currentStickySubHeaderIndex = -1;
    } else if (item.type === "header-sub") {
      currentStickySubHeaderIndex = index;
    } else if (item.type === "model") {
      if (firstModelId === null) firstModelId = item.id;
      modelPositionByIndex.set(index, modelRowIndices.length);
      modelRowIndices.push(index);
    }

    stickyHeaderIndexByRow.push(currentStickyHeaderIndex);
    stickySubHeaderIndexByRow.push(currentStickySubHeaderIndex);
    totalHeight += windowedItemHeight(item, modelRowHeight);
  }

  const meta: WindowedItemsMeta = {
    structureKey: idParts.join("|"),
    modelRowIndices,
    itemIndexById,
    modelPositionByIndex,
    firstModelId,
    stickyHeaderIndexByRow,
    stickySubHeaderIndexByRow,
    itemTopByIndex,
    totalHeight,
  };
  windowedItemsMetaCache.set(items, { rowHeight: modelRowHeight, meta });
  return meta;
}

function selectedModelIndex(selectedKeys: Set<string>, meta: WindowedItemsMeta): number {
  for (const key of selectedKeys) {
    const index = meta.itemIndexById.get(key);
    if (index !== undefined && meta.modelPositionByIndex.has(index)) {
      return index;
    }
  }
  return -1;
}

function splitModelLabel(label: string): { name: string; hint?: string } {
  const separatorIdx = label.indexOf(" · ");
  if (separatorIdx < 0) return { name: label };
  return {
    name: label.slice(0, separatorIdx),
    hint: label.slice(separatorIdx + 3),
  };
}

function expandedMobileModelMenuMaxHeight(): number {
  if (typeof window === "undefined") return MODEL_MENU_MAX_HEIGHT;
  return Math.max(
    MODEL_MENU_MAX_HEIGHT,
    window.innerHeight - MODEL_MENU_EXPANDED_MOBILE_CHROME_HEIGHT,
  );
}

/* In iOS Safari browser mode the sheet extends below the visible viewport so
   its paint fills the band under the floating toolbar (styles.css,
   --m-browser-band-paint). The virtual list must add that depth to its scroll
   end gap or the last rows park under the toolbar. Resolve the CSS token with
   a probe so the JS gap and the CSS geometry can never drift; it computes to
   0 everywhere the token is undefined (desktop, standalone, Android). */
function browserToolbarScrollClearance(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;width:0;" +
    "height:var(--m-browser-toolbar-safe-area,0px);";
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

function refsForPresentation(
  refs: readonly ModelRef[],
  presentationMode: ThreadPresentationMode | undefined,
): readonly ModelRef[] {
  if (!presentationMode) return refs;
  return refs.filter((ref) => ref.presentationMode === presentationMode);
}

export function ProviderModelMenu(props: ProviderModelMenuProps) {
  const {
    providers,
    currentAgentKind,
    currentModel,
    lockedAgentKind,
    presentationMode,
    isDisabled,
    hideLabelOnWrap,
    forceHideLabel = false,
    collapseTier,
    openSignal,
    onChange,
    onOpenChange,
  } = props;

  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sessionFavorites, setSessionFavorites] = useState<readonly ModelRef[] | undefined>(
    undefined,
  );
  const [sessionRecents, setSessionRecents] = useState<readonly ModelRef[] | undefined>(undefined);
  const deferredSearch = useDeferredValue(search);
  const searchRef = useRef<HTMLInputElement>(null);
  const windowedListRef = useRef<HTMLDivElement>(null);
  const listboxDomIdPrefix = useId();

  const favorites = useSharedSettings((s) => s.favoriteModels);
  const recents = useSharedSettings((s) => s.recentModels);
  const providerOrder = useSharedSettings((s) => s.providerOrder);
  const hiddenModels = useSharedSettings((s) => s.hiddenModels);
  const providerModelPreferences = useSharedSettings((s) => s.providerModelPreferences);
  const providerConfigs = useSharedSettings((s) => s.providerConfigs);
  const toggleFavoriteModel = useSharedSettings((s) => s.toggleFavoriteModel);
  const latestFavoritesRef = useRef(favorites);
  const latestRecentsRef = useRef(recents);

  const currentProvider =
    providers.find(
      (p) =>
        p.kind === currentAgentKind &&
        (presentationMode === undefined || p.presentationMode === presentationMode),
    ) ?? providers.find((p) => p.kind === currentAgentKind);
  const currentProviderKey = currentProvider ? providerMenuKey(currentProvider) : currentAgentKind;
  const effectiveCurrentModel = normalizeCurrentModelForProvider(currentProvider, currentModel);
  const currentLabel =
    currentProvider?.capabilities.models.find((m) => m.id === effectiveCurrentModel)?.label ??
    effectiveCurrentModel;
  const currentLabelParts = splitModelLabel(currentLabel);
  const currentSubProvider = currentProvider
    ? deriveSubProvider(effectiveCurrentModel, currentProvider.capabilities)
    : undefined;
  const currentDisplayLabel = currentSubProvider
    ? `${currentLabelParts.name} · ${currentSubProvider.label}`
    : currentLabelParts.name;
  latestFavoritesRef.current = favorites;
  latestRecentsRef.current = recents;

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSessionFavorites(latestFavoritesRef.current);
      setSessionRecents(latestRecentsRef.current);
      // On mobile, auto-focusing search would pop the keyboard over the drawer;
      // let the user tap the field if they want to filter.
      if (!mobile) setTimeout(() => searchRef.current?.focus(), 50);
      return;
    }
    setSessionFavorites(undefined);
    setSessionRecents(undefined);
  }, [isOpen, mobile]);

  useEffect(() => {
    if (openSignal === undefined || isDisabled) return;
    setIsOpen(true);
  }, [openSignal, isDisabled]);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    onOpenChange?.(open);
  }

  // Build the row model only while the popover is open. The composer can mount
  // this control twice for wrap measurement, so closed menus should stay as
  // cheap as a trigger label lookup.
  const deferredAgentKind = useDeferredValue(currentAgentKind);
  const deferredModel = useDeferredValue(effectiveCurrentModel);
  const activeFavorites = refsForPresentation(favorites, presentationMode);
  const sectionFavorites = refsForPresentation(
    isOpen ? (sessionFavorites ?? favorites) : favorites,
    presentationMode,
  );
  const sectionRecents = refsForPresentation(
    isOpen ? (sessionRecents ?? recents) : recents,
    presentationMode,
  );
  const items = isOpen
    ? buildProviderModelItems({
        providers,
        search: deferredSearch,
        ...(lockedAgentKind ? { lockedAgentKind } : {}),
        currentAgentKind: deferredAgentKind,
        currentModel: deferredModel,
        favorites: sectionFavorites,
        favoriteStateRefs: activeFavorites,
        recents: sectionRecents,
        hiddenModels,
        providerOrder,
      })
    : [];

  // Highlight the current model wherever it appears (provider section, favorites, recents).
  const selectedKeys = new Set<string>([
    `fav:${currentAgentKind}:${effectiveCurrentModel}`,
    `recent:${currentAgentKind}:${effectiveCurrentModel}`,
    `model:${currentProviderKey}:${effectiveCurrentModel}`,
  ]);

  // Rows mirror the Fast preference saved per model — an explicitly saved value
  // wins, otherwise the app default keeps Fast on for models that support it.
  // This is intentionally not the current draft's toggle: the icon answers
  // "what will selecting this model do", so every row resolves independently.
  function modelFastEnabled(providerKind: string, modelId: string): boolean {
    const saved = providerModelPreferences[providerKind]?.[modelId];
    if (saved) return saved.fast ?? true;
    const legacy = providerConfigs[providerKind];
    if (legacy?.model === modelId && legacy.fast !== undefined) return legacy.fast;
    return true;
  }

  function handleSelect(itemId: string) {
    const selected = items.find((item) => item.id === itemId);
    if (selected?.type !== "model") return;
    if (
      selected.providerKind === currentAgentKind &&
      selected.modelId === effectiveCurrentModel &&
      selected.providerKey === currentProviderKey
    ) {
      handleOpenChange(false);
      return;
    }
    // Close synchronously so the popover starts unmounting immediately, then
    // mark the upstream state cascade as a transition so the parent's effort/
    // context/fast resolution doesn't block the close animation.
    handleOpenChange(false);
    startTransition(() => {
      onChange({
        agentKind: selected.providerKind,
        model: selected.modelId,
        ...(selected.presentationMode ? { presentationMode: selected.presentationMode } : {}),
      });
    });
  }

  const trigger = (
    <Button
      aria-label={t`Select model`}
      isDisabled={(isDisabled ?? false) || providers.length === 0}
      size="sm"
      variant="ghost"
      className="poracode-composer-menu poracode-composer-model-control min-w-0 px-2.5"
      {...(mobile ? { onPress: () => handleOpenChange(true) } : {})}
    >
      <ProviderIcon
        kind={currentAgentKind}
        {...(currentProvider?.icon ? { icon: currentProvider.icon } : {})}
        tone="active"
        className="size-3.5 shrink-0"
      />
      <span
        data-collapse-tier={collapseTier}
        className={
          hideLabelOnWrap
            ? `poracode-composer-label-hideable flex min-w-0 flex-col items-start justify-center gap-0.5${forceHideLabel ? " is-hidden" : ""}`
            : "flex min-w-0 flex-col items-start justify-center gap-0.5"
        }
      >
        <span className="max-w-full truncate leading-tight">
          {currentLabelParts.name || t`Select model`}
        </span>
        {currentSubProvider ? (
          <span className="max-w-full truncate text-[10px] font-medium leading-tight text-muted/70">
            {currentSubProvider.label}
          </span>
        ) : null}
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

  const renderContent = ({ expanded }: { readonly expanded: boolean }) => (
    <>
      <div className="poracode-model-menu-search flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="size-3.5 shrink-0 text-muted" />
        <input
          ref={searchRef}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted outline-none"
          placeholder={t`Search models...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              handleOpenChange(false);
              return;
            }
            if (items.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              windowedListRef.current?.focus();
            }
          }}
        />
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-3 text-center text-sm text-muted">
          <Trans>No models found</Trans>
        </div>
      ) : (
        <WindowedProviderModelList
          domIdPrefix={listboxDomIdPrefix}
          items={items}
          selectedKeys={selectedKeys}
          scrollRef={windowedListRef}
          modelRowHeight={mobile ? MODEL_MENU_ROW_HEIGHT_MOBILE : MODEL_MENU_ROW_HEIGHT}
          mobile={mobile}
          mobileExpanded={mobile && expanded}
          modelFastEnabled={modelFastEnabled}
          toggleFavorite={(providerKind, modelId, rowPresentationMode) =>
            toggleFavoriteModel(
              providerKind,
              modelId,
              rowPresentationMode ?? presentationMode ?? "terminal",
            )
          }
          onSelect={handleSelect}
        />
      )}
    </>
  );

  return (
    <ResponsiveMenuSurface
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      label={t`Select model`}
      trigger={
        !mobile && hideLabelOnWrap ? (
          <Tooltip>
            {trigger}
            <Tooltip.Content placement="top">
              {currentDisplayLabel || t`Select model`}
            </Tooltip.Content>
          </Tooltip>
        ) : (
          trigger
        )
      }
      placement="top start"
      contentClassName="w-96 p-0"
      dialogClassName="flex max-h-[28rem] flex-col overflow-hidden !p-0"
    >
      {renderContent}
    </ResponsiveMenuSurface>
  );
}

function WindowedProviderModelList(props: {
  domIdPrefix: string;
  items: ProviderModelItem[];
  selectedKeys: Set<string>;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Height of a model row; larger on mobile so drawer rows are finger-sized. */
  modelRowHeight: number;
  mobile: boolean;
  mobileExpanded: boolean;
  modelFastEnabled: (providerKind: string, modelId: string) => boolean;
  toggleFavorite: (
    providerKind: string,
    modelId: string,
    presentationMode: ThreadPresentationMode | undefined,
  ) => void;
  onSelect: (itemId: string) => void;
}) {
  const {
    domIdPrefix,
    items,
    selectedKeys,
    scrollRef,
    modelRowHeight,
    mobile,
    mobileExpanded,
    modelFastEnabled,
    toggleFavorite,
    onSelect,
  } = props;
  const { t } = useLingui();
  const [visibleRow, setVisibleRow] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeRowId, setActiveRowId] = useState<string | null>(() => {
    const initialMeta = getWindowedItemsMeta(items, modelRowHeight);
    const initialSelectedIndex = selectedModelIndex(selectedKeys, initialMeta);
    return (
      (initialSelectedIndex >= 0 ? items[initialSelectedIndex]?.id : undefined) ??
      initialMeta.firstModelId
    );
  });
  const shouldAutoScrollRef = useRef(true);
  const shouldCenterActiveRef = useRef(true);
  const ignorePointerRef = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      ignorePointerRef.current = false;
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const meta = getWindowedItemsMeta(items, modelRowHeight);
  const modelRowIndices = meta.modelRowIndices;
  const selectedIndex = selectedModelIndex(selectedKeys, meta);
  const initialActiveRowId =
    (selectedIndex >= 0 ? items[selectedIndex]?.id : undefined) ?? meta.firstModelId;
  const activeIndex = activeRowId == null ? -1 : (meta.itemIndexById.get(activeRowId) ?? -1);

  useEffect(() => {
    if (activeIndex >= 0 && meta.modelPositionByIndex.has(activeIndex)) return;
    setActiveRowId(initialActiveRowId);
  }, [activeIndex, initialActiveRowId, meta]);

  const totalHeight = meta.totalHeight;
  const [browserToolbarClearance] = useState(() => (mobile ? browserToolbarScrollClearance() : 0));
  const scrollEndGapHeight = mobile
    ? MODEL_MENU_MOBILE_SCROLL_END_GAP + browserToolbarClearance
    : MODEL_MENU_LISTBOX_PADDING_BOTTOM;
  const totalScrollHeight = totalHeight + scrollEndGapHeight;
  const maxViewportHeight = mobileExpanded
    ? expandedMobileModelMenuMaxHeight()
    : MODEL_MENU_MAX_HEIGHT;
  const viewportHeight = Math.min(totalScrollHeight, maxViewportHeight);
  const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / modelRowHeight));
  const clampedVisibleRow = Math.min(visibleRow, Math.max(0, items.length - 1));
  const startIndex = Math.max(0, clampedVisibleRow - MODEL_MENU_OVERSCAN_ROWS);
  const endIndex = Math.min(
    items.length,
    startIndex + visibleRowCount + MODEL_MENU_OVERSCAN_ROWS * 2,
  );
  const stickyHeaderIndex = meta.stickyHeaderIndexByRow[clampedVisibleRow] ?? -1;
  const stickyHeader = items[stickyHeaderIndex];
  const stickySubHeaderIndex = meta.stickySubHeaderIndexByRow[clampedVisibleRow] ?? -1;
  const stickySubHeader = items[stickySubHeaderIndex];
  const visibleItemIsPastTop = scrollTop > itemTop(meta, clampedVisibleRow);

  const shouldShowStickyHeader =
    (isPrimaryHeader(stickyHeader) &&
      (stickyHeaderIndex < clampedVisibleRow ||
        (stickyHeaderIndex === clampedVisibleRow && visibleItemIsPastTop))) ||
    (isSubHeader(stickySubHeader) &&
      (stickySubHeaderIndex < clampedVisibleRow ||
        (stickySubHeaderIndex === clampedVisibleRow && visibleItemIsPastTop)));

  const topSpacerHeight = itemTop(meta, startIndex);
  const bottomSpacerHeight =
    Math.max(0, totalHeight - itemTop(meta, endIndex)) + scrollEndGapHeight;
  const visibleItems = items.slice(startIndex, endIndex);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const maxScrollTop = Math.max(0, totalScrollHeight - viewportHeight);
    if (element.scrollTop > maxScrollTop) {
      element.scrollTop = maxScrollTop;
      setScrollTop(maxScrollTop);
      setVisibleRow(itemIndexAtOffset(meta, maxScrollTop));
    }
  }, [meta, scrollRef, totalScrollHeight, viewportHeight]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = 0;
    setScrollTop(0);
    setVisibleRow(0);
    shouldAutoScrollRef.current = true;
    shouldCenterActiveRef.current = true;
  }, [scrollRef, meta.structureKey]);

  useEffect(() => {
    if (activeIndex < 0) return;
    if (!shouldAutoScrollRef.current) return;
    const element = scrollRef.current;
    if (!element) return;
    const activeItem = items[activeIndex];
    if (!activeItem) return;
    const rowTop = itemTop(meta, activeIndex);
    const rowHeight = windowedItemHeight(activeItem, modelRowHeight);
    const rowBottom = rowTop + rowHeight;
    const viewTop = element.scrollTop;
    const visibleHeight = element.clientHeight || viewportHeight;
    const viewBottom = viewTop + visibleHeight;
    const maxScrollTop = Math.max(0, totalScrollHeight - visibleHeight);
    if (shouldCenterActiveRef.current) {
      shouldCenterActiveRef.current = false;
      const centered = rowTop + rowHeight / 2 - visibleHeight / 2;
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, centered));
      if (nextScrollTop !== viewTop) {
        element.scrollTop = nextScrollTop;
        setScrollTop(nextScrollTop);
        setVisibleRow(itemIndexAtOffset(meta, nextScrollTop));
      }
      return;
    }
    if (rowTop < viewTop) {
      element.scrollTop = rowTop;
      setScrollTop(rowTop);
      setVisibleRow(itemIndexAtOffset(meta, rowTop));
      return;
    }
    if (rowBottom > viewBottom) {
      const nextScrollTop = rowBottom - visibleHeight;
      element.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
      setVisibleRow(itemIndexAtOffset(meta, nextScrollTop));
    }
  }, [activeIndex, items, meta, modelRowHeight, scrollRef, totalScrollHeight, viewportHeight]);

  function moveActive(delta: number) {
    if (modelRowIndices.length === 0) return;
    shouldAutoScrollRef.current = true;
    const currentPosition = meta.modelPositionByIndex.get(activeIndex) ?? -1;
    const basePosition = currentPosition < 0 ? (delta > 0 ? -1 : 0) : currentPosition;
    const nextPosition = Math.max(0, Math.min(modelRowIndices.length - 1, basePosition + delta));
    const nextIndex = modelRowIndices[nextPosition];
    if (nextIndex !== undefined) {
      setActiveRowId(items[nextIndex]?.id ?? null);
    }
  }

  return (
    <div
      ref={scrollRef}
      role="listbox"
      aria-label={t`Models`}
      aria-activedescendant={
        activeIndex >= 0 ? `${domIdPrefix}-${items[activeIndex]?.id}` : undefined
      }
      className={`poracode-model-menu-listbox no-scrollbar overflow-y-auto outline-none ${
        mobileExpanded ? "max-h-none" : "max-h-72"
      }`}
      style={{ height: viewportHeight }}
      tabIndex={0}
      onScroll={(event) => {
        const nextScrollTop = event.currentTarget.scrollTop;
        const nextVisibleRow = itemIndexAtOffset(meta, nextScrollTop);
        setScrollTop((currentScrollTop) =>
          currentScrollTop === nextScrollTop ? currentScrollTop : nextScrollTop,
        );
        setVisibleRow((currentVisibleRow) =>
          currentVisibleRow === nextVisibleRow ? currentVisibleRow : nextVisibleRow,
        );
      }}
      onKeyDown={(event) => {
        if (modelRowIndices.length === 0) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActive(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActive(-1);
          return;
        }
        if (event.key === "PageDown") {
          event.preventDefault();
          moveActive(Math.max(1, visibleRowCount - 1));
          return;
        }
        if (event.key === "PageUp") {
          event.preventDefault();
          moveActive(-Math.max(1, visibleRowCount - 1));
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          shouldAutoScrollRef.current = true;
          const firstIndex = modelRowIndices[0];
          if (firstIndex !== undefined) {
            setActiveRowId(items[firstIndex]?.id ?? null);
          }
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          shouldAutoScrollRef.current = true;
          const lastIndex = modelRowIndices[modelRowIndices.length - 1];
          if (lastIndex !== undefined) {
            setActiveRowId(items[lastIndex]?.id ?? null);
          }
          return;
        }
        if ((event.key === "Enter" || event.key === " ") && activeIndex >= 0) {
          event.preventDefault();
          const activeItem = items[activeIndex];
          if (activeItem?.type === "model") {
            onSelect(activeItem.id);
          }
        }
      }}
    >
      {shouldShowStickyHeader ? (
        <StickyWindowedHeader
          headerItem={isPrimaryHeader(stickyHeader) ? stickyHeader : null}
          subHeaderItem={isSubHeader(stickySubHeader) ? stickySubHeader : null}
        />
      ) : null}
      <div style={{ height: topSpacerHeight }} aria-hidden="true" />
      {visibleItems.map((item, visibleIndex) => {
        const itemIndex = startIndex + visibleIndex;
        const isStickyHeaderDuplicate =
          shouldShowStickyHeader &&
          (itemIndex === stickyHeaderIndex || itemIndex === stickySubHeaderIndex);
        const primaryHeaderClassName = isStickyHeaderDuplicate
          ? "invisible mb-1"
          : "relative z-30 mb-1";
        const subHeaderClassName = isStickyHeaderDuplicate ? "invisible mb-1" : "mb-1";
        if (item.type === "header-plain") {
          return <HeaderPlain key={item.id} item={item} className={primaryHeaderClassName} />;
        }
        if (item.type === "header-provider") {
          return <HeaderProvider key={item.id} item={item} className={primaryHeaderClassName} />;
        }
        if (item.type === "header-sub") {
          return <HeaderSub key={item.id} item={item} className={subHeaderClassName} />;
        }
        const isSelected = selectedKeys.has(item.id);
        const isActive = itemIndex === activeIndex;
        return (
          <div
            key={item.id}
            id={`${domIdPrefix}-${item.id}`}
            role="option"
            aria-selected={isSelected}
            data-active={isActive ? "true" : undefined}
            className="poracode-menu-item group mx-1.5 flex cursor-default items-center text-foreground"
            style={{ height: modelRowHeight }}
            onPointerMove={(event) => {
              if (ignorePointerRef.current) return;
              if (event.movementX === 0 && event.movementY === 0) return;
              if (isActive) return;
              shouldAutoScrollRef.current = false;
              setActiveRowId(item.id);
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(item.id);
              }
            }}
            tabIndex={-1}
          >
            <Check
              className={`size-3 shrink-0 transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}
            />
            {(() => {
              // Some providers (Cursor ACP) bake their parameter chips into
              // the label string itself (e.g. "GPT-5.5 · 272K · Medium").
              // Render the head as the model name and the tail as muted hint.
              const { name, hint } = splitModelLabel(item.label);
              const mutedHint = [hint, item.contextDescription].filter(Boolean).join(" · ");
              const rowFastEnabled = modelFastEnabled(item.providerKind, item.modelId);
              const content = (
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="min-w-0 truncate">{name}</span>
                  {item.supportsFast ? (
                    // Filled when Fast mode is saved on for this model,
                    // outlined when it merely supports it or Fast was saved off.
                    <Zap
                      role="img"
                      aria-label={rowFastEnabled ? t`Fast mode` : t`Supports Fast mode`}
                      className={
                        rowFastEnabled
                          ? "size-3 shrink-0 fill-current text-muted"
                          : "size-3 shrink-0 text-muted/60"
                      }
                    />
                  ) : null}
                  {mutedHint ? (
                    <span className="shrink-0 text-[10px] leading-none text-muted/60">
                      · {mutedHint}
                    </span>
                  ) : null}
                </span>
              );
              return item.tooltipDescription ? (
                <Tooltip delay={MODEL_DESCRIPTION_TOOLTIP_DELAY_MS}>
                  {content}
                  <Tooltip.Content
                    placement="right"
                    className="max-w-72 whitespace-normal break-words text-xs"
                  >
                    {item.tooltipDescription}
                  </Tooltip.Content>
                </Tooltip>
              ) : (
                content
              );
            })()}
            {item.showProviderIcon || item.subProviderLabel ? (
              <span className="ml-auto flex min-w-0 max-w-[45%] items-center gap-1 text-muted/70">
                {item.subProviderLabel ? (
                  <span className="min-w-0 truncate text-[10px]">{item.subProviderLabel}</span>
                ) : null}
                {item.showProviderIcon ? (
                  <ProviderIcon
                    kind={item.providerKind}
                    {...(item.providerIcon ? { icon: item.providerIcon } : {})}
                    tone="inactive"
                    className="size-3 shrink-0"
                  />
                ) : null}
              </span>
            ) : null}
            {item.hideFavoriteToggle ? null : (
              <button
                type="button"
                aria-label={item.isFavorite ? t`Remove from favorites` : t`Add to favorites`}
                className={`ml-1 flex size-5 shrink-0 items-center justify-center rounded transition ${
                  item.isFavorite
                    ? "text-foreground"
                    : "text-muted/40 opacity-0 group-hover:opacity-100 hover:text-foreground"
                }`}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavorite(item.providerKind, item.modelId, item.presentationMode);
                }}
              >
                <Star className="size-3.5" fill={item.isFavorite ? "currentColor" : "none"} />
              </button>
            )}
          </div>
        );
      })}
      <div
        className="poracode-model-menu-bottom-spacer"
        data-scroll-end-gap={scrollEndGapHeight}
        style={{ height: bottomSpacerHeight }}
        aria-hidden="true"
      />
    </div>
  );
}

function StickyWindowedHeader(props: {
  headerItem: Extract<ProviderModelItem, { type: "header-plain" | "header-provider" }> | null;
  subHeaderItem: Extract<ProviderModelItem, { type: "header-sub" }> | null;
}) {
  const { headerItem, subHeaderItem } = props;
  let content;
  if (headerItem?.type === "header-plain") {
    content = <HeaderPlain item={headerItem} />;
  } else if (headerItem?.type === "header-provider") {
    content = (
      <HeaderProvider
        item={headerItem}
        {...(subHeaderItem?.label ? { subProviderLabel: subHeaderItem.label } : {})}
      />
    );
  } else if (subHeaderItem?.type === "header-sub") {
    content = <HeaderSub item={subHeaderItem} />;
  } else {
    return null;
  }

  return (
    <div
      data-sticky-windowed-header=""
      className="sticky top-0 z-20 h-0 overflow-visible"
      aria-hidden="true"
    >
      {content}
    </div>
  );
}

function HeaderPlain(props: {
  item: Extract<ProviderModelItem, { type: "header-plain" }>;
  className?: string;
}) {
  const { item, className = "" } = props;
  const { t } = useLingui();
  return (
    <div
      role="presentation"
      className={`${className} flex h-7 items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80`}
    >
      {t(item.label)}
    </div>
  );
}

function HeaderProvider(props: {
  item: Extract<ProviderModelItem, { type: "header-provider" }>;
  subProviderLabel?: string;
  className?: string;
}) {
  const { item, subProviderLabel, className = "" } = props;
  return (
    <div
      role="presentation"
      className={`${className} flex h-7 items-center gap-1.5 border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80`}
    >
      <ProviderIcon
        kind={item.providerKind}
        {...(item.providerIcon ? { icon: item.providerIcon } : {})}
        tone="active"
        className="size-3"
      />
      <span className="min-w-0 truncate">{item.label}</span>
      {subProviderLabel ? (
        <>
          <span className="text-muted/55">·</span>
          <span className="min-w-0 truncate text-muted/70">{subProviderLabel}</span>
        </>
      ) : null}
    </div>
  );
}

function HeaderSub(props: {
  item: Extract<ProviderModelItem, { type: "header-sub" }>;
  className?: string;
}) {
  const { item, className = "" } = props;
  return (
    <div
      role="presentation"
      className={`${className} flex h-7 items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80`}
    >
      {item.label}
    </div>
  );
}
