import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEventHandler,
} from "react";
import { useLingui } from "@lingui/react/macro";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { Accessibility } from "@dnd-kit/dom";
import { Tooltip } from "@heroui/react";
import { Plus } from "lucide-react";
import { PoracodeGlyph } from "@/renderer/components/common/PoracodeGlyph";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import type { ThreadPresentationMode } from "@/shared/contracts";
import type { ModelRef } from "./buildItems";
import { ModelShortcutActions } from "./ModelShortcutActions";
import { ModelMenuRow, SortableFavoriteModelRow } from "./ModelMenuRow";
import { MODEL_MENU_ROW_HEIGHT } from "./modelMenuRowMetrics";
import { useFavoriteModelDragAccessibility } from "./useFavoriteModelDragAccessibility";
import type { ProviderModelItem } from "./types";

const MODEL_MENU_EXPANDED_MOBILE_CHROME_HEIGHT = 180;
const MODEL_MENU_PROVIDER_HEADER_BOTTOM_GAP = 4;
const MODEL_MENU_MAX_HEIGHT = 288;
const MODEL_MENU_LISTBOX_PADDING_BOTTOM = 6;
const MODEL_MENU_MOBILE_SCROLL_END_GAP = 32;
const MODEL_MENU_OVERSCAN_ROWS = 16;

interface WindowedItemsMeta {
  structureKey: string;
  selectableRowIndices: number[];
  itemIndexById: Map<string, number>;
  selectablePositionByIndex: Map<number, number>;
  firstSelectableId: string | null;
  stickyHeaderIndexByRow: number[];
  stickySubHeaderIndexByRow: number[];
  itemTopByIndex: number[];
  totalHeight: number;
}

const windowedItemsMetaCache = new WeakMap<
  ProviderModelItem[],
  { rowHeight: number; meta: WindowedItemsMeta }
>();

function windowedItemHeight(item: ProviderModelItem, modelRowHeight: number): number {
  if (
    item.type === "header-plain" ||
    item.type === "header-crews" ||
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
): item is Extract<
  ProviderModelItem,
  { type: "header-plain" | "header-crews" | "header-provider" }
> {
  return (
    item?.type === "header-plain" ||
    item?.type === "header-crews" ||
    item?.type === "header-provider"
  );
}

function isSubHeader(
  item: ProviderModelItem | undefined,
): item is Extract<ProviderModelItem, { type: "header-sub" }> {
  return item?.type === "header-sub";
}

function isSelectableItem(
  item: ProviderModelItem | undefined,
): item is Extract<ProviderModelItem, { type: "model" | "crew" | "new-crew" }> {
  return item?.type === "model" || item?.type === "crew" || item?.type === "new-crew";
}

function getWindowedItemsMeta(
  items: ProviderModelItem[],
  modelRowHeight: number,
): WindowedItemsMeta {
  const cached = windowedItemsMetaCache.get(items);
  if (cached && cached.rowHeight === modelRowHeight) return cached.meta;

  const idParts: string[] = [];
  const selectableRowIndices: number[] = [];
  const itemIndexById = new Map<string, number>();
  const selectablePositionByIndex = new Map<number, number>();
  const stickyHeaderIndexByRow: number[] = [];
  const stickySubHeaderIndexByRow: number[] = [];
  const itemTopByIndex: number[] = [];
  let firstSelectableId: string | null = null;
  let currentStickyHeaderIndex = -1;
  let currentStickySubHeaderIndex = -1;
  let totalHeight = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    idParts.push(item.id);
    itemIndexById.set(item.id, index);
    itemTopByIndex.push(totalHeight);

    if (
      item.type === "header-plain" ||
      item.type === "header-crews" ||
      item.type === "header-provider"
    ) {
      currentStickyHeaderIndex = index;
      currentStickySubHeaderIndex = -1;
    } else if (item.type === "header-sub") {
      currentStickySubHeaderIndex = index;
    }
    if (isSelectableItem(item)) {
      if (firstSelectableId === null) firstSelectableId = item.id;
      selectablePositionByIndex.set(index, selectableRowIndices.length);
      selectableRowIndices.push(index);
    }

    stickyHeaderIndexByRow.push(currentStickyHeaderIndex);
    stickySubHeaderIndexByRow.push(currentStickySubHeaderIndex);
    totalHeight += windowedItemHeight(item, modelRowHeight);
  }

  const meta: WindowedItemsMeta = {
    structureKey: idParts.join("|"),
    selectableRowIndices,
    itemIndexById,
    selectablePositionByIndex,
    firstSelectableId,
    stickyHeaderIndexByRow,
    stickySubHeaderIndexByRow,
    itemTopByIndex,
    totalHeight,
  };
  windowedItemsMetaCache.set(items, { rowHeight: modelRowHeight, meta });
  return meta;
}

function selectedItemIndex(selectedKeys: Set<string>, meta: WindowedItemsMeta): number {
  for (const key of selectedKeys) {
    const index = meta.itemIndexById.get(key);
    if (index !== undefined && meta.selectablePositionByIndex.has(index)) {
      return index;
    }
  }
  return -1;
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

function safeAreaBottomScrollClearance(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;width:0;" +
    "height:env(safe-area-inset-bottom,0px);";
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

export interface WindowedProviderModelListHandle {
  moveActive: (delta: number) => void;
  selectActive: () => void;
}

interface WindowedProviderModelListProps {
  ariaLabel?: string;
  domIdPrefix: string;
  items: ProviderModelItem[];
  selectedKeys: Set<string>;
  /** Height of a model row; larger on mobile so drawer rows are finger-sized. */
  modelRowHeight: number;
  mobile: boolean;
  mobileExpanded: boolean;
  onActiveChange: (itemId: string | null) => void;
  modelFastEnabled: (providerKind: string, modelId: string) => boolean;
  toggleFavorite: (
    providerKind: string,
    modelId: string,
    presentationMode: ThreadPresentationMode | undefined,
  ) => void;
  onSelect: (itemId: string) => void;
  onReorderFavorites: (ordered: readonly ModelRef[]) => void;
  onRemoveRecent: (ref: ModelRef) => void;
  onToggleCrewFavorite: (crewId: string) => void;
  onRemoveRecentCrew: (crewId: string) => void;
}

export const WindowedProviderModelList = forwardRef<
  WindowedProviderModelListHandle,
  WindowedProviderModelListProps
>(function WindowedProviderModelList(props, ref) {
  const {
    domIdPrefix,
    items,
    selectedKeys,
    modelRowHeight,
    mobile,
    mobileExpanded,
    onActiveChange,
    modelFastEnabled,
    toggleFavorite,
    onSelect,
    onReorderFavorites,
    onRemoveRecent,
    onToggleCrewFavorite,
    onRemoveRecentCrew,
  } = props;
  const { t } = useLingui();
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const sortableFavorites = items.filter(
    (item): item is Extract<ProviderModelItem, { type: "model" }> =>
      item.type === "model" && item.favoriteRef !== undefined && item.isFavorite,
  );
  const favoriteIndexById = new Map(sortableFavorites.map((item, index) => [item.id, index]));
  const dragAccessibility = useFavoriteModelDragAccessibility(sortableFavorites);

  const [visibleRow, setVisibleRow] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [activeRowId, setActiveRowId] = useState<string | null>(() => {
    const initialMeta = getWindowedItemsMeta(items, modelRowHeight);
    const initialSelectedIndex = selectedItemIndex(selectedKeys, initialMeta);
    return (
      (initialSelectedIndex >= 0 ? items[initialSelectedIndex]?.id : undefined) ??
      initialMeta.firstSelectableId
    );
  });
  const [showMobileKeyboardHighlight, setShowMobileKeyboardHighlight] = useState(false);
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
  const selectableRowIndices = meta.selectableRowIndices;
  const selectedIndex = selectedItemIndex(selectedKeys, meta);
  const initialActiveRowId =
    (selectedIndex >= 0 ? items[selectedIndex]?.id : undefined) ?? meta.firstSelectableId;
  const activeIndex = activeRowId == null ? -1 : (meta.itemIndexById.get(activeRowId) ?? -1);

  // The active row resets to the selected/first model whenever the current id
  // stops pointing at a model row (e.g. the search narrows the list).
  if (!(activeIndex >= 0 && meta.selectablePositionByIndex.has(activeIndex))) {
    if (activeRowId !== initialActiveRowId) setActiveRowId(initialActiveRowId);
  }

  useEffect(() => {
    onActiveChange(activeIndex >= 0 ? activeRowId : null);
  }, [activeIndex, activeRowId, onActiveChange]);

  const totalHeight = meta.totalHeight;
  const [mobileBottomClearance] = useState(() =>
    mobile ? browserToolbarScrollClearance() + safeAreaBottomScrollClearance() : 0,
  );
  const scrollEndGapHeight = mobile
    ? MODEL_MENU_MOBILE_SCROLL_END_GAP + mobileBottomClearance
    : MODEL_MENU_LISTBOX_PADDING_BOTTOM;
  const totalScrollHeight = totalHeight + scrollEndGapHeight;
  const maxViewportHeight = mobileExpanded
    ? expandedMobileModelMenuMaxHeight()
    : MODEL_MENU_MAX_HEIGHT;
  const viewportHeight = Math.min(totalScrollHeight, maxViewportHeight);
  const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / modelRowHeight));
  const clampedVisibleRow = Math.min(visibleRow, Math.max(0, items.length - 1));
  const normalStartIndex = Math.max(0, clampedVisibleRow - MODEL_MENU_OVERSCAN_ROWS);
  const dragSourceIndex = dragSourceId === null ? -1 : (meta.itemIndexById.get(dragSourceId) ?? -1);
  // Keep the source and the interval to its targets mounted while scrolling;
  // unregistering a virtualized source freezes the sortable operation's index.
  const startIndex =
    dragSourceIndex >= 0 ? Math.min(normalStartIndex, dragSourceIndex) : normalStartIndex;
  const endIndex = Math.min(
    items.length,
    Math.max(
      normalStartIndex + visibleRowCount + MODEL_MENU_OVERSCAN_ROWS * 2,
      dragSourceIndex + 1,
    ),
  );
  const lastFavorite = sortableFavorites.at(-1);
  const lastFavoriteIndex = lastFavorite ? meta.itemIndexById.get(lastFavorite.id) : undefined;
  const dragMaxScrollTop =
    lastFavoriteIndex === undefined
      ? 0
      : Math.max(0, itemTop(meta, lastFavoriteIndex + 1) - viewportHeight);
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

  // Reset the scroll position whenever the row structure changes (search
  // text, favorites, or provider list updates). Compared through a ref: the
  // item list is rebuilt every render, so the effect triggers on the structure
  // key rather than the list/meta identity (a starring toggle must not reset
  // the scroll offset, for example).
  const prevStructureKeyRef = useRef(meta.structureKey);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const structureKey = getWindowedItemsMeta(items, modelRowHeight).structureKey;
    if (prevStructureKeyRef.current === structureKey) return;
    prevStructureKeyRef.current = structureKey;
    element.scrollTop = 0;
    setScrollTop(0);
    setVisibleRow(0);
    shouldAutoScrollRef.current = true;
    shouldCenterActiveRef.current = true;
  }, [scrollRef, items, modelRowHeight]);

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
    if (selectableRowIndices.length === 0) return;
    if (mobile) setShowMobileKeyboardHighlight(true);
    shouldAutoScrollRef.current = true;
    const currentPosition = meta.selectablePositionByIndex.get(activeIndex) ?? -1;
    const basePosition = currentPosition < 0 ? (delta > 0 ? -1 : 0) : currentPosition;
    const nextPosition = Math.max(
      0,
      Math.min(selectableRowIndices.length - 1, basePosition + delta),
    );
    const nextIndex = selectableRowIndices[nextPosition];
    if (nextIndex !== undefined) {
      setActiveRowId(items[nextIndex]?.id ?? null);
    }
  }

  function handleFavoriteDragEnd(event: DragEndEvent) {
    // Suppress the pointer/keyboard activation that finishes the drag.
    requestAnimationFrame(() => {
      draggingRef.current = false;
      setDragSourceId(null);
    });
    const source = event.operation.source;
    if (!source || !isSortable(source)) return;
    if (event.canceled) {
      if (event.operation.activatorEvent instanceof KeyboardEvent) {
        shouldAutoScrollRef.current = true;
        shouldCenterActiveRef.current = false;
        setActiveRowId(String(source.id));
        const index = meta.itemIndexById.get(String(source.id));
        if (scrollRef.current && index !== undefined) {
          const nextScrollTop = Math.min(dragMaxScrollTop, itemTop(meta, index));
          scrollRef.current.scrollTop = nextScrollTop;
          setScrollTop(nextScrollTop);
          setVisibleRow(itemIndexAtOffset(meta, nextScrollTop));
        }
      }
      return;
    }
    const from = favoriteIndexById.get(String(source.id)) ?? -1;
    const to = source.index;
    if (from < 0 || to < 0 || to >= sortableFavorites.length || from === to) return;
    const reordered = [...sortableFavorites];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    // Reordering is deliberate; preserve the viewport instead of treating it
    // like a new search and centering the keyboard-active row again.
    shouldAutoScrollRef.current = false;
    prevStructureKeyRef.current = getWindowedItemsMeta(
      items.map((item) => {
        const index = favoriteIndexById.get(item.id) ?? -1;
        return index >= 0 ? reordered[index]! : item;
      }),
      modelRowHeight,
    ).structureKey;
    onReorderFavorites(reordered.map((item) => item.favoriteRef!));
  }

  useImperativeHandle(ref, () => ({
    moveActive,
    selectActive() {
      const activeItem =
        items[activeIndex] ??
        (meta.selectableRowIndices[0] === undefined
          ? undefined
          : items[meta.selectableRowIndices[0]]);
      if (isSelectableItem(activeItem)) {
        onSelect(activeItem.id);
      }
    },
  }));

  return (
    <DragDropProvider
      plugins={(defaults) =>
        defaults.map((plugin) => (plugin === Accessibility ? dragAccessibility : plugin))
      }
      onDragStart={(event) => {
        draggingRef.current = true;
        setDragSourceId(event.operation.source ? String(event.operation.source.id) : null);
      }}
      onDragEnd={handleFavoriteDragEnd}
    >
      <div
        ref={scrollRef}
        id={`${domIdPrefix}-listbox`}
        role="listbox"
        aria-label={props.ariaLabel ?? t`Models`}
        aria-activedescendant={
          activeIndex >= 0 ? `${domIdPrefix}-${items[activeIndex]?.id}` : undefined
        }
        className={`poracode-model-menu-listbox no-scrollbar overflow-y-auto outline-none ${
          mobileExpanded ? "max-h-none" : "max-h-72"
        }`}
        data-mobile={mobile ? "true" : undefined}
        style={{ height: viewportHeight }}
        tabIndex={0}
        onScroll={(event) => {
          const nextScrollTop = draggingRef.current
            ? Math.min(event.currentTarget.scrollTop, dragMaxScrollTop)
            : event.currentTarget.scrollTop;
          if (event.currentTarget.scrollTop !== nextScrollTop)
            event.currentTarget.scrollTop = nextScrollTop;
          const nextVisibleRow = itemIndexAtOffset(meta, nextScrollTop);
          setScrollTop((currentScrollTop) =>
            currentScrollTop === nextScrollTop ? currentScrollTop : nextScrollTop,
          );
          setVisibleRow((currentVisibleRow) =>
            currentVisibleRow === nextVisibleRow ? currentVisibleRow : nextVisibleRow,
          );
        }}
        onKeyDown={(event) => {
          if (selectableRowIndices.length === 0) return;
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
            if (mobile) setShowMobileKeyboardHighlight(true);
            shouldAutoScrollRef.current = true;
            const firstIndex = selectableRowIndices[0];
            if (firstIndex !== undefined) {
              setActiveRowId(items[firstIndex]?.id ?? null);
            }
            return;
          }
          if (event.key === "End") {
            event.preventDefault();
            if (mobile) setShowMobileKeyboardHighlight(true);
            shouldAutoScrollRef.current = true;
            const lastIndex = selectableRowIndices[selectableRowIndices.length - 1];
            if (lastIndex !== undefined) {
              setActiveRowId(items[lastIndex]?.id ?? null);
            }
            return;
          }
          if ((event.key === "Enter" || event.key === " ") && activeIndex >= 0) {
            event.preventDefault();
            const activeItem = items[activeIndex];
            if (isSelectableItem(activeItem)) {
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
          if (item.type === "header-crews") {
            return <HeaderCrews key={item.id} className={primaryHeaderClassName} />;
          }
          if (item.type === "header-provider") {
            return <HeaderProvider key={item.id} item={item} className={primaryHeaderClassName} />;
          }
          if (item.type === "header-sub") {
            return <HeaderSub key={item.id} item={item} className={subHeaderClassName} />;
          }
          if (item.type === "crew") {
            return (
              <CrewPickerRow
                key={item.id}
                item={item}
                toggleFavorite={() => onToggleCrewFavorite(item.crewId)}
                {...(item.isRecent ? { removeRecent: () => onRemoveRecentCrew(item.crewId) } : {})}
                domId={`${domIdPrefix}-${item.id}`}
                rowHeight={modelRowHeight}
                isSelected={selectedKeys.has(item.id)}
                isActive={itemIndex === activeIndex && (!mobile || showMobileKeyboardHighlight)}
                onPointerMove={(event) => {
                  if (mobile || draggingRef.current || ignorePointerRef.current) return;
                  if (event.movementX === 0 && event.movementY === 0) return;
                  if (itemIndex === activeIndex) return;
                  shouldAutoScrollRef.current = false;
                  setActiveRowId(item.id);
                }}
                onSelect={() => {
                  if (!draggingRef.current) onSelect(item.id);
                }}
              />
            );
          }
          if (item.type === "new-crew") {
            return (
              <NewCrewPickerRow
                key={item.id}
                item={item}
                domId={`${domIdPrefix}-${item.id}`}
                rowHeight={modelRowHeight}
                isActive={itemIndex === activeIndex && (!mobile || showMobileKeyboardHighlight)}
                onPointerMove={(event) => {
                  if (mobile || draggingRef.current || ignorePointerRef.current) return;
                  if (event.movementX === 0 && event.movementY === 0) return;
                  if (itemIndex === activeIndex) return;
                  shouldAutoScrollRef.current = false;
                  setActiveRowId(item.id);
                }}
                onSelect={() => {
                  if (!draggingRef.current) onSelect(item.id);
                }}
              />
            );
          }
          const favoriteIndex = favoriteIndexById.get(item.id) ?? -1;
          // Session favorites stay visible after unstar; preserve their focused row.
          const Row = item.favoriteRef ? SortableFavoriteModelRow : ModelMenuRow;
          const recentRef = item.recentRef;
          return (
            <Row
              key={item.id}
              item={item}
              domId={`${domIdPrefix}-${item.id}`}
              rowHeight={modelRowHeight}
              isSelected={selectedKeys.has(item.id)}
              isActive={itemIndex === activeIndex && (!mobile || showMobileKeyboardHighlight)}
              modelFastEnabled={modelFastEnabled}
              index={favoriteIndex}
              group={domIdPrefix}
              {...(recentRef ? { removeRecent: () => onRemoveRecent(recentRef) } : {})}
              onPointerMove={(event) => {
                if (mobile || draggingRef.current || ignorePointerRef.current) return;
                if (event.movementX === 0 && event.movementY === 0) return;
                if (itemIndex === activeIndex) return;
                shouldAutoScrollRef.current = false;
                setActiveRowId(item.id);
              }}
              onSelect={() => {
                if (!draggingRef.current) onSelect(item.id);
              }}
              toggleFavorite={() => {
                const favorite = item.favoriteRef;
                toggleFavorite(
                  favorite?.agentKind ?? item.providerKind,
                  favorite?.modelId ?? item.modelId,
                  favorite?.presentationMode ?? item.presentationMode,
                );
              }}
            />
          );
        })}
        <div
          className="poracode-model-menu-bottom-spacer"
          data-scroll-end-gap={scrollEndGapHeight}
          style={{ height: bottomSpacerHeight }}
          aria-hidden="true"
        />
      </div>
    </DragDropProvider>
  );
});

function StickyWindowedHeader(props: {
  headerItem: Extract<
    ProviderModelItem,
    { type: "header-plain" | "header-crews" | "header-provider" }
  > | null;
  subHeaderItem: Extract<ProviderModelItem, { type: "header-sub" }> | null;
}) {
  const { headerItem, subHeaderItem } = props;
  let content;
  if (headerItem?.type === "header-plain") {
    content = <HeaderPlain item={headerItem} />;
  } else if (headerItem?.type === "header-crews") {
    content = <HeaderCrews />;
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

function HeaderCrews(props: { className?: string }) {
  return (
    <div
      role="presentation"
      className={`${props.className ?? ""} poracode-model-menu-header poracode-model-menu-header--provider flex h-7 items-center gap-1.5 border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80`}
    >
      <PoracodeGlyph className="size-3 shrink-0" />
      <span>Poracode</span>
    </div>
  );
}

function CrewPickerRow(props: {
  toggleFavorite: () => void;
  removeRecent?: () => void;
  item: Extract<ProviderModelItem, { type: "crew" }>;
  domId: string;
  rowHeight: number;
  isSelected: boolean;
  isActive: boolean;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onSelect: () => void;
}) {
  const {
    item,
    domId,
    rowHeight,
    isSelected,
    isActive,
    onPointerMove,
    onSelect,
    toggleFavorite,
    removeRecent,
  } = props;
  return (
    <div
      id={domId}
      role="option"
      aria-label={`${item.name}, ${item.details.replaceAll("\n", ", ")}`}
      aria-selected={isSelected}
      data-active={isActive ? "true" : undefined}
      className="poracode-menu-item group mx-1.5 flex cursor-default items-center gap-1.5 px-2 text-foreground"
      style={{ height: rowHeight }}
      onPointerMove={onPointerMove}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      tabIndex={-1}
    >
      <Tooltip delay={1000}>
        <Tooltip.Trigger
          className="flex min-w-0 flex-1 items-center gap-1.5"
          role="none"
          tabIndex={-1}
        >
          <span className="min-w-0 truncate text-xs">{item.name}</span>
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted">
            <ProviderIcon kind={item.leadKind} className="size-3 shrink-0" tone="inactive" />
            <span className="truncate">{item.leadLabel}</span>
            {item.helperKinds.length > 0 ? (
              <span className="ml-0.5 flex shrink-0 items-center gap-0.5">
                {item.helperKinds.slice(0, 4).map((kind) => (
                  <ProviderIcon key={kind} kind={kind} className="size-3" tone="inactive" />
                ))}
              </span>
            ) : null}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content
          placement="right"
          className="max-w-72 whitespace-pre-line break-words text-xs"
        >
          {item.details}
        </Tooltip.Content>
      </Tooltip>
      <ModelShortcutActions
        isFavorite={item.isFavorite}
        toggleFavorite={toggleFavorite}
        {...(removeRecent ? { removeRecent } : {})}
      />
    </div>
  );
}

function NewCrewPickerRow(props: {
  item: Extract<ProviderModelItem, { type: "new-crew" }>;
  domId: string;
  rowHeight: number;
  isActive: boolean;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onSelect: () => void;
}) {
  const { item, domId, rowHeight, isActive, onPointerMove, onSelect } = props;
  return (
    <div
      id={domId}
      role="option"
      aria-selected={false}
      data-active={isActive ? "true" : undefined}
      className="poracode-menu-item group mx-1.5 flex cursor-default items-center gap-1.5 px-2 text-foreground"
      style={{ height: rowHeight }}
      onPointerMove={onPointerMove}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      tabIndex={-1}
    >
      <Plus className="size-3.5 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-xs">{item.label}</span>
      <span className="shrink-0 text-[10px] text-muted/80">{item.meta}</span>
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
      className={`${className} poracode-model-menu-header poracode-model-menu-header--plain flex h-7 items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80`}
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
      className={`${className} poracode-model-menu-header poracode-model-menu-header--provider flex h-7 items-center gap-1.5 border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80`}
    >
      <span className="poracode-model-menu-provider-mark contents">
        <ProviderIcon
          kind={item.providerKind}
          {...(item.providerIcon ? { icon: item.providerIcon } : {})}
          fallbackLabel={item.label}
          tone="active"
          className="size-3"
        />
      </span>
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
      className={`${className} poracode-model-menu-header poracode-model-menu-header--sub flex h-7 items-center border-b border-border/40 bg-overlay px-2 text-[10px] font-semibold uppercase tracking-wider text-muted/80`}
    >
      {item.label}
    </div>
  );
}
