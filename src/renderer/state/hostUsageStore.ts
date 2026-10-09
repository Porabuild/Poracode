import { create } from "zustand";
import type { UsageSnapshot } from "@/shared/contracts";

export interface HostUsageState {
  snapshots: readonly UsageSnapshot[];
  pending: boolean;
  failed: boolean;
  initialized: boolean;
  readSucceeded: boolean;
  refreshing: boolean;
  updateRequired: boolean;
}
interface HostUsageEntry extends HostUsageState {
  /** Monotonic publication token; never reset or persisted. */
  request: number;
}
const EMPTY_HOST_USAGE: HostUsageEntry = {
  snapshots: [],
  pending: false,
  failed: false,
  request: 0,
  initialized: false,
  readSucceeded: false,
  refreshing: false,
  updateRequired: false,
};
let nextRequest = 0;

function entryFor(hosts: Record<string, HostUsageEntry>, connectionId: string): HostUsageEntry {
  return Object.hasOwn(hosts, connectionId) ? hosts[connectionId]! : EMPTY_HOST_USAGE;
}

/** Volatile, connection-scoped data. Provider/profile IDs are meaningful only on their host. */
export const useHostUsageStore = create<{
  hosts: Record<string, HostUsageEntry>;
  begin(connectionId: string, refresh?: boolean): number;
  complete(
    connectionId: string,
    request: number,
    snapshots: readonly UsageSnapshot[],
    partial?: boolean,
  ): void;
  fail(connectionId: string, request: number, updateRequired?: boolean): void;
  invalidate(connectionId: string): void;
  remove(connectionId: string): void;
}>()((set) => ({
  hosts: {},
  begin: (connectionId, refresh = false) => {
    const request = ++nextRequest;
    set((state) => ({
      hosts: {
        ...state.hosts,
        [connectionId]: {
          ...entryFor(state.hosts, connectionId),
          pending: true,
          refreshing: refresh,
          request,
        },
      },
    }));
    return request;
  },
  complete: (connectionId, request, snapshots, partial = false) =>
    set((state) => {
      const existing = entryFor(state.hosts, connectionId);
      if (existing.request !== request) return state;
      const merged = partial
        ? [
            ...new Map([
              ...existing.snapshots.map((snapshot) => [snapshot.providerId, snapshot] as const),
              ...snapshots.map((snapshot) => [snapshot.providerId, snapshot] as const),
            ]).values(),
          ]
        : snapshots;
      return {
        hosts: {
          ...state.hosts,
          [connectionId]: {
            snapshots: merged,
            pending: false,
            refreshing: false,
            initialized: true,
            readSucceeded: existing.readSucceeded || !existing.refreshing,
            failed: false,
            updateRequired: existing.refreshing ? false : existing.updateRequired,
            request,
          },
        },
      };
    }),
  fail: (connectionId, request, updateRequired = false) =>
    set((state) => {
      const existing = entryFor(state.hosts, connectionId);
      if (existing.request !== request) return state;
      return {
        hosts: {
          ...state.hosts,
          [connectionId]: {
            ...existing,
            pending: false,
            refreshing: false,
            initialized: true,
            failed: true,
            updateRequired,
          },
        },
      };
    }),
  invalidate: (connectionId) =>
    set((state) =>
      Object.hasOwn(state.hosts, connectionId)
        ? {
            hosts: {
              ...state.hosts,
              [connectionId]: {
                ...entryFor(state.hosts, connectionId),
                pending: false,
                refreshing: false,
                request: ++nextRequest,
              },
            },
          }
        : state,
    ),
  remove: (connectionId) =>
    set((state) => {
      const hosts = { ...state.hosts };
      delete hosts[connectionId];
      return { hosts };
    }),
}));

export function useHostUsage(connectionId: string): HostUsageState {
  return useHostUsageStore((state) => entryFor(state.hosts, connectionId));
}
