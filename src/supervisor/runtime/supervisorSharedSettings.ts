import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";
import {
  resolveHostResourceAdmissionEvidence,
  type HostResourceAdmissionEvidence,
} from "@/shared/hostResourceAdmission";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  type SharedSettings,
} from "@/shared/settings";
import { decryptSecret, transformSensitiveAgentSecrets } from "../secretStorage";
import {
  resolveHostResourceAdmission,
  type HostResourceAdmissionLastGood,
  type ResolvedHostResourceAdmission,
} from "./hostResourceAdmission";

/**
 * One read of the settings document: normalized typed settings plus the raw
 * admission evidence extracted from the same parsed bytes. The evidence is
 * judged before normalization so an invalid explicit value can never be
 * silently repaired into the unlimited default.
 */
export interface SupervisorSharedSettingsSnapshot {
  settings: SharedSettings;
  admission: HostResourceAdmissionEvidence;
}

function readTypedSettings(settingsPath: string, raw: unknown): SharedSettings {
  try {
    return transformSensitiveAgentSecrets(
      normalizeSharedSettings(raw),
      dirname(settingsPath),
      decryptSecret,
    );
  } catch {
    return { ...defaultSharedSettings };
  }
}

/**
 * Single parse owner for the supervisor. A missing file, an unreadable file
 * and malformed JSON each still return usable defaults for the typed settings
 * (legacy behavior) while the admission evidence is reported honestly.
 */
export function readSupervisorSharedSettingsSnapshot(
  settingsPath: string,
): SupervisorSharedSettingsSnapshot {
  if (!existsSync(settingsPath)) {
    return { settings: { ...defaultSharedSettings }, admission: { kind: "missing" } };
  }
  let contents: string;
  try {
    contents = readFileSync(settingsPath, "utf8");
  } catch {
    return {
      settings: { ...defaultSharedSettings },
      admission: { kind: "unreadable", problem: "settings-document-unreadable" },
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch {
    return {
      settings: { ...defaultSharedSettings },
      admission: { kind: "invalid", problem: "settings-document-unparseable" },
    };
  }
  return {
    settings: readTypedSettings(settingsPath, raw),
    admission: resolveHostResourceAdmissionEvidence(raw),
  };
}

export function readSupervisorSharedSettings(settingsPath: string): SharedSettings {
  return readSupervisorSharedSettingsSnapshot(settingsPath).settings;
}

interface CachedSupervisorSharedSettings {
  settings: SharedSettings;
  admission: ResolvedHostResourceAdmission;
}

/**
 * A freshly attached directory watcher delivers no events until its
 * asynchronous FSEvents/inotify registration completes, so a settings write
 * that lands immediately after attachment can be lost while the cache still
 * serves its pre-attachment read. Measured on macOS: synchronous atomic writes
 * right after attach were lost in ~12% of trials, and registration latency had
 * a ~50 ms tail. Exactly one bounded revalidation per successful attachment
 * clears the cache, so the next read re-reads the document after the observed
 * registration window. This is not a watch-readiness guarantee: registration
 * delayed beyond this interval can still miss a later write. Explicit
 * invalidation remains available. The timer fires once per attachment
 * (normally once per process) and does no IO itself.
 */
const WATCHER_ATTACH_REVALIDATION_MS = 500;

/**
 * The supervisor's settings cache and the one owner of raw admission evidence.
 *
 * `lastGood` survives invalidation and transient read/parse failures: a bad
 * edit can never silently lift a previously valid finite policy. The effective
 * policy only changes when a later read proves new evidence.
 *
 * Propagation is deliberately asynchronous: the directory watcher clears the
 * cache when the settings file is created, written or atomically replaced, and
 * the NEXT read (typed settings or policy) re-reads the file and picks the new
 * values up. There is no commit-linearizable guarantee that a start issued in
 * the same instant as a settings commit already sees it, and a write landing
 * in the watcher's registration window is only revalidated by the bounded
 * attach timer below (or the next explicit invalidation).
 *
 * The watcher observes the containing directory rather than the file itself:
 * atomic writes replace the inode, and a file watcher can both miss the write
 * that lands in its asynchronous registration window and then never fire
 * again. A directory watcher survives replacement; `.tmp` staged writes stay
 * filtered by filename. It stays attached for the cache lifetime — ordinary
 * `invalidate()` only drops the cached document — because closing and
 * re-attaching inside the watcher's own callback re-opens the registration
 * window for every later write.
 */
export class SupervisorSharedSettingsCache {
  private cached: CachedSupervisorSharedSettings | undefined;
  private lastGoodAdmission: HostResourceAdmissionLastGood;
  private watcher: FSWatcher | undefined;
  private attachRevalidationTimer: ReturnType<typeof setTimeout> | undefined;
  private watchFailureWarned = false;

  constructor(private readonly settingsPath: string) {}

  read(): SharedSettings {
    return this.load().settings;
  }

  readFresh(): SharedSettings {
    this.ensureWatcher();
    this.cached = undefined;
    return this.load().settings;
  }

  /**
   * Effective admission policy plus its resolution state, resolved from the
   * same cached document as `read()`. Never opens a second settings store and
   * never reads the file per start once the cache is warm.
   */
  readHostResourceAdmission(): ResolvedHostResourceAdmission {
    return this.load().admission;
  }

  /**
   * Drop the cached document; the next read re-reads the file. The directory
   * watcher stays attached: it survives atomic replacement, and closing it
   * here would leave the following read relying on a freshly registered
   * watcher that cannot replay the write that triggered this invalidation.
   */
  invalidate(): void {
    this.cached = undefined;
  }

  dispose(): void {
    this.closeWatcher();
    this.cached = undefined;
    this.lastGoodAdmission = undefined;
  }

  private load(): CachedSupervisorSharedSettings {
    this.ensureWatcher();
    if (this.cached) return this.cached;
    const snapshot = readSupervisorSharedSettingsSnapshot(this.settingsPath);
    const admission = resolveHostResourceAdmission(snapshot.admission, this.lastGoodAdmission);
    this.lastGoodAdmission = admission.lastGood;
    this.cached = { settings: snapshot.settings, admission };
    return this.cached;
  }

  private ensureWatcher(): void {
    if (this.watcher) return;
    try {
      const directory = dirname(this.settingsPath);
      const filename = basename(this.settingsPath);
      const watcher = watch(directory, (_event, changed) => {
        if (changed !== null && changed !== filename) return;
        this.invalidate();
      });
      this.watcher = watcher;
      this.watchFailureWarned = false;
      // The previous cache may predate file creation or a failed watch setup.
      // Read only after attaching: the new watcher cannot replay those writes.
      this.cached = undefined;
      watcher.on("error", () => {
        // A dead watcher is re-armed by the next read; never leave this
        // instance attached, or the cache would stop observing changes.
        this.closeWatcher(watcher);
        this.cached = undefined;
      });
      this.scheduleAttachRevalidation();
    } catch (error) {
      this.warnWatchRegistrationFailure(error);
    }
  }

  private scheduleAttachRevalidation(): void {
    this.clearAttachRevalidation();
    const timer = setTimeout(() => {
      this.attachRevalidationTimer = undefined;
      this.cached = undefined;
    }, WATCHER_ATTACH_REVALIDATION_MS);
    if (typeof timer.unref === "function") timer.unref();
    this.attachRevalidationTimer = timer;
  }

  private clearAttachRevalidation(): void {
    if (this.attachRevalidationTimer === undefined) return;
    clearTimeout(this.attachRevalidationTimer);
    this.attachRevalidationTimer = undefined;
  }

  /** Closes the current watcher; `expected` guards a stale watcher's late error. */
  private closeWatcher(expected?: FSWatcher): void {
    if (expected !== undefined && this.watcher !== expected) return;
    this.watcher?.close();
    this.watcher = undefined;
    this.clearAttachRevalidation();
  }

  /**
   * Bounded diagnosis for a watch that cannot be established (missing
   * directory, EMFILE/ENOSPC, unsupported filesystem). At most one warning per
   * failure episode: repeated failed reads stay silent, and a later successful
   * attachment re-arms the warning. The message never carries the settings
   * path or document, only the OS error code.
   */
  private warnWatchRegistrationFailure(error: unknown): void {
    if (this.watchFailureWarned) return;
    this.watchFailureWarned = true;
    const code = (error as { code?: unknown } | null)?.code;
    const codeSuffix = typeof code === "string" ? ` (${code})` : "";
    console.warn(
      `[supervisor] shared settings directory watch could not be established${codeSuffix}; ` +
        "settings changes propagate only on explicit invalidation until a watch is established",
    );
  }
}
