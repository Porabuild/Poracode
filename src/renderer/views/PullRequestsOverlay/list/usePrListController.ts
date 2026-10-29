import { useState } from "react";
import { usePullRequestListData } from "./usePullRequestListData";
import { filterBadgeCount, type PrFilterControls } from "./PrListMenuSections";
import {
  DEFAULT_PR_LIST_FILTERS,
  labelUsage,
  type PrListFilters,
  type PrListSort,
  type PrListState,
} from "./prListModel";

export interface PrListController {
  state: PrListState;
  setState: (state: PrListState) => void;
  sort: PrListSort;
  setSort: (sort: PrListSort) => void;
  filters: PrListFilters;
  setFilters: (filters: PrListFilters) => void;
  data: ReturnType<typeof usePullRequestListData>;
  filterControls: PrFilterControls;
  filterCount: number;
  clearFilters: () => void;
}

export function usePrListController(options: { remoteDesktopId?: string | undefined } = {}) {
  const [state, setState] = useState<PrListState>("open");
  const [sort, setSort] = useState<PrListSort>("updated");
  const [filters, setFilters] = useState<PrListFilters>(DEFAULT_PR_LIST_FILTERS);
  const data = usePullRequestListData({ remoteDesktopId: options.remoteDesktopId, state });
  const accounts = [
    ...new Map(
      data.entries.flatMap((entry) => {
        const key = data.accountKey(entry);
        if (!key) return [];
        const account = entry.summary.pr.source?.account;
        return [
          [key, account ? `${account.login} · ${account.host.replace(/^https:\/\//, "")}` : key],
        ] as const;
      }),
    ).entries(),
  ].toSorted((left, right) => left[1].localeCompare(right[1]));
  const filterControls: PrFilterControls = {
    state,
    onStateChange: setState,
    filters,
    onFiltersChange: setFilters,
    labels: labelUsage(data.entries),
    projects: data.projects,
    accounts,
  };

  return {
    state,
    setState,
    sort,
    setSort,
    filters,
    setFilters,
    data,
    filterControls,
    filterCount: filterBadgeCount(state, filters),
    clearFilters: () => {
      setFilters(DEFAULT_PR_LIST_FILTERS);
      setState("open");
    },
  } satisfies PrListController;
}
