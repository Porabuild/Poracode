import { createRequire } from "node:module";

/**
 * How long the first byte (or first `download-progress`) may take. Blockmap
 * fetches for a differential update are small; anything longer is a hung
 * GitHub/Azure range request, not a slow delta.
 */
export const UPDATE_DOWNLOAD_FIRST_PROGRESS_STALL_MS = 30_000;

/** After progress has started, allow a longer quiet period before giving up. */
export const UPDATE_DOWNLOAD_PROGRESS_STALL_MS = 90_000;

export class UpdateDownloadStallError extends Error {
  constructor() {
    super("Updater download stalled.");
    this.name = "TimeoutError";
  }
}

export interface UpdaterCancelToken {
  cancel(): void;
}

export interface DownloadStallWatch {
  readonly stalled: boolean;
  markProgress(): void;
  start(token: UpdaterCancelToken): void;
  stop(): void;
}

export function createDownloadStallWatch(options?: {
  firstProgressStallMs?: number;
  progressStallMs?: number;
  now?: () => number;
}): DownloadStallWatch {
  const firstProgressStallMs =
    options?.firstProgressStallMs ?? UPDATE_DOWNLOAD_FIRST_PROGRESS_STALL_MS;
  const progressStallMs = options?.progressStallMs ?? UPDATE_DOWNLOAD_PROGRESS_STALL_MS;
  const now = options?.now ?? Date.now;
  let lastAt = 0;
  let seenProgress = false;
  let stalled = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let token: UpdaterCancelToken | null = null;

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    token = null;
  }

  return {
    get stalled() {
      return stalled;
    },
    markProgress() {
      seenProgress = true;
      lastAt = now();
    },
    start(nextToken) {
      stop();
      token = nextToken;
      stalled = false;
      seenProgress = false;
      lastAt = now();
      timer = setInterval(() => {
        const limit = seenProgress ? progressStallMs : firstProgressStallMs;
        if (now() - lastAt < limit) return;
        stalled = true;
        const toCancel = token;
        stop();
        toCancel?.cancel();
      }, 1_000);
      timer.unref?.();
    },
    stop,
  };
}

export function createUpdaterCancellationToken(): UpdaterCancelToken {
  const requireFromHere = createRequire(import.meta.url);
  const requireFromUpdater = createRequire(requireFromHere.resolve("electron-updater"));
  const runtime = requireFromUpdater("builder-util-runtime") as {
    CancellationToken: new () => UpdaterCancelToken;
  };
  return new runtime.CancellationToken();
}

/**
 * Prefer electron-updater's differential download (the small nightly delta).
 * If GitHub's Azure CDN range/blockmap hop stalls with no progress, cancel and
 * retry once as a full download so the UI cannot sit at 0% forever.
 */
export async function downloadUpdateWithStallFallback(
  downloadUpdate: (token: UpdaterCancelToken) => Promise<unknown>,
  setDifferentialDisabled: (disabled: boolean) => void,
  options?: {
    createToken?: () => UpdaterCancelToken;
    stallWatch?: DownloadStallWatch;
  },
): Promise<void> {
  const createToken = options?.createToken ?? createUpdaterCancellationToken;
  const stallWatch = options?.stallWatch ?? createDownloadStallWatch();

  async function attempt(disableDifferential: boolean): Promise<void> {
    const token = createToken();
    setDifferentialDisabled(disableDifferential);
    stallWatch.start(token);
    try {
      await downloadUpdate(token);
    } finally {
      stallWatch.stop();
      if (disableDifferential) setDifferentialDisabled(false);
    }
  }

  try {
    await attempt(false);
  } catch (error) {
    if (!stallWatch.stalled) throw error;
    console.warn("[poracode] updater differential download stalled; retrying as a full download.");
    try {
      await attempt(true);
    } catch (fullError) {
      if (stallWatch.stalled) throw new UpdateDownloadStallError();
      throw fullError;
    }
  }
}
