import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { ListProjectTreeResult, ProjectLocation } from "@/shared/contracts";
import { projectIdentityKey } from "@/shared/projectIdentity";
import { readBridge } from "@/renderer/bridge";

const EMPTY_SET: ReadonlySet<string> = new Set();

interface State {
  byKey: Record<string, ReadonlySet<string>>;
  set: (key: string, names: ReadonlySet<string>) => void;
}

const useStore = create<State>()((setState) => ({
  byKey: {},
  set: (key, names) => setState((state) => ({ byKey: { ...state.byKey, [key]: names } })),
}));

function keyFor(projectLocation: ProjectLocation): string {
  return projectIdentityKey({ location: projectLocation });
}

interface RootRequest {
  promise: Promise<ListProjectTreeResult>;
  owners: Set<() => boolean>;
}

const inFlight = new Map<string, RootRequest>();

function hasCurrentOwner(request: RootRequest): boolean {
  return [...request.owners].some((ownsRoot) => ownsRoot());
}

export function invalidateProjectRoot(projectLocation: ProjectLocation): void {
  inFlight.delete(keyFor(projectLocation));
}

/** Share the root listing with chat validation, but never reuse a departed tree's request. */
export function listProjectRoot(
  projectLocation: ProjectLocation,
  ownsRoot: () => boolean,
): Promise<ListProjectTreeResult> {
  const key = keyFor(projectLocation);
  const pending = inFlight.get(key);
  if (pending && hasCurrentOwner(pending)) {
    pending.owners.add(ownsRoot);
    return pending.promise;
  }
  const request: RootRequest = {
    owners: new Set([ownsRoot]),
    promise: readBridge()
      .listProjectTree({ projectLocation, directoryPath: "" })
      .then((result) => {
        if (inFlight.get(key) === request && hasCurrentOwner(request)) {
          useStore.getState().set(key, new Set(result.entries.map((entry) => entry.name)));
        }
        return result;
      })
      .finally(() => {
        if (inFlight.get(key) === request) inFlight.delete(key);
      }),
  };
  inFlight.set(key, request);
  return request.promise;
}

async function fetchAndCache(
  projectLocation: ProjectLocation,
  ownsRoot: () => boolean,
): Promise<void> {
  const key = keyFor(projectLocation);
  if (useStore.getState().byKey[key]) return;
  await listProjectRoot(projectLocation, ownsRoot);
}

/**
 * Returns top-level entry names for a project. Lazily fetched and cached per
 * `projectLocation`. Returns an empty set while loading or on failure — callers
 * should treat empty as "validation unavailable" rather than "no entries".
 */
export function useProjectRootNames(
  projectLocation: ProjectLocation | undefined,
): ReadonlySet<string> {
  const key = projectLocation ? keyFor(projectLocation) : "";
  const names = useStore((s) => (key ? s.byKey[key] : undefined));
  const ownerRef = useRef({ key, active: false });

  useEffect(() => {
    if (ownerRef.current.key !== key) ownerRef.current = { key, active: false };
    if (!projectLocation) return;
    const owner = ownerRef.current;
    owner.active = true;
    void fetchAndCache(projectLocation, () => owner.active).catch(() => undefined);
    return () => {
      owner.active = false;
    };
  }, [key, projectLocation]);

  return names ?? EMPTY_SET;
}
