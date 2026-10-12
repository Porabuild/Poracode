import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import catalog from "./fixtures/sdk-models.json";
import type { CursorSdkWorkerEvent } from "./sdkWorkerProtocol";
import { createCursorSdkWorkerHarness } from "./sdkWorkerTestHarness";

describe("Cursor SDK 1.0.37 isolated worker", () => {
  it.each([true, false])(
    "qualifies a resumed model without a per-send override (exposed=%s)",
    async (exposed) => {
      const source = exposed
        ? sdkSource.replace(
            'this.agentId = "agent-1";',
            'this.agentId = "agent-1"; this.model = options.model;',
          )
        : sdkSource;
      const harness = await createHarness(source);
      const model = { id: "grok-4.7", params: [{ id: "context", value: "500k" }] };
      await harness.client.initialize({
        resumeAgentId: "agent-1",
        createOptions: { model, local: { cwd: harness.directory } },
      });
      const events: CursorSdkWorkerEvent[] = [];
      harness.client.onEvent((event) => events.push(event));
      await harness.client.start({ message: "hello" });
      await vi.waitFor(() => expect(events.some((event) => event.type === "result")).toBe(true));
      const result = events.find((event) => event.type === "result");
      expect(
        result?.type === "result" ? JSON.parse(result.result.result!) : undefined,
      ).toMatchObject({ maxMode: true, parameters: model.params });
      await harness.client.dispose();
    },
  );

  it("can resume and read history while the catalog is unavailable", async () => {
    const source = sdkSource.replace(
      `list: async () => ${JSON.stringify(catalog)}`,
      'list: async () => { throw new Error("The model catalog is unavailable."); }',
    );
    const harness = await createHarness(source);
    await harness.client.initialize({
      resumeAgentId: "agent-1",
      createOptions: {
        model: { id: "grok-4.7", params: [{ id: "context", value: "500k" }] },
        local: { cwd: harness.directory },
      },
    });
    await expect(harness.client.listMessages()).resolves.toEqual([]);
    await expect(harness.client.start({ message: "hello" })).rejects.toThrow(
      "The model catalog is unavailable.",
    );
    await harness.client.dispose();
  });

  it("enables Max Mode from the catalog while preserving xhigh and fast=false", async () => {
    const harness = await createHarness();
    const model = {
      id: "grok-4.7",
      params: [
        { id: "context", value: "500k" },
        { id: "reasoning_effort", value: "xhigh" },
        { id: "fast", value: "false" },
      ],
    };
    // Initialize without a preceding probe: safety-posture replacement workers
    // must qualify Max Mode from a fresh live catalog as well.
    const opened = await harness.client.initialize({
      createOptions: { model, local: { cwd: harness.directory } },
    });
    expect(opened.stateRoot).toBe(join(harness.directory, "sdk-store-sha256"));
    const events: CursorSdkWorkerEvent[] = [];
    harness.client.onEvent((event) => events.push(event));
    await harness.client.start({ message: "hello", options: { model } });
    await vi.waitFor(() => expect(events.some((e) => e.type === "result")).toBe(true));
    const result = events.find((e) => e.type === "result");
    expect(result?.type === "result" ? JSON.parse(result.result.result!) : undefined).toEqual({
      modelId: model.id,
      maxMode: true,
      parameters: model.params,
    });
    await harness.client.dispose();
  });

  it.each(["complete_delivered", "revert_to_followup"])(
    "forwards native steering acknowledgement %s",
    async (acknowledgement) => {
      const harness = await createHarness();
      await harness.client.initialize({
        createOptions: { model: { id: "default" }, local: { cwd: harness.directory } },
      });
      const started = await harness.client.start({ message: "wait" });
      await expect(harness.client.steer(started.runId, acknowledgement)).resolves.toBe(
        acknowledgement,
      );
      await expect(harness.client.steer("stale-run", "ignored")).resolves.toBe(
        "revert_to_followup",
      );
      await harness.client.cancel(started.runId);
      await harness.client.dispose();
    },
  );

  it("declines missing run.steer and rejects invalid acknowledgements", async () => {
    const harness = await createHarness();
    await harness.client.initialize({
      createOptions: { model: { id: "default" }, local: { cwd: harness.directory } },
    });
    let started = await harness.client.start({ message: "no-steer" });
    await expect(harness.client.steer(started.runId, "text")).resolves.toBe("revert_to_followup");
    await harness.client.cancel();
    await vi.waitFor(async () => {
      started = await harness.client.start({ message: "wait" });
    });
    await expect(harness.client.steer(started.runId, "invalid")).rejects.toMatchObject({
      code: "module_api_incompatible",
    });
    await harness.client.dispose();
  });
});

async function createHarness(source = sdkSource) {
  const harness = await createCursorSdkWorkerHarness(source);
  writeFileSync(join(dirname(harness.entryPath), "local-executor.mjs"), executorSource);
  return harness;
}

const executorSource = `
const Bx = { G4: class { constructor(value) { Object.assign(this, value); } }, SR: class { constructor(value) { Object.assign(this, value); } } };
const modules = { "./src/agent/local-executor.ts"(t) {
  return new Bx.G4({modelId:t.model.id,parameters:(t.model.params??[]).map((e=>new Bx.SR({id:e.id,value:e.value})))})
}};
export const requestedModel = (options) => modules["./src/agent/local-executor.ts"](options);
`;

const sdkSource = `
export const getDefaultSdkStateRoot = (cwd) => cwd + "/sdk-store-sha256";
export class Cursor { static models = { list: async () => ${JSON.stringify(catalog)} }; }
export class Agent {
  static async create(options) { return new Agent(options); }
  static async resume(id, options) { return new Agent(options); }
  static messages = { list: async () => [] };
  constructor(options) { this.options = options; this.agentId = "agent-1"; }
  reload() { return Promise.resolve(); }
  close() {}
  async send(message, options) {
    const { requestedModel } = await import("./local-executor.mjs");
    const request = requestedModel({model: options.model ?? this.options.model});
    let finish;
    const completion = new Promise(resolve => finish = resolve);
    const waiting = ["wait", "no-steer"].includes(message);
    if (!waiting) finish();
    return {
      id: "run-1",
      async *stream() { await completion; },
      wait: async () => { await completion; return {id: "run-1", status: "finished", result: JSON.stringify(request)}; },
      cancel: async () => finish(),
      ...(message === "no-steer" ? {} : { steer: async (text) => text }),
    };
  }
}
`;
