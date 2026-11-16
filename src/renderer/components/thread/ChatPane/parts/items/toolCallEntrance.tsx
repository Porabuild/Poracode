import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";

const ToolCallEntranceContext = createContext<RefObject<Set<string> | null> | null>(null);

/** One opening of a transcript, shared by rows that the virtualizer remounts. */
export function ToolCallEntranceScope({
  threadId,
  children,
}: {
  threadId: string;
  children: ReactNode;
}) {
  const itemIds = useAppStore((state) => state.runtimeItemIdsByThread[threadId]);
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) {
    seen.current = new Set(itemIds);
  }
  useEffect(() => {
    // Amortize pruning as the retained transcript window moves; an append
    // should not rebuild an index of the entire transcript.
    if (seen.current!.size <= (itemIds?.length ?? 0) * 2) return;
    const retained = new Set(itemIds);
    for (const id of seen.current!) {
      if (!retained.has(id)) seen.current!.delete(id);
    }
  }, [itemIds]);
  return <ToolCallEntranceContext value={seen}>{children}</ToolCallEntranceContext>;
}

export function useRememberToolCallItems(itemIds: string | readonly string[]) {
  const seen = useContext(ToolCallEntranceContext);
  const previousTail = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const known = seen?.current;
    if (!known) return;
    // Runs after child rows: a live arrival can enter once, while disclosure
    // expansion and a single row becoming a group cannot replay older items.
    if (typeof itemIds === "string") known.add(itemIds);
    else {
      // Live items append. Older prepended history is not observedLive and
      // cannot enter; only the appended suffix needs recording here.
      for (let index = itemIds.length - 1; index >= 0; index--) {
        const id = itemIds[index]!;
        if (id === previousTail.current) break;
        known.add(id);
      }
      previousTail.current = itemIds.at(-1);
    }
  }, [itemIds, seen]);
}

export function ToolCallEnterRow({
  item,
  children,
}: {
  item: RuntimeChatItem;
  children: ReactNode;
}) {
  const seen = useContext(ToolCallEntranceContext);
  const rowRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const known = seen?.current;
    if (!known) return;
    if (item.observedLive && !known.has(item.id)) {
      rowRef.current?.classList.add("animate-tool-call-enter");
    }
    known.add(item.id);
  }, [item.id, item.observedLive, seen]);
  return (
    <div
      ref={rowRef}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.classList.remove("animate-tool-call-enter");
        }
      }}
    >
      {children}
    </div>
  );
}
