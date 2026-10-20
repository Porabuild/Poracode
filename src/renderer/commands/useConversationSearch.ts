import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/shallow";
import type { ConversationSearchEntry, ConversationSearchPage } from "@/shared/conversationSearch";
import {
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";

export type ConversationSearchSource =
  | { kind: "managed"; activationSeq: number }
  | { kind: "remote"; connectionKey: string; generation: number };
export type ConversationSearchHit = ConversationSearchEntry & {
  source: ConversationSearchSource;
  sourceLabel: string;
  key: string;
};
interface SourcePage {
  source: ConversationSearchSource;
  label: string;
  page: ConversationSearchPage;
}
interface SearchState {
  key: string;
  pageRequest: number;
  pages: SourcePage[];
  failed: boolean;
}
const EMPTY_HITS: ConversationSearchHit[] = [];

/** Each source is queried on its own authenticated leg; ids never cross hosts. */
export function useConversationSearch(queryText: string, enabled: boolean) {
  const activation = useSyncExternalStore(
    subscribeManagedLoopbackActivation,
    readManagedLoopbackActivation,
  );
  const servers = useRemoteServersStore(
    useShallow((state) =>
      state.servers.filter(
        (server) => state.runtime[remoteConnectionKey(server)]?.status === "online",
      ),
    ),
  );
  const [state, setState] = useState<SearchState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pageRequest, setPageRequest] = useState(0);
  const query = queryText.trim();
  const key =
    enabled && query.length >= 2
      ? JSON.stringify([
          query,
          activation?.seq,
          servers.map((server) => [
            remoteConnectionKey(server),
            server.endpoint,
            currentRemoteServerGeneration(remoteConnectionKey(server)),
          ]),
          attempt,
        ])
      : null;
  const readInput = useEffectEvent(() => ({ activation, servers, query, previous: state }));

  useEffect(() => {
    if (!key) return;
    const input = readInput();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const continuation =
      input.previous?.key === key && input.previous.pageRequest < pageRequest
        ? input.previous.pages
        : null;
    const sources = [
      ...(input.activation
        ? [
            {
              source: { kind: "managed", activationSeq: input.activation.seq } as const,
              label: "",
              read: (cursor?: string) =>
                input.activation!.client.searchConversations(
                  { query: input.query, ...(cursor ? { cursor } : {}) },
                  { signal: controller.signal },
                ),
            },
          ]
        : []),
      ...input.servers.map((server) => {
        const connectionKey = remoteConnectionKey(server);
        return {
          source: {
            kind: "remote",
            connectionKey,
            generation: currentRemoteServerGeneration(connectionKey),
          } as const,
          label: server.label,
          read: (cursor?: string) =>
            useRemoteServersStore
              .getState()
              .withClient(connectionKey, (client) =>
                client.searchConversations(
                  { query: input.query, ...(cursor ? { cursor } : {}) },
                  { signal: controller.signal },
                ),
              ),
        };
      }),
    ];
    const run = async (older: SourcePage[] | null) => {
      const responses = await Promise.allSettled(
        sources.map(async (source) => ({
          source: source.source,
          label: source.label,
          page: await (async () => {
            const old = older?.find(
              (page) => JSON.stringify(page.source) === JSON.stringify(source.source),
            )?.page;
            if (old && !old.nextCursor) return old;
            const page = await source.read(old?.nextCursor ?? undefined);
            return old ? { ...page, entries: [...old.entries, ...page.entries] } : page;
          })(),
        })),
      );
      if (controller.signal.aborted) return;
      const pages = responses.flatMap((result, index) => {
        if (result.status === "fulfilled") return [result.value];
        const retained = older?.find(
          (page) => JSON.stringify(page.source) === JSON.stringify(sources[index]!.source),
        );
        return retained ? [retained] : [];
      });
      setState({
        key,
        pageRequest,
        pages,
        failed: sources.length === 0 || responses.some((result) => result.status === "rejected"),
      });
      if (pages.some(({ page }) => page.indexing)) timer = setTimeout(() => void run(null), 150);
    };
    timer = setTimeout(() => void run(continuation), 150);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, pageRequest]);

  const current = key && state?.key === key ? state : null;
  const excluded = useRemoteServersStore((value) => value.excludedProjectIds);
  const entries: ConversationSearchHit[] = current
    ? current.pages.flatMap(({ page, source, label }) =>
        page.entries
          .filter(
            (entry) =>
              source.kind !== "remote" ||
              !excluded[source.connectionKey]?.includes(entry.projectId),
          )
          .map((entry) => ({
            ...entry,
            source,
            sourceLabel: label,
            key: JSON.stringify([source, entry.threadId, entry.itemId]),
          })),
      )
    : EMPTY_HITS;
  return {
    entries,
    loading: key !== null && (current === null || current.pageRequest !== pageRequest),
    indexing: current?.pages.some(({ page }) => page.indexing) ?? false,
    failed: current?.failed ?? false,
    hasMore: current?.pages.some(({ page }) => page.nextCursor !== null) ?? false,
    loadMore: () => setPageRequest((value) => value + 1),
    retry: () => setAttempt((value) => value + 1),
  };
}
