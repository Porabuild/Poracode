import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";

export function VirtualizedFileRows<T>(props: {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  scrollElement: HTMLDivElement | null;
  scrollContentElement: HTMLDivElement | null;
  estimateSize: number;
  gap?: number;
  divided?: boolean;
  persistentKeys?: ReadonlySet<string>;
}) {
  const {
    items,
    getKey,
    renderItem,
    scrollElement,
    scrollContentElement,
    estimateSize,
    gap = 0,
    divided = false,
    persistentKeys,
  } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const canVirtualize = Boolean(scrollElement && scrollElement.clientHeight > 0);
  const persistentIndexes = items.flatMap((item, index) =>
    persistentKeys?.has(getKey(item)) ? [index] : [],
  );

  useLayoutEffect(() => {
    if (!scrollElement || !scrollContentElement) return;

    const updateScrollMargin = () => {
      const listElement = listRef.current;
      if (!listElement) return;
      const nextScrollMargin =
        listElement.getBoundingClientRect().top -
        scrollElement.getBoundingClientRect().top +
        scrollElement.scrollTop;
      setScrollMargin((current) => (current === nextScrollMargin ? current : nextScrollMargin));
    };

    updateScrollMargin();
    const observer = new ResizeObserver(updateScrollMargin);
    observer.observe(scrollElement);
    observer.observe(scrollContentElement);
    return () => observer.disconnect();
  }, [scrollElement, scrollContentElement]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimateSize + (divided ? 1 : 0),
    getItemKey: (index) => getKey(items[index]!),
    scrollMargin,
    gap,
    overscan: 6,
    useFlushSync: false,
    enabled: canVirtualize,
    directDomUpdates: true,
    rangeExtractor: (range) => {
      const indexes = new Set(defaultRangeExtractor(range));
      for (const index of persistentIndexes) indexes.add(index);
      return [...indexes].toSorted((a, b) => a - b);
    },
  });

  if (!canVirtualize) {
    return (
      <div
        ref={listRef}
        className={`min-w-0 ${divided ? "divide-y divide-border" : gap > 0 ? "space-y-px" : ""}`}
      >
        {items.slice(0, 17).map((item) => (
          <div key={getKey(item)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <div ref={listRef} className="min-w-0">
      <div ref={virtualizer.containerRef} className="relative min-w-0">
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={`absolute left-0 top-0 w-full ${
                divided && virtualRow.index > 0 ? "border-t border-border" : ""
              }`}
            >
              {renderItem(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
