/**
 * Typed environment store failures. Codes are stable identifiers the future
 * route layer maps to HTTP statuses; messages are fixed and never contain the
 * host data root, credential references, or other private paths.
 */

export type EnvironmentStoreErrorCode =
  | "environment/not-found"
  | "environment/revision-conflict"
  | "environment/legacy-connection-conflict"
  | "environment/identity-changed"
  | "environment/trust-changed"
  | "environment/trust-mismatch"
  | "environment/identifier-collision"
  | "environment/store-closed"
  | "environment/store-locked"
  | "environment/store-busy"
  | "environment/store-limit"
  | "environment/store-corrupt"
  | "environment/store-future-format";

export class EnvironmentStoreError extends Error {
  constructor(
    readonly code: EnvironmentStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class EnvironmentNotFoundError extends EnvironmentStoreError {
  constructor(readonly environmentId: string) {
    super("environment/not-found", `Environment ${environmentId} was not found.`);
  }
}

/** CAS mismatch. No partial write happens; the caller re-reads and retries. */
export class EnvironmentRevisionConflictError extends EnvironmentStoreError {
  constructor(
    readonly environmentId: string,
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super(
      "environment/revision-conflict",
      `Environment ${environmentId} is at revision ${currentRevision}, not ${expectedRevision}.`,
    );
  }
}

/**
 * A legacy connection id is already adopted, this environment already has one,
 * or the id collides with an environment id. The two id namespaces stay
 * disjoint so remote connection custody is globally unique.
 */
export class EnvironmentLegacyConnectionConflictError extends EnvironmentStoreError {
  constructor(
    readonly legacyConnectionId: string,
    readonly reason: "adopted-by-another" | "already-adopted" | "collides-with-environment-id",
  ) {
    super(
      "environment/legacy-connection-conflict",
      reason === "already-adopted"
        ? "This environment already adopted a legacy connection; two legacy identities are never merged."
        : reason === "collides-with-environment-id"
          ? "A legacy connection id may not collide with an environment id."
          : `Legacy connection ${legacyConnectionId} is already adopted by another environment.`,
    );
  }
}

/** A verified child desktopId differs from the recorded one; only manage re-trust may change it. */
export class EnvironmentChildIdentityChangedError extends EnvironmentStoreError {
  constructor(
    readonly environmentId: string,
    readonly recordedDesktopId: string,
    readonly observedDesktopId: string,
  ) {
    super(
      "environment/identity-changed",
      `Environment ${environmentId} is recorded for child ${recordedDesktopId}; ${observedDesktopId} requires an explicit manage action.`,
    );
  }
}

/** A changed observed host-key fingerprint needs an explicit manage re-trust. */
export class EnvironmentTrustChangedError extends EnvironmentStoreError {
  constructor(readonly environmentId: string) {
    super(
      "environment/trust-changed",
      `Environment ${environmentId} has a different observed host key; an explicit manage action is required.`,
    );
  }
}

/** An observed host key contradicts the pinned fingerprint. */
export class EnvironmentTrustMismatchError extends EnvironmentStoreError {
  constructor(readonly environmentId: string) {
    super(
      "environment/trust-mismatch",
      `Environment ${environmentId} observed a host key that does not match its pin.`,
    );
  }
}

/** The id minter returned an id that is already in use. */
export class EnvironmentIdentifierCollisionError extends EnvironmentStoreError {
  constructor(readonly environmentId: string) {
    super("environment/identifier-collision", `Environment id ${environmentId} is already in use.`);
  }
}

export class EnvironmentStoreClosedError extends EnvironmentStoreError {
  constructor() {
    super("environment/store-closed", "The environment store is closed.");
  }
}

/** A second store instance for the same host root would be a second writer. */
export class EnvironmentStoreLockedError extends EnvironmentStoreError {
  constructor() {
    super(
      "environment/store-locked",
      "An environment store is already open for this host data root.",
    );
  }
}

export type EnvironmentStoreLimitReason = "file-bytes" | "environment-count";

/**
 * A read or parse crossed a documented registry bound. Actionable: the caller
 * reports the limit, and an operator decides how to shrink or archive the
 * file. The store refuses and never rewrites the file.
 */
export class EnvironmentStoreLimitError extends EnvironmentStoreError {
  constructor(
    readonly reason: EnvironmentStoreLimitReason,
    readonly limit: number,
  ) {
    super(
      "environment/store-limit",
      reason === "file-bytes"
        ? `The environment store file is larger than the ${limit}-byte read limit.`
        : `The environment store holds more than ${limit} environments.`,
    );
  }
}

/**
 * Too many mutations are already admitted. Actionable: the caller retries
 * after the admitted operations settle instead of growing an unbounded queue.
 */
export class EnvironmentStoreBusyError extends EnvironmentStoreError {
  constructor(readonly limit: number) {
    super(
      "environment/store-busy",
      `The environment store has ${limit} pending mutations; retry once they settle.`,
    );
  }
}

export type EnvironmentStoreFormatReason = "corrupt" | "future-format";

/**
 * The on-disk file is unreadable or was written by a newer format. The store
 * refuses all reads and mutations and never rewrites the file.
 */
export class EnvironmentStoreFormatError extends EnvironmentStoreError {
  constructor(readonly reason: EnvironmentStoreFormatReason) {
    super(
      reason === "future-format" ? "environment/store-future-format" : "environment/store-corrupt",
      reason === "future-format"
        ? "The environment store file uses a newer unsupported format."
        : "The environment store file is unreadable or corrupt.",
    );
  }
}
