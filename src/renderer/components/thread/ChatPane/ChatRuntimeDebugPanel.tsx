import { useMemo, useState } from "react";
import { Disclosure } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useAppStore } from "@/renderer/state/appStore";
import type {
  OpenRuntimeRequest,
  RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";

interface ChatRuntimeDebugPanelProps {
  threadId: string;
}

function shortenId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function formatJsonBlock(value: unknown): string {
  if (value === undefined) return "// undefined";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function itemSearchText(item: RuntimeChatItem): string {
  const streamText = Object.entries(item.streams)
    .map(([k, v]) => `${k}\n${v ?? ""}`)
    .join("\n");
  return `${item.id}\n${item.type}\n${item.state}\n${formatJsonBlock(item.payload)}\n${streamText}`.toLowerCase();
}

function requestSearchText(req: OpenRuntimeRequest): string {
  return `${req.requestId}\n${req.requestType}\n${req.receivedAt}\n${formatJsonBlock(req.payload)}`.toLowerCase();
}

function RuntimeItemDebug(props: { index: number; item: RuntimeChatItem }) {
  const { index, item } = props;
  const streamEntries = Object.entries(item.streams);
  const heading = `#${index + 1} ${item.type} · ${item.state} · ${shortenId(item.id)}`;

  return (
    <Disclosure className="border-b border-[color:var(--border)] bg-[var(--composer-surface)] text-[length:var(--lc-chat-font-size-meta)] last:border-b-0">
      <Disclosure.Heading className="px-2 py-0.5">
        <Disclosure.Trigger className="flex w-full min-w-0 items-center gap-2 text-left">
          <code className="min-w-0 flex-1 truncate font-mono text-foreground">{heading}</code>
          <Disclosure.Indicator className="shrink-0 text-[color:var(--muted)]" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="space-y-2 border-t border-[color:var(--border)] px-2 py-1.5">
          <div>
            <p className="mb-0.5 text-[0.85em] font-medium uppercase tracking-wide text-[color:var(--muted)]">
              id
            </p>
            <pre className="max-h-24 overflow-auto rounded-sm bg-foreground/5 p-1.5 font-mono leading-snug whitespace-pre-wrap break-all text-foreground">
              {item.id}
            </pre>
          </div>
          <div>
            <p className="mb-0.5 text-[0.85em] font-medium uppercase tracking-wide text-[color:var(--muted)]">
              payload
            </p>
            <pre className="max-h-[min(12rem,30vh)] overflow-auto rounded-sm bg-foreground/5 p-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-foreground">
              {formatJsonBlock(item.payload)}
            </pre>
          </div>
          {streamEntries.length === 0 ? (
            <p className="text-[color:var(--muted)]">
              <Trans>No content streams.</Trans>
            </p>
          ) : (
            streamEntries.map(([key, text]) => (
              <div key={key}>
                <p className="mb-0.5 text-[0.85em] font-medium uppercase tracking-wide text-[color:var(--muted)]">
                  stream · {key}
                </p>
                <pre className="max-h-[min(16rem,40vh)] overflow-auto rounded-sm bg-foreground/5 p-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-foreground">
                  {text ?? ""}
                </pre>
              </div>
            ))
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

function OpenRequestDebug(props: { index: number; request: OpenRuntimeRequest }) {
  const { index, request } = props;
  const heading = `Request · ${request.requestType} · ${shortenId(request.requestId)}`;

  return (
    <Disclosure className="border-b border-dashed border-[color:var(--border)] bg-[var(--composer-surface)] text-[length:var(--lc-chat-font-size-meta)] last:border-b-0">
      <Disclosure.Heading className="px-2 py-0.5">
        <Disclosure.Trigger className="flex w-full min-w-0 items-center gap-2 text-left">
          <code className="min-w-0 flex-1 truncate font-mono text-foreground">{heading}</code>
          <Disclosure.Indicator className="shrink-0 text-[color:var(--muted)]" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="space-y-1.5 border-t border-[color:var(--border)] px-2 py-1.5">
          <p className="text-[0.85em] text-[color:var(--muted)]">
            <Trans>
              Opened {request.receivedAt} (#{index + 1})
            </Trans>
          </p>
          <pre className="max-h-[min(12rem,30vh)] overflow-auto rounded-sm bg-foreground/5 p-1.5 font-mono leading-snug whitespace-pre-wrap break-words text-foreground">
            {formatJsonBlock(request.payload)}
          </pre>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

/** Inspector for canonical runtime chat items (payload + streams) for one thread. */
export function ChatRuntimeDebugPanel({ threadId }: ChatRuntimeDebugPanelProps) {
  const { t } = useLingui();
  const itemIds = useAppStore((s) => s.runtimeItemIdsByThread[threadId] ?? EMPTY_IDS);
  const itemsById = useAppStore((s) => s.runtimeItemsByIdByThread[threadId] ?? EMPTY_ITEMS_BY_ID);
  const requests = useAppStore((s) => s.runtimeRequestsByThread[threadId] ?? EMPTY_REQ);
  const [query, setQuery] = useState("");

  const items = useMemo(
    () =>
      itemIds.map((itemId) => itemsById[itemId]).filter((item): item is RuntimeChatItem => !!item),
    [itemIds, itemsById],
  );

  const trimmed = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!trimmed) return items;
    return items.filter((item) => itemSearchText(item).includes(trimmed));
  }, [items, trimmed]);
  const filteredRequests = useMemo(() => {
    if (!trimmed) return requests;
    return requests.filter((req) => requestSearchText(req).includes(trimmed));
  }, [requests, trimmed]);

  const totalCount = items.length + requests.length;
  const filteredCount = filteredItems.length + filteredRequests.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[length:var(--lc-chat-font-size-meta)]">
      <div className="shrink-0">
        <input
          type="text"
          className="w-full rounded-md border border-[color:var(--border)] bg-[var(--composer-surface)] px-2 py-1 text-sm text-foreground placeholder:text-muted outline-none focus:border-[color:var(--focus,var(--border))]"
          placeholder={t`Search runtime items…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {trimmed ? (
          <p className="mt-1 text-[0.85em] text-[color:var(--muted)]">
            <Trans>
              {filteredCount} / {totalCount} matches
            </Trans>
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[color:var(--border)] [scrollbar-gutter:stable]">
        {totalCount === 0 ? (
          <p className="p-2 text-[color:var(--muted)]">
            <Trans>No runtime items yet for this thread.</Trans>
          </p>
        ) : filteredCount === 0 ? (
          <p className="p-2 text-[color:var(--muted)]">
            <Trans>No matches for “{query}”.</Trans>
          </p>
        ) : null}
        {filteredItems.map((item) => (
          <RuntimeItemDebug key={item.id} index={items.indexOf(item)} item={item} />
        ))}
        {filteredRequests.length > 0 ? (
          <p className="border-t border-[color:var(--border)] bg-foreground/5 px-2 py-0.5 text-[0.85em] font-medium uppercase tracking-wide text-[color:var(--muted)]">
            <Trans>Open requests</Trans>
          </p>
        ) : null}
        {filteredRequests.map((req) => (
          <OpenRequestDebug key={req.requestId} index={requests.indexOf(req)} request={req} />
        ))}
      </div>
    </div>
  );
}

const EMPTY_IDS = Object.freeze([]) as ReadonlyArray<string>;
const EMPTY_ITEMS_BY_ID = Object.freeze({}) as Readonly<Record<string, RuntimeChatItem>>;
const EMPTY_REQ = Object.freeze([]) as ReadonlyArray<OpenRuntimeRequest>;
