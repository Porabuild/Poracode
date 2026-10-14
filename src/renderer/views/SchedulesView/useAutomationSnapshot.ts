import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AutomationsSnapshot,
  ScheduleRunInboxQuery,
  ScheduledTask,
  ScheduledTaskRun,
} from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";

const PAGE_SIZE = 50;
const EMPTY: AutomationsSnapshot = { schedules: [], runs: [], unreadCount: 0 };

/** One request generation owns schedules, results and counts across host/query changes. */
export function useAutomationSnapshot(
  machine: string,
  query: ScheduleRunInboxQuery,
  load: (query: ScheduleRunInboxQuery) => Promise<AutomationsSnapshot>,
  loadInbox?: (query: ScheduleRunInboxQuery) => Promise<ScheduledTaskRun[]>,
) {
  const { filter, search } = query;
  const key = JSON.stringify([machine, filter, search ?? ""]);
  const [pages, setPages] = useState({ key, count: 1 });
  const [result, setResult] = useState({
    machine,
    key,
    data: EMPTY,
    loaded: false,
    pages: 0,
    error: "",
  });
  const pageCount = pages.key === key ? pages.count : 1;
  const generation = useRef(0);
  const polling = useRef(false);
  const latest = useRef({ machine, key, filter, search, pageCount, load, loadInbox });
  useEffect(() => {
    latest.current = { machine, key, filter, search, pageCount, load, loadInbox };
  }, [machine, key, filter, search, pageCount, load, loadInbox]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);

  const refresh = useCallback(
    async (scope?: { key: string; pageCount: number; load: typeof load }) => {
      if (
        scope &&
        (scope.key !== latest.current.key ||
          scope.pageCount !== latest.current.pageCount ||
          scope.load !== latest.current.load)
      )
        return;
      const {
        machine: requestMachine,
        key: requestKey,
        filter: requestFilter,
        search: requestSearch,
        pageCount: requestedPages,
        load: requestLoad,
        loadInbox: requestInbox,
      } = latest.current;
      const requestQuery = {
        filter: requestFilter,
        ...(requestSearch ? { search: requestSearch } : {}),
      };
      const request = ++generation.current;
      try {
        let next = await requestLoad({ ...requestQuery, limit: PAGE_SIZE });
        let page = next.runs;
        for (let index = 1; index < requestedPages && page.length === PAGE_SIZE; index++) {
          if (generation.current !== request) return;
          const last = page.at(-1)!;
          const olderQuery = {
            ...requestQuery,
            limit: PAGE_SIZE,
            cursor: `${last.startedAt}|${last.id}`,
          };
          page = requestInbox
            ? await requestInbox(olderQuery)
            : (await requestLoad(olderQuery)).runs;
          next = { ...next, runs: [...next.runs, ...page] };
        }
        if (generation.current !== request) return;
        setResult({
          machine: requestMachine,
          key: requestKey,
          data: next,
          loaded: true,
          pages: requestedPages,
          error: "",
        });
      } catch (failure) {
        if (generation.current === request)
          setResult((current) => ({
            machine: requestMachine,
            key: requestKey,
            data:
              current.machine !== requestMachine
                ? EMPTY
                : current.key === requestKey
                  ? current.data
                  : { ...current.data, runs: [] },
            loaded: true,
            pages: requestedPages,
            error: toErrorMessage(failure),
          }));
        throw failure;
      }
    },
    [],
  );

  useEffect(() => {
    void refresh({ key, pageCount, load }).catch(() => undefined);
    return invalidate;
  }, [key, pageCount, load, refresh, invalidate]);

  const data = result.machine === machine ? result.data : EMPTY;
  const ownsResults = result.key === key;
  const active = data.schedules.some(
    (task) => task.lastStatus === "running" || task.lastStatus === "waiting-for-approval",
  );
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        if (polling.current) return;
        polling.current = true;
        void refresh()
          .catch(() => undefined)
          .finally(() => {
            polling.current = false;
          });
      },
      active ? 2_000 : 15_000,
    );
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  const setTasks = (update: ScheduledTask[] | ((tasks: ScheduledTask[]) => ScheduledTask[])) => {
    if (latest.current.machine !== machine) return;
    invalidate();
    setResult((current) => {
      const previous = current.machine === machine ? current.data : EMPTY;
      return {
        ...current,
        machine,
        key: current.machine === machine ? current.key : latest.current.key,
        loaded: true,
        data: {
          ...previous,
          schedules: typeof update === "function" ? update(previous.schedules) : update,
        },
      };
    });
  };

  return {
    ...data,
    runs: ownsResults ? data.runs : [],
    setTasks,
    loading: !ownsResults || !result.loaded || result.pages < pageCount,
    loadError: ownsResults ? result.error : "",
    refresh,
    hasMore: ownsResults && data.runs.length === PAGE_SIZE * result.pages,
    loadMore: () => setPages({ key, count: pageCount + 1 }),
    resetPages: () => setPages({ key, count: 1 }),
  };
}
