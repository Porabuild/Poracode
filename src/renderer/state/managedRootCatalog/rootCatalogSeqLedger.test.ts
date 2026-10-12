import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";
import type { SupervisorEvent } from "@/shared/ipc";

/**
 * Mixed-space seq pressure against the root catalog's seq ledger (§0.6): the
 * ledger must be fed by the LOOPBACK dispatch space only. Desktop-internal
 * `ipc` frames (`provider-usage*`, `thread-osc-*`, `thread-voice`,
 * `thread-scrollback-resync`, …) carry an independent sequence whose head must
 * never raise `rootConnectionSeq` or a thread's applied seq — otherwise the
 * controller's "live event newer than page" comparisons run against a head
 * above the true shared one and under-protect walk-absent rows.
 */

const harness = vi.hoisted(() => ({
  supervisorListeners: [] as Array<
    (event: SupervisorEvent, seq?: number, space?: EventSequenceSpace) => void
  >,
  provider: null as null | {
    connectionSeq: (connectionKey: string) => number;
    appliedThreadSeq: (connectionKey: string, threadId: string) => number | undefined;
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    onSupervisorEvent: (
      listener: (event: SupervisorEvent, seq?: number, space?: EventSequenceSpace) => void,
    ) => {
      harness.supervisorListeners.push(listener);
      return () => {
        const index = harness.supervisorListeners.indexOf(listener);
        if (index >= 0) harness.supervisorListeners.splice(index, 1);
      };
    },
  }),
}));

vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readManagedLoopbackActivation: () => null,
}));

vi.mock("@/renderer/state/remoteServers/catalog/boundedCatalogController", () => ({
  configureBoundedCatalogController: vi.fn<
    (config: unknown, provider: NonNullable<typeof harness.provider>) => void
  >((_config, provider) => {
    harness.provider = provider;
  }),
  beginBoundedCatalogAttempt: vi.fn<(connectionKey: string) => void>(),
  disposeBoundedCatalog: vi.fn<(connectionKey: string) => void>(),
  installBoundedCatalogShellPage: vi.fn<(connectionKey: string, page: unknown) => void>(),
  noteBoundedCatalogMembershipEvent: vi.fn<(connectionKey: string, eventType: string) => void>(),
  requestManualPaintRefresh: vi.fn<(connectionKey: string, kind: string) => void>(),
  resetBoundedCatalogForResync: vi.fn<(connectionKey: string) => void>(),
}));

// The ledger test runs without a client runtime: the managed-desktop runtime
// predicate is the only gate `installManagedRootCatalogRuntime` consults.
vi.mock("./rootCatalogCommands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./rootCatalogCommands")>()),
  isManagedRootDesktopRuntime: () => true,
}));

import {
  MANAGED_ROOT_CATALOG_KEY,
  installManagedRootCatalogRuntime,
  __resetManagedRootCatalogRuntimeForTest,
} from "./rootCatalogAdapter";

function dispatch(event: SupervisorEvent, seq: number, space: EventSequenceSpace): void {
  for (const listener of harness.supervisorListeners) listener(event, seq, space);
}

describe("managed root catalog seq ledger spaces", () => {
  beforeEach(() => {
    harness.supervisorListeners.splice(0);
    harness.provider = null;
    installManagedRootCatalogRuntime();
  });

  afterEach(() => {
    __resetManagedRootCatalogRuntimeForTest();
    vi.clearAllMocks();
  });

  it("feeds the ledger from the loopback space only, never the desktop-internal ipc space", () => {
    dispatch({ type: "thread-reset", threadId: "t-a" }, 5, "loopback");
    // Desktop-internal pressure for the SAME thread, far above the shared head.
    dispatch(
      {
        type: "thread-osc-notification",
        threadId: "t-a",
        title: "Done",
        body: "Turn finished",
      },
      900,
      "ipc",
    );

    expect(harness.provider).not.toBeNull();
    expect(harness.provider!.connectionSeq(MANAGED_ROOT_CATALOG_KEY)).toBe(5);
    expect(harness.provider!.appliedThreadSeq(MANAGED_ROOT_CATALOG_KEY, "t-a")).toBe(5);

    // An ipc-space event for a thread the ledger has never seen must not
    // create an applied entry either.
    dispatch({ type: "thread-scrollback-resync", threadId: "t-b" }, 901, "ipc");
    expect(harness.provider!.appliedThreadSeq(MANAGED_ROOT_CATALOG_KEY, "t-b")).toBeUndefined();
    expect(harness.provider!.connectionSeq(MANAGED_ROOT_CATALOG_KEY)).toBe(5);

    // Later loopback pressure still raises the ledger.
    dispatch({ type: "thread-exited", threadId: "t-a", exitCode: null }, 6, "loopback");
    expect(harness.provider!.connectionSeq(MANAGED_ROOT_CATALOG_KEY)).toBe(6);
    expect(harness.provider!.appliedThreadSeq(MANAGED_ROOT_CATALOG_KEY, "t-a")).toBe(6);
  });
});
