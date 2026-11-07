import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { testThread } from "@/host/db/runtimeItems.testFixtures";
import { boundedShellSnapshotSchema } from "./catalogPageBuilders";
import { measureCatalogBody } from "./catalogPageBudget";
import { computeEtag } from "./httpCompression";
import { resetStableUpdatedAt } from "./stableUpdatedAt";
import {
  CATALOG_SHELL_TIMESTAMP_PLACEHOLDER,
  createCatalogShellPageBody,
  serializeCatalogShellPageBody,
  stampCatalogShellPageBody,
} from "./catalogShellBody";

beforeEach(resetStableUpdatedAt);
afterEach(() => vi.useRealTimers());

it("keeps the previous wire shape and ETag when other catalog views are read", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T00:00:00Z"));
  const first = stampCatalogShellPageBody(createCatalogShellPageBody(snapshot()));
  vi.advanceTimersByTime(1000);
  const otherView = snapshot();
  otherView.threads = [];
  stampCatalogShellPageBody(createCatalogShellPageBody(otherView));
  vi.advanceTimersByTime(1000);
  expect(stampCatalogShellPageBody(createCatalogShellPageBody(snapshot()))).toBe(first);
  // A changed sequence must never reuse a stale client's recovery cursor.
  const fresh = snapshot();
  fresh.snapshotSeq++;
  expect(computeEtag(stampCatalogShellPageBody(createCatalogShellPageBody(fresh)))).not.toBe(
    computeEtag(first),
  );
});

function snapshot() {
  return boundedShellSnapshotSchema.parse({
    snapshotSeq: 7,
    reads: "bounded-v1",
    projects: [],
    threads: [{ ...testThread(), updatedAt: CATALOG_SHELL_TIMESTAMP_PLACEHOLDER }],
    threadsNextCursor: null,
    projectsNextCursor: null,
    runtimeSummariesByThread: {},
    updatedAt: CATALOG_SHELL_TIMESTAMP_PLACEHOLDER,
  });
}

it("stamps only the root timestamp without modifying identical nested fields", () => {
  const body = createCatalogShellPageBody(snapshot());
  const stamped = boundedShellSnapshotSchema.parse(JSON.parse(stampCatalogShellPageBody(body)));
  expect(stamped.updatedAt).not.toBe(CATALOG_SHELL_TIMESTAMP_PLACEHOLDER);
  expect(stamped.threads[0]?.updatedAt).toBe(CATALOG_SHELL_TIMESTAMP_PLACEHOLDER);
});

it("preserves exact wire and decode caps when the host stamps a worker body", () => {
  const body = createCatalogShellPageBody(snapshot());
  expect(measureCatalogBody(stampCatalogShellPageBody(body))).toEqual(
    measureCatalogBody(serializeCatalogShellPageBody(body, CATALOG_SHELL_TIMESTAMP_PLACEHOLDER)),
  );
});

it("keeps ETags identical for unchanged content from independent readers", () => {
  const first = stampCatalogShellPageBody(createCatalogShellPageBody(snapshot()));
  const next = stampCatalogShellPageBody(createCatalogShellPageBody(snapshot()));
  expect(computeEtag(next)).toBe(computeEtag(first));
  const changed = snapshot();
  changed.threads[0]!.title = "Changed";
  expect(computeEtag(stampCatalogShellPageBody(createCatalogShellPageBody(changed)))).not.toBe(
    computeEtag(first),
  );
});
