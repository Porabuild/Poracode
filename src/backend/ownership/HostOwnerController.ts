import { preparePoracodeDataRoot } from "@/main/poracodeData";
import type { PoracodePaths } from "@/shared/poracodePaths";
import { HostOwnerLease, type HostOwnerKind } from "./hostOwnerLease";
import { resolveHostRootPaths } from "./hostRootPaths";
import { prepareOwnedHostRoot } from "./hostRootManifest";
import {
  getOwnedCredentialCapabilities,
  type HostCredentialCapabilities,
} from "./hostCredentialState";
import {
  getOwnedSecretStorageKey,
  type NativeSecretValue,
  type OwnedSecretKeyOptions,
} from "./ownedSecretKey";
import { stageHostImport } from "./stageHostImport";

/** Private composition state. Never serialize the key or capability into IPC. */
export interface OwnedHostRuntime {
  readonly lease: HostOwnerLease;
  readonly paths: PoracodePaths;
  readonly secretStorageKey: string;
  readonly credentialCapabilities: HostCredentialCapabilities;
}

type StartupPhase =
  | "acquired"
  | "initializing"
  | "initialized"
  | "staging-import"
  | "staged"
  | "ready"
  | "failed"
  | "closing"
  | "closed";

/**
 * One admission boundary for root preparation, import and key initialization.
 * Runtime composition drains services and closes SQLite before calling close().
 */
export class HostOwnerController {
  private phase: StartupPhase = "acquired";
  private readonly cancellation = new AbortController();
  private activeWork: Promise<unknown> | undefined;
  private closing: Promise<void> | undefined;

  private constructor(readonly lease: HostOwnerLease) {}

  static acquire(profileNamespace: string, kind: HostOwnerKind): HostOwnerController {
    return new HostOwnerController(
      HostOwnerLease.acquire(resolveHostRootPaths(profileNamespace), kind),
    );
  }

  initialize(options: OwnedSecretKeyOptions): Promise<OwnedHostRuntime> {
    return this.runExclusive("initializing", "initialized", async () => {
      prepareOwnedHostRoot(this.lease);
      const paths = preparePoracodeDataRoot(this.lease.paths.dataRoot);
      const guardedOptions: OwnedSecretKeyOptions =
        options.mode === "os-sealed"
          ? {
              mode: "os-sealed",
              codec: {
                seal: (request) => this.transformNative(() => options.codec.seal(request)),
                unseal: (request) => this.transformNative(() => options.codec.unseal(request)),
              },
            }
          : options;
      const secretStorageKey = await getOwnedSecretStorageKey(this.lease, guardedOptions);
      this.assertOperationActive();
      return {
        lease: this.lease,
        paths,
        secretStorageKey,
        credentialCapabilities: getOwnedCredentialCapabilities(this.lease),
      };
    });
  }

  stageImport(request: Parameters<typeof stageHostImport>[1]) {
    return this.runExclusive("staging-import", "staged", () =>
      stageHostImport(this.lease, request, this.cancellation.signal),
    );
  }

  markReady(): void {
    this.requirePhase("initialized");
    this.lease.setPhase("ready");
    this.phase = "ready";
  }

  /** Cancellation stops admission; release waits for admitted filesystem work. */
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.phase = "closing";
    this.cancellation.abort(new Error("The Poracode host owner is closing."));
    this.closing = Promise.resolve(this.activeWork)
      .catch(() => undefined)
      .then(() => {
        this.lease.release();
        this.phase = "closed";
      });
    return this.closing;
  }

  private requirePhase(expected: StartupPhase): void {
    this.lease.assertActive();
    if (this.phase !== expected) {
      throw new Error(
        `The Poracode host owner is ${this.phase}; this operation requires ${expected}.`,
      );
    }
  }

  private assertOperationActive(): void {
    this.lease.assertActive();
    this.cancellation.signal.throwIfAborted();
  }

  private runExclusive<T>(
    phase: StartupPhase,
    finished: StartupPhase,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      this.requirePhase("acquired");
    } catch (error) {
      return Promise.reject(error);
    }
    this.phase = phase;
    // Register the operation before any callback, including a synchronous native
    // implementation, can re-enter startup or initiate shutdown.
    const work = Promise.resolve()
      .then(() => {
        this.assertOperationActive();
        return operation();
      })
      .then((value) => {
        this.assertOperationActive();
        this.phase = finished;
        return value;
      })
      .catch((error: unknown) => {
        if (this.cancellation.signal.aborted) throw this.cancellation.signal.reason;
        this.phase = "failed";
        throw error;
      });
    this.activeWork = work;
    return work;
  }

  /**
   * Native callbacks transform bytes only, so shutdown may abandon their reply.
   * The wrapper settles key initialization before releasing the lease; a late
   * native result can never resume key-file writes in this or the next owner.
   */
  private transformNative(operation: () => Promise<NativeSecretValue>): Promise<NativeSecretValue> {
    this.assertOperationActive();
    const signal = this.cancellation.signal;
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      void Promise.resolve()
        .then(() => {
          this.assertOperationActive();
          return operation();
        })
        .then((reply) => {
          this.assertOperationActive();
          resolve(reply);
        })
        .catch(reject)
        .finally(() => signal.removeEventListener("abort", onAbort));
    });
  }
}
