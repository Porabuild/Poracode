import { expect, it } from "vitest";
import { IpcQueueObservations } from "./ipcQueueObservations";
import { IPC_QUEUE_NAMES, type IpcQueueName, type IpcQueueSample } from "./ipcQueueSample";

const sample: IpcQueueSample = {
  formatVersion: 1,
  instanceId: "b4965d9b-68e4-4dcc-8e0e-2edcc15c8447",
  observedAtMonotonicMs: 100,
  waitingMessages: 1,
  waitingEstimatedBytes: 123,
  oldestQueuedMessageAgeMs: 20,
  untimedWaitingMessages: 0,
  peakWaitingMessages: 2,
  peakWaitingEstimatedBytes: 200,
  maxWaitingMessages: 4096,
  maxWaitingEstimatedBytes: 8388608,
  terminalBatchMessages: 0,
  inFlightMessages: 1,
  backpressured: true,
  failed: false,
  sendAttempts: 2,
  sendAttemptEstimatedBytes: 40,
  shedMessages: 0,
  shedEstimatedBytes: 0,
};

it("keeps one current reader per declared queue and refuses arbitrary names", () => {
  const observations = new IpcQueueObservations();
  for (let index = 0; index < 100; index++) {
    expect(observations.register(`arbitrary-${index}` as IpcQueueName, () => sample)).toBe(false);
    for (const name of IPC_QUEUE_NAMES) observations.register(name, () => sample);
  }
  expect(observations.sample().queues).toHaveLength(3);
  observations.register("main-to-backend", () => undefined);
  expect(observations.sample().queues[0]).toEqual({
    name: "main-to-backend",
    status: "unavailable",
  });
});

it("keeps missing generations and failed observations distinct from measured zero", () => {
  const observations = new IpcQueueObservations();
  observations.register("main-to-backend", () => undefined);
  observations.register("backend-to-main", () => {
    throw new Error("private-fixture-value");
  });
  observations.register("supervisor-to-host", () => sample);
  expect(observations.sample().queues).toEqual([
    { name: "main-to-backend", status: "unavailable" },
    { name: "backend-to-main", status: "error" },
    { name: "supervisor-to-host", status: "observed", sample },
  ]);
});

it("projects only the bounded numeric schema and never retains arbitrary properties", () => {
  const observations = new IpcQueueObservations();
  observations.register("main-to-backend", () => ({ ...sample, payload: "private-fixture-value" }));
  expect(observations.sample().queues).toEqual([
    { name: "main-to-backend", status: "observed", sample },
  ]);
});

it.each([
  { instanceId: "private-fixture-value" },
  { waitingEstimatedBytes: Infinity },
  { waitingMessages: -1 },
  { oldestQueuedMessageAgeMs: NaN },
])("marks invalid numeric observations as errors without exposing their values", (invalid) => {
  const observations = new IpcQueueObservations();
  observations.register("main-to-backend", () => ({ ...sample, ...invalid }));
  expect(observations.sample().queues).toEqual([{ name: "main-to-backend", status: "error" }]);
});
