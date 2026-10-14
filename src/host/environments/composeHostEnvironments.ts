import { join } from "node:path";
import type { EnvironmentRecord, EnvironmentRuntime } from "@/shared/environments";
import type { SshConnectPayload, SshConnectResult } from "@/shared/ssh";
import type { SshConnectOptions } from "@/host/ssh/sshEnvironmentController";
import { SshConnectionManager } from "@/host/ssh/SshConnectionManager";
import { ensureSshRuntimeBundleAsync } from "@/host/ssh/runtimeBundleAsync";
import type { SshRuntimeBundle } from "@/host/ssh/runtimeBundleShared";
import { SshTrackedCommandRunner } from "@/host/ssh/sshTrackedCommands";
import {
  createEnvironmentTrustAuthority,
  type EnvironmentTrustAuthority,
} from "./environmentTrustAuthority";
import {
  createOpenSshCredentialResolver,
  type EnvironmentCredentialResolver,
} from "./environmentCredentialCustody";
import { EnvironmentStore, type EnvironmentStoreLease } from "./EnvironmentStore";
import {
  EnvironmentRuntimeService,
  type EnvironmentDescriptorReader,
  type EnvironmentStartupOptions,
} from "./environmentRuntimeService";
import {
  environmentAbortError,
  EnvironmentRuntimeError,
  isEnvironmentAbortError,
} from "./environmentRuntimeErrors";

/**
 * Shared host resource composition for server-owned environments (ADR §2/§8,
 * C1 resource slice).
 *
 * It takes root custody that is already held by the composition's owner (a
 * `HostOwnerLease` in-process, or a `HostDataFence` plus the owned data root
 * for the desktop backend child) and declared SSH/runtime-archive inputs, then
 * opens exactly one durable store and constructs the environment runtime
 * service over exactly one SSH manager:
 *
 * - an **owned** manager (default) whose lifecycle this composition joins, or
 * - an **explicitly borrowed** manager the caller already owns (for example
 *   the manager `composeHostServices` created). A borrowed manager is never
 *   disposed here; the composition hands it back with every environment
 *   connection joined, which is the caller's custody proof.
 *
 * Nothing Electron-bound is imported here: the desktop backend child and the
 * standalone server compose the same module, and a device-local SSH utility is
 * never an authority for host-owned environments.
 *
 * Disposal ordering (each step is a precondition for the next):
 * 1. lazy archive preparation is aborted and joined. Aborting is a request,
 *    so disposal waits for the shared preparation promise to actually settle:
 *    an abort-shaped rejection is the expected end of the cancelled stage,
 *    while any other rejection is a real cleanup failure exposed by the
 *    builder and is retained, so the store is never released as if the stage
 *    had joined;
 * 2. the runtime service is stopped and joined. A rejected service disposal is
 *    a failed join and is never marked complete: it is retained and retried by
 *    the next `dispose()` (the corrected service rejects failed joins, retains
 *    custody, and retries outstanding joins);
 * 3. every environment connection is joined through the manager: the owned
 *    manager in full, or per-connection disconnects for a borrowed manager
 *    with a confirmed/outstanding ledger, so a partial failure retries only
 *    the outstanding joins and a vanished record cannot drop a failed join;
 * 4. only then are the trust runner and the store released. The caller
 *    releases the root lease (or data fence) after this promise resolves.
 *
 * The composition's own manager join is the authoritative custody proof
 * regardless of the service's outcome, so a service-side gap can never close
 * the store; `dispose()` resolves only once every stage above confirmed.
 * `start()` and `prepareRuntime()` refuse to launch new work once disposal
 * has started, and a retried `dispose()` repeats only outstanding joins.
 */

/** The SSH verb surface the composition consumes; `SshConnectionManager` satisfies it. */
export interface HostEnvironmentSshManager {
  connect(input: SshConnectPayload, options?: SshConnectOptions): Promise<SshConnectResult>;
  upgrade?(input: SshConnectPayload, options?: SshConnectOptions): Promise<SshConnectResult>;
  /**
   * Cancels pending work for the id and joins its child before stopping the
   * tunnel. The borrow handoff depends on this rejection being truthful.
   */
  disconnect(connectionId: string): Promise<void>;
  onTunnelExit?(listener: (connectionId: string) => void): () => void;
  /** Kills and joins every owned operation, command, and tunnel child. */
  dispose(): Promise<void>;
}

/**
 * Declared runtime-archive and SSH inputs. The host ships these (the desktop
 * package and the standalone install both stage the same assets); absence is
 * expressed by the caller simply not composing environments. `baseDir` decides
 * the bundle cache exactly like `composeHostServices` does.
 */
export interface HostEnvironmentSshInputs {
  readonly mainBundleDir: string;
  readonly agentPluginsDir: string;
  readonly wslHelpersDir: string;
  readonly bundledSkillsDir?: string;
  readonly bundledPluginsDir?: string;
  /** Immutable release archive directory, when the artifact pipeline ships one. */
  readonly preassembledArchiveDir?: string;
  readonly tarCommand?: string;
  readonly sshCommand?: string;
  readonly scpCommand?: string;
  readonly keyscanCommand?: string;
  readonly keygenCommand?: string;
  readonly sshConfigFile?: string;
}

/**
 * A live root-custody capability (for example `HostDataFence`). The composition
 * never re-acquires or releases the root; it only proves custody before each
 * store mutation through the adapted {@link EnvironmentStoreLease}.
 */
export interface HostRootCustodyCapability {
  readonly generation: string;
  assertActive(expectedGeneration?: string): void;
}

export interface ComposeHostEnvironmentsOptions {
  /** The root owner's live capability (a `HostOwnerLease` satisfies it directly). */
  readonly lease: EnvironmentStoreLease;
  /** Owned profile root; the SSH runtime cache is `<baseDir>/ssh-runtime-bundles`. */
  readonly baseDir: string;
  readonly inputs: HostEnvironmentSshInputs;
  /**
   * An explicitly borrowed manager the caller owns (for example the one
   * `composeHostServices` constructed). Mutually exclusive with
   * {@link createSshManager}.
   */
  readonly borrowSshManager?: HostEnvironmentSshManager;
  /** Composition/test seam: construct the owned manager instead of the default. */
  readonly createSshManager?: (
    inputs: HostEnvironmentSshInputs,
    cacheDir: string,
  ) => HostEnvironmentSshManager;
  /** Override the bundle cache directory (defaults to `baseDir/ssh-runtime-bundles`). */
  readonly cacheDir?: string;
  readonly trust?: EnvironmentTrustAuthority;
  readonly credentials?: EnvironmentCredentialResolver;
  readonly runtimeProvider?: () => Promise<EnvironmentRuntime>;
  /**
   * Composition/test seam for lazy archive preparation. Defaults to the shared
   * async bundle builder with the declared inputs.
   */
  readonly prepareRuntimeBundle?: (signal: AbortSignal) => Promise<SshRuntimeBundle>;
  readonly descriptorReader?: EnvironmentDescriptorReader;
  readonly fetchImpl?: typeof fetch;
  readonly startup?: EnvironmentStartupOptions;
  readonly now?: () => number;
  readonly mintEnvironmentId?: () => string;
}

export interface ComposedHostEnvironments {
  /** The one durable store for the leased root. Its lease stays caller-owned. */
  readonly store: EnvironmentStore;
  /** Host-owned lifecycle service the environment routes/gateway consume. */
  readonly runtimeService: EnvironmentRuntimeService;
  /** The single SSH manager in use (owned or explicitly borrowed). */
  readonly sshManager: HostEnvironmentSshManager;
  /** True when this composition constructed the manager and owns its join. */
  readonly ownsSshManager: boolean;
  /**
   * Lazily prepare (once) the content-addressed runtime archive through the
   * shared async bundle tools. The shared preparation is host-owned: an
   * aborted caller detaches without cancelling it, and a failed preparation is
   * forgotten so a later call retries. Once disposal started this refuses to
   * launch new preparation work.
   */
  prepareRuntime(signal?: AbortSignal): Promise<EnvironmentRuntime>;
  /**
   * Reconnect every `desired: enabled` environment, independent of clients.
   * Refuses to launch new reconnect work once disposal started.
   */
  start(): Promise<void>;
  /**
   * Authoritative disposal join. Rejects with an `AggregateError` and retains
   * every handle (including a borrowed manager) when a join is not confirmed;
   * a later call retries the failed lifecycle stages and the outstanding
   * joins. The root custody is never released and `dispose()` resolves only
   * after the store is closed.
   */
  dispose(): Promise<void>;
}

/**
 * Adapt a true root-custody handle to the store's lease seam. `dataRoot` is the
 * owned root that custody covers (the store never opens a root of its own).
 */
export function environmentStoreLeaseFromCustody(
  dataRoot: string,
  custody: HostRootCustodyCapability,
): EnvironmentStoreLease {
  return {
    paths: { dataRoot },
    generation: custody.generation,
    assertActive: (expectedGeneration) => {
      if (expectedGeneration !== undefined && expectedGeneration !== custody.generation) {
        throw new Error("The Poracode root custody generation changed.");
      }
      custody.assertActive();
    },
  };
}

/**
 * Stable remote connection id, mirroring the runtime service's derivation: an
 * adopted legacy id preserves the child's data dir, otherwise the env id.
 * Exported so composition-level joins target exactly the manager's connection.
 */
export function environmentConnectionId(record: EnvironmentRecord): string {
  return record.legacyConnectionIds[0] ?? record.environmentId;
}

/**
 * A cancelled lazy preparation is the expected end of that stage; every other
 * rejection is a real failure the builder exposed.
 */
function isExpectedPreparationEnd(error: unknown): boolean {
  return (
    isEnvironmentAbortError(error) ||
    (error instanceof EnvironmentRuntimeError && error.code === "environment/cancelled")
  );
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(environmentAbortError(signal.reason));
  void promise.catch(() => undefined);
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(environmentAbortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function createSshConnectionManager(
  inputs: HostEnvironmentSshInputs,
  cacheDir: string,
): SshConnectionManager {
  return new SshConnectionManager({
    mainBundleDir: inputs.mainBundleDir,
    agentPluginsDir: inputs.agentPluginsDir,
    wslHelpersDir: inputs.wslHelpersDir,
    cacheDir,
    ...(inputs.bundledSkillsDir === undefined ? {} : { bundledSkillsDir: inputs.bundledSkillsDir }),
    ...(inputs.bundledPluginsDir === undefined
      ? {}
      : { bundledPluginsDir: inputs.bundledPluginsDir }),
    ...(inputs.preassembledArchiveDir === undefined
      ? {}
      : { preassembledArchiveDir: inputs.preassembledArchiveDir }),
    ...(inputs.tarCommand === undefined ? {} : { tarCommand: inputs.tarCommand }),
    ...(inputs.sshCommand === undefined ? {} : { sshCommand: inputs.sshCommand }),
    ...(inputs.scpCommand === undefined ? {} : { scpCommand: inputs.scpCommand }),
    ...(inputs.sshConfigFile === undefined ? {} : { sshConfigFile: inputs.sshConfigFile }),
  });
}

function createRuntimeBundleStage(
  inputs: HostEnvironmentSshInputs,
  cacheDir: string,
): (signal: AbortSignal) => Promise<SshRuntimeBundle> {
  return (signal) =>
    ensureSshRuntimeBundleAsync({
      mainBundleDir: inputs.mainBundleDir,
      agentPluginsDir: inputs.agentPluginsDir,
      wslHelpersDir: inputs.wslHelpersDir,
      cacheDir,
      ...(inputs.bundledSkillsDir === undefined
        ? {}
        : { bundledSkillsDir: inputs.bundledSkillsDir }),
      ...(inputs.bundledPluginsDir === undefined
        ? {}
        : { bundledPluginsDir: inputs.bundledPluginsDir }),
      ...(inputs.preassembledArchiveDir === undefined
        ? {}
        : { preassembledArchiveDir: inputs.preassembledArchiveDir }),
      ...(inputs.tarCommand === undefined ? {} : { tarCommand: inputs.tarCommand }),
      signal,
    });
}

interface HostEnvironmentsCompositionDeps {
  readonly store: EnvironmentStore;
  readonly sshManager: HostEnvironmentSshManager;
  readonly ownsSshManager: boolean;
  readonly trust: EnvironmentTrustAuthority;
  readonly credentials: EnvironmentCredentialResolver;
  readonly trustExecutor: SshTrackedCommandRunner | null;
  readonly bundleStage: (signal: AbortSignal) => Promise<SshRuntimeBundle>;
  readonly runtimeProvider?: () => Promise<EnvironmentRuntime>;
  readonly descriptorReader?: EnvironmentDescriptorReader;
  readonly fetchImpl?: typeof fetch;
  readonly startup?: EnvironmentStartupOptions;
}

class HostEnvironmentsComposition implements ComposedHostEnvironments {
  readonly store: EnvironmentStore;
  readonly runtimeService: EnvironmentRuntimeService;
  readonly sshManager: HostEnvironmentSshManager;
  readonly ownsSshManager: boolean;

  private readonly lifecycle = new AbortController();
  private readonly trustExecutor: SshTrackedCommandRunner | null;
  private readonly bundleStage: (signal: AbortSignal) => Promise<SshRuntimeBundle>;
  private runtimePreparation: Promise<EnvironmentRuntime> | null = null;
  /** A real archive-stage cleanup failure exposed by the builder; retained. */
  private preparationFailure: unknown = null;
  private disposalStarted = false;
  private serviceStopped = false;
  private managerJoined = false;
  private trustDisposed = false;
  private readonly joinedBorrowedConnections = new Set<string>();
  private readonly outstandingBorrowedConnections = new Set<string>();
  private storeClosed = false;
  private disposed = false;
  private disposal: Promise<void> | null = null;

  constructor(deps: HostEnvironmentsCompositionDeps) {
    this.store = deps.store;
    this.sshManager = deps.sshManager;
    this.ownsSshManager = deps.ownsSshManager;
    this.trustExecutor = deps.trustExecutor;
    this.bundleStage = deps.bundleStage;
    this.runtimeService = new EnvironmentRuntimeService({
      store: deps.store,
      ssh: deps.sshManager,
      trust: deps.trust,
      credentials: deps.credentials,
      runtimeProvider: deps.runtimeProvider ?? (() => this.prepareRuntime()),
      ...(deps.descriptorReader === undefined ? {} : { descriptorReader: deps.descriptorReader }),
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      ...(deps.startup === undefined ? {} : { startup: deps.startup }),
    });
  }

  prepareRuntime(signal?: AbortSignal): Promise<EnvironmentRuntime> {
    const shared = this.ensureRuntimePrepared();
    // A caller abort detaches that caller only: the shared preparation is
    // host-owned and continues for the runtime service and other callers.
    return signal === undefined ? shared : raceWithAbort(shared, signal);
  }

  async start(): Promise<void> {
    this.assertWorkAllowed();
    await this.runtimeService.start();
  }

  dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.disposal === null) {
      // Disposal is single-flight: concurrent callers share one attempt, and a
      // failed attempt clears the slot so a later call retries the stages that
      // are still outstanding. New work stays refused either way.
      this.disposalStarted = true;
      this.disposal = this.runDisposal().then(
        () => {
          this.disposed = true;
        },
        (error: unknown) => {
          // Retain every handle: a later dispose() retries the outstanding
          // joins instead of returning a permanently settled promise.
          this.disposal = null;
          throw error;
        },
      );
    }
    return this.disposal;
  }

  private assertWorkAllowed(): void {
    if (this.disposalStarted || this.disposed) {
      throw environmentAbortError("The host environment composition was disposed.");
    }
  }

  private ensureRuntimePrepared(): Promise<EnvironmentRuntime> {
    if (this.disposalStarted || this.disposed) {
      return Promise.reject(
        environmentAbortError("The host environment composition was disposed."),
      );
    }
    if (this.runtimePreparation !== null) return this.runtimePreparation;
    const work = this.bundleStage(this.lifecycle.signal).then((bundle) => ({
      hash: bundle.hash,
      appVersion: bundle.version,
    }));
    this.runtimePreparation = work;
    void work.catch(() => {
      // Explicit retry: a failed preparation is not cached; a later call runs
      // the bundle tools again.
      if (this.runtimePreparation === work) this.runtimePreparation = null;
    });
    return work;
  }

  private async runDisposal(): Promise<void> {
    const preparation = this.runtimePreparation;
    // 1. Stop any future preparation and join the one in flight. The abort is
    //    only a request, so the shared promise must actually settle: an
    //    abort-shaped rejection is the expected end of the cancelled stage,
    //    while any other rejection is a real cleanup failure exposed by the
    //    builder and keeps custody with the failing owner.
    this.lifecycle.abort(environmentAbortError("The host environment composition was disposed."));
    const failures: unknown[] = [];

    if (this.preparationFailure !== null) failures.push(this.preparationFailure);
    if (preparation !== null) {
      const outcome = await preparation.then(
        () => null,
        (error: unknown) => error,
      );
      if (outcome !== null && !isExpectedPreparationEnd(outcome)) {
        this.preparationFailure = outcome;
        failures.push(outcome);
      }
    }

    // 2. Stop host-owned scheduling and join the service's operations. A
    //    rejection is a failed join, never a completed stage: it is retained
    //    and the next dispose() retries the service. The authoritative manager
    //    join below runs regardless, so a service-side gap can never release
    //    custody.
    if (!this.serviceStopped) {
      try {
        await this.runtimeService.dispose();
        this.serviceStopped = true;
      } catch (error) {
        failures.push(error);
      }
    }

    // 3. Authoritative manager join.
    if (this.ownsSshManager) {
      if (!this.managerJoined) {
        try {
          await this.sshManager.dispose();
          this.managerJoined = true;
        } catch (error) {
          failures.push(error);
        }
      }
    } else {
      // Borrowed manager: join every environment connection through the
      // caller's manager and hand custody back untouched. Confirmed joins are
      // not repeated; an outstanding join stays in the ledger even when its
      // record disappears, so a partial failure can never be mistaken for a
      // completed handoff.
      let records: readonly EnvironmentRecord[] = [];
      try {
        records = this.store.listRecords();
      } catch (error) {
        failures.push(error);
      }
      for (const record of records) {
        const connectionId = environmentConnectionId(record);
        if (!this.joinedBorrowedConnections.has(connectionId)) {
          this.outstandingBorrowedConnections.add(connectionId);
        }
      }
      for (const connectionId of [...this.outstandingBorrowedConnections]) {
        try {
          await this.sshManager.disconnect(connectionId);
          this.outstandingBorrowedConnections.delete(connectionId);
          this.joinedBorrowedConnections.add(connectionId);
        } catch (error) {
          failures.push(error);
        }
      }
    }

    // 4. The trust runner and the store close only after every join is
    //    confirmed; a failure keeps the store open (and the handles retained)
    //    for an explicit retry.
    if (failures.length === 0 && !this.trustDisposed && this.trustExecutor !== null) {
      try {
        await this.trustExecutor.dispose();
        this.trustDisposed = true;
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 0 && !this.storeClosed) {
      try {
        await this.store.close();
        this.storeClosed = true;
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Host environment disposal did not confirm every join; handles were retained for a retry.",
        { cause: failures[0] },
      );
    }
  }
}

export async function composeHostEnvironments(
  options: ComposeHostEnvironmentsOptions,
): Promise<ComposedHostEnvironments> {
  if (options.borrowSshManager !== undefined && options.createSshManager !== undefined) {
    throw new Error(
      "A host environment composition either borrows an SSH manager or creates one, never both.",
    );
  }
  const cacheDir = options.cacheDir ?? join(options.baseDir, "ssh-runtime-bundles");
  const store = await EnvironmentStore.open({
    lease: options.lease,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.mintEnvironmentId === undefined
      ? {}
      : { mintEnvironmentId: options.mintEnvironmentId }),
  });
  let sshManager: HostEnvironmentSshManager | null = null;
  let ownsSshManager = false;
  let trustExecutor: SshTrackedCommandRunner | null = null;
  try {
    if (options.borrowSshManager !== undefined) {
      sshManager = options.borrowSshManager;
    } else {
      sshManager = options.createSshManager
        ? options.createSshManager(options.inputs, cacheDir)
        : createSshConnectionManager(options.inputs, cacheDir);
      ownsSshManager = true;
    }
    let trust = options.trust;
    if (trust === undefined) {
      trustExecutor = new SshTrackedCommandRunner();
      trust = createEnvironmentTrustAuthority({
        executor: trustExecutor,
        ...(options.inputs.sshCommand === undefined
          ? {}
          : { sshCommand: options.inputs.sshCommand }),
        ...(options.inputs.keyscanCommand === undefined
          ? {}
          : { keyscanCommand: options.inputs.keyscanCommand }),
        ...(options.inputs.keygenCommand === undefined
          ? {}
          : { keygenCommand: options.inputs.keygenCommand }),
        ...(options.inputs.sshConfigFile === undefined
          ? {}
          : { sshConfigFile: options.inputs.sshConfigFile }),
      });
    }
    return new HostEnvironmentsComposition({
      store,
      sshManager,
      ownsSshManager,
      trust,
      credentials: options.credentials ?? createOpenSshCredentialResolver(),
      trustExecutor,
      bundleStage:
        options.prepareRuntimeBundle ?? createRuntimeBundleStage(options.inputs, cacheDir),
      ...(options.runtimeProvider === undefined
        ? {}
        : { runtimeProvider: options.runtimeProvider }),
      ...(options.descriptorReader === undefined
        ? {}
        : { descriptorReader: options.descriptorReader }),
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.startup === undefined ? {} : { startup: options.startup }),
    });
  } catch (error) {
    // Partial construction rollback: an owned manager is joined, a borrowed
    // one is never touched, and the store writer slot is released. Rollback
    // failures are surfaced beside the primary error instead of masking it.
    const rollbackFailures: unknown[] = [];
    if (ownsSshManager && sshManager !== null) {
      try {
        await sshManager.dispose();
      } catch (failure) {
        rollbackFailures.push(failure);
      }
    }
    if (trustExecutor !== null) {
      try {
        await trustExecutor.dispose();
      } catch (failure) {
        rollbackFailures.push(failure);
      }
    }
    try {
      await store.close();
    } catch (failure) {
      rollbackFailures.push(failure);
    }
    if (rollbackFailures.length > 0) {
      throw new AggregateError(
        [error, ...rollbackFailures],
        "Host environment composition failed and its partial resources did not roll back cleanly.",
        { cause: error },
      );
    }
    throw error;
  }
}
