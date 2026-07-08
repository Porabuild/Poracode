import type { ProjectLocation } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useGitStore } from "@/renderer/state/gitStore";

interface ReconcileState {
  projectLocation: ProjectLocation;
  isWorktree: boolean;
  /** Set when a stage/unstage lands while a fetch is already in flight. */
  dirty: boolean;
}

/**
 * Per-storeKey coalescing state. An entry exists only while a fetch is in
 * flight (or a trailing one is queued); it is deleted once the chain drains so
 * the map cannot grow unbounded over the app's lifetime.
 *
 * `git add`/`reset` only touch `.git/index`, which the project watcher
 * deliberately ignores — so no refresh follows a stage/unstage and the
 * optimistic +/- counts would stick. We fetch a full status after each
 * successful bridge call and write git's exact counts, but the user can toggle
 * several files faster than the fetches resolve. On WSL each fetch is a bridge
 * roundtrip, so firing one per click wastes N-1 roundtrips whose results are
 * discarded anyway. Instead we coalesce: while a fetch runs, extra calls just
 * mark the key dirty, and exactly one trailing fetch runs afterwards.
 */
const reconcileStates = new Map<string, ReconcileState>();

/**
 * Fetch a full git status after a successful stage/unstage and write it to the
 * store, replacing the optimistic approximation with git's exact counts. Errors
 * are swallowed (the cached optimistic state stays); callers keep their own
 * `.catch → toast + onRefresh()` for the bridge call itself.
 *
 * Concurrent calls for the same `storeKey` are coalesced. A trailing fetch is
 * always started *after* the last stage/unstage call marked the key dirty, so
 * the final applied status can never predate the newest `git add`/`reset` — the
 * in-flight fetch may have read the index before that write landed.
 */
export async function reconcileStagingStatus(params: {
  projectLocation: ProjectLocation;
  storeKey: string;
  isWorktree: boolean;
}): Promise<void> {
  const { projectLocation, storeKey, isWorktree } = params;

  const inFlight = reconcileStates.get(storeKey);
  if (inFlight) {
    // A fetch is already running for this key; the running fetch may have read
    // the index before the toggle that triggered this call finished. Mark the
    // key dirty to force exactly one trailing fetch, and refresh the params it
    // will use.
    inFlight.projectLocation = projectLocation;
    inFlight.isWorktree = isWorktree;
    inFlight.dirty = true;
    return;
  }

  const state: ReconcileState = { projectLocation, isWorktree, dirty: false };
  reconcileStates.set(storeKey, state);

  // Loop until no newer toggle marked the key dirty while the last fetch ran.
  // Between a fetch resolving and the `while` check there is no `await`, so no
  // other call can slip in unnoticed.
  do {
    state.dirty = false;
    const status = await readBridge()
      .getGitStatus({ projectLocation: state.projectLocation })
      .catch(() => undefined);
    if (status) {
      const store = useGitStore.getState();
      if (state.isWorktree) store.setWorktreeStatus(storeKey, status);
      else store.setStatus(storeKey, status);
    }
  } while (state.dirty);

  reconcileStates.delete(storeKey);
}
