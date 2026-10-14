import { afterEach, expect, it } from "vitest";
import {
  beginHistorySnapshotRead,
  readHistoryResume,
  noteHistoryRuntimeApplied,
  noteHistoryDeliveryGap,
  forgetHistoryResume,
} from "./historyResumeRegistry";
import {
  noteRendererEventInterestWireCoverage,
  __resetRendererEventInterestsForTest,
} from "./rendererEventInterests";
import {
  rememberRemoteServerThreadItemInterests,
  setRemoteServerThreadItemInterests,
  forgetRemoteServerThreadItemInterests,
  __resetEventSocketRegistryForTest,
} from "./remoteServers/eventSocketRegistry";
import { remoteThreadId } from "./remoteProjection";

afterEach(() => {
  __resetRendererEventInterestsForTest();
  __resetEventSocketRegistryForTest();
  forgetHistoryResume("thread");
  forgetHistoryResume(remoteThreadId("host", "thread"));
});

it("freezes transcript coverage across lost managed interest while retaining delivered control coverage", () => {
  noteRendererEventInterestWireCoverage(["thread"]);
  beginHistorySnapshotRead("thread", "authority").finish("cursor", 10);
  noteRendererEventInterestWireCoverage([]);
  noteHistoryRuntimeApplied("thread", "authority", 12, {
    completeTranscript: false,
    containsBulk: false,
  });
  expect(readHistoryResume("thread", "authority")).toMatchObject({
    appliedSeq: 10,
    controlSeq: 12,
    coverageLost: true,
  });
  noteRendererEventInterestWireCoverage(["thread"]);
  expect(readHistoryResume("thread", "authority")?.appliedSeq).toBe(10);
});

it("requires a snapshot if bulk content was applied before a lost-coverage prefix recovered", () => {
  beginHistorySnapshotRead("thread", "authority").finish("cursor", 10);
  noteHistoryDeliveryGap("thread");
  noteHistoryRuntimeApplied("thread", "authority", 13, {
    completeTranscript: true,
    containsBulk: true,
  });
  expect(readHistoryResume("thread", "authority")).toBeUndefined();
  beginHistorySnapshotRead("thread", "authority").finish("fresh", 13);
  expect(readHistoryResume("thread", "authority")).toMatchObject({
    appliedSeq: 13,
    coverageLost: false,
  });
});

it("keeps a snapshot read honest about controls delivered beyond its pinned prefix", () => {
  const read = beginHistorySnapshotRead("thread", "authority");
  noteHistoryRuntimeApplied("thread", "authority", 12, {
    completeTranscript: false,
    containsBulk: false,
  });
  read.finish("cursor", 10);
  expect(readHistoryResume("thread", "authority")).toMatchObject({
    appliedSeq: 10,
    controlSeq: 12,
    coverageLost: true,
  });
});

it.each(["set", "remember", "forget"] as const)(
  "tracks a remote projected thread's coverage gap through %s",
  (method) => {
    const id = remoteThreadId("host", "thread");
    rememberRemoteServerThreadItemInterests("host", ["thread"]);
    beginHistorySnapshotRead(id, "remote-authority").finish("cursor", 10);
    if (method === "set") setRemoteServerThreadItemInterests("host", []);
    else if (method === "remember") rememberRemoteServerThreadItemInterests("host", []);
    else forgetRemoteServerThreadItemInterests("host");
    expect(readHistoryResume(id, "remote-authority")?.coverageLost).toBe(true);
  },
);
