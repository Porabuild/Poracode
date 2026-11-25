import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  WIRE_COMPAT_SCENARIOS,
  runWireCompatScenario,
  type WireCompatPeer,
  type WireCompatSubject,
  type WireCompatTranscript,
} from "./clientWireCompat.testFixtures";
import { connectAcpClient, type AcpClientHandlers } from "./clientConnection";

const SUBJECT: WireCompatSubject = (stream, handlers) =>
  connectAcpClient(stream, handlers as unknown as AcpClientHandlers) as unknown as WireCompatPeer;

const GOLDEN = new URL("./fixtures/wire-compat.golden.json", import.meta.url);

/**
 * The one accepted change: `-32002` on `session/close` / `session/delete`
 * resolves instead of rejecting, see clientConnection.ts. Every other
 * difference is a regression and must stay a failure.
 */
const EXPECTED_DIFFERENCES: Record<string, readonly string[]> = {
  "full-all-extensions": [
    "outcomes[closeSession]: rejected -> resolved",
    "outcomes[deleteSession]: rejected -> resolved",
  ],
  "minimal-core-no-extensions": ["outcomes[deleteSession]: rejected -> resolved"],
  "minimal-core-extensions": ["outcomes[deleteSession]: rejected -> resolved"],
  "full-stray-response": ["outcomes[deleteSession]: rejected -> resolved"],
};

interface GoldenFile {
  $comment: string;
  scenarios: Record<string, WireCompatTranscript>;
}

async function readGolden(): Promise<GoldenFile> {
  return JSON.parse(await readFile(GOLDEN, "utf8")) as GoldenFile;
}

const json = (value: unknown) => JSON.stringify(value);

function truncate(value: string, max = 200): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Every difference between the recording and the observed transcript, sorted. */
export function differences(golden: WireCompatTranscript, actual: WireCompatTranscript): string[] {
  const out: string[] = [];
  for (const field of ["calls", "wireOrder", "handlerSettled", "closed"] as const) {
    if (json(golden[field]) !== json(actual[field])) {
      out.push(`${field}: ${truncate(json(golden[field]))} -> ${truncate(json(actual[field]))}`);
    }
  }

  const goldenOutcomes = new Map(golden.outcomes.map((entry) => [entry.method, entry]));
  const actualOutcomes = new Map(actual.outcomes.map((entry) => [entry.method, entry]));
  for (const method of new Set([...goldenOutcomes.keys(), ...actualOutcomes.keys()])) {
    const before = goldenOutcomes.get(method);
    const after = actualOutcomes.get(method);
    if (json(before) !== json(after)) {
      out.push(
        `outcomes[${method}]: ${before?.status ?? "missing"} -> ${after?.status ?? "missing"}`,
      );
    }
  }

  for (const id of new Set([...Object.keys(golden.agentSaw), ...Object.keys(actual.agentSaw)])) {
    const before = golden.agentSaw[id];
    const after = actual.agentSaw[id];
    if (json(before) !== json(after)) {
      out.push(
        `agentSaw[${id}]: ${truncate(json(before ?? null))} -> ${truncate(json(after ?? null))}`,
      );
    }
  }

  const goldenCalls = golden.handlerCalls;
  const actualCalls = actual.handlerCalls;
  const callCount = Math.max(goldenCalls.length, actualCalls.length);
  for (let index = 0; index < callCount; index += 1) {
    const before = goldenCalls[index];
    const after = actualCalls[index];
    if (json(before) !== json(after)) {
      out.push(
        `handlerCalls: differ at index ${index}: ${truncate(json(before ?? null))} -> ${truncate(json(after ?? null))}`,
      );
      break;
    }
  }

  return out.sort();
}

describe("ACP client wire compatibility", () => {
  for (const scenario of WIRE_COMPAT_SCENARIOS) {
    it(`matches the recorded wire behaviour: ${scenario.name}`, async () => {
      const golden = await readGolden();
      const recorded = golden.scenarios[scenario.name];
      expect(recorded).toBeDefined();
      const actual = await runWireCompatScenario(SUBJECT, scenario);
      expect(differences(recorded!, actual)).toEqual(EXPECTED_DIFFERENCES[scenario.name] ?? []);
    }, 30_000);
  }
});

const names = {
  full: "full-all-extensions",
  minimal: "minimal-core-no-extensions",
  coreExtensions: "minimal-core-extensions",
  exitWhilePending: "odd-exit-while-pending",
  stray: "full-stray-response",
} as const;

describe("what the recorded baseline contains", () => {
  async function scenario(name: keyof typeof names): Promise<WireCompatTranscript> {
    const golden = await readGolden();
    const transcript = golden.scenarios[names[name]];
    expect(transcript).toBeDefined();
    return transcript!;
  }

  it("drops an update kind the SDK does not know", async () => {
    const golden = await readGolden();
    for (const transcript of Object.values(golden.scenarios)) {
      const delivered = transcript.handlerCalls.some(
        (entry) =>
          entry.handler === "sessionUpdate" &&
          (entry.params as { update?: { sessionUpdate?: string } }).update?.sessionUpdate ===
            "vendor_custom_update",
      );
      expect(delivered).toBe(false);
    }
  });

  it("strips unknown fields from known updates but keeps _meta", async () => {
    const transcript = await scenario("full");
    const match = transcript.handlerCalls.find(
      (entry) =>
        entry.handler === "sessionUpdate" &&
        (entry.params as { sessionId?: string }).sessionId === "s-unsolicited",
    );
    expect(match?.params).toEqual({
      sessionId: "s-unsolicited",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "unsolicited" },
      },
      _meta: { vendor: { deep: { x: 1 } } },
    });
  });

  it("keeps a params-level _meta", async () => {
    const transcript = await scenario("full");
    const match = transcript.handlerCalls.find(
      (entry) =>
        (entry.params as { update?: { toolCallId?: string } }).update?.toolCallId === "c-1" &&
        (entry.params as { _meta?: unknown })._meta !== undefined,
    );
    expect(match).toBeDefined();
    const params = match?.params as { _meta?: unknown; update: Record<string, unknown> };
    expect(params._meta).toEqual({ "poracode/x": 1, vendor: { k: [1] } });
    expect(Object.hasOwn(params.update, "vendorUpdateKey")).toBe(false);
  });

  it("validates request params before the handler", async () => {
    const transcript = await scenario("full");
    const read = transcript.handlerCalls.find((entry) => entry.handler === "readTextFile");
    expect(read?.params).toEqual({ sessionId: "s-1", path: "/x", line: 3, limit: 2 });
    expect(
      (transcript.agentSaw["fs/read_text_file#2"] as { error?: { code?: number } }).error?.code,
    ).toBe(-32602);
  });

  it("returns responses raw", async () => {
    const transcript = await scenario("full");
    const outcome = (method: string) => {
      const found = transcript.outcomes.find((entry) => entry.method === method);
      expect(found?.status).toBe("resolved");
      return found!.value as Record<string, any>;
    };

    const initialized = outcome("initialize");
    expect(initialized.vendorTopLevel).toEqual({ unknown: "field", nested: { deep: [1, 2, 3] } });
    expect(initialized.agentCapabilities.sessionCapabilities.fork).toEqual({ notAShape: true });

    const prompt = outcome("prompt");
    expect(prompt.extraField).toEqual({ kept: true });
    expect(prompt.usage.totalTokens).toBe(10);

    const newSession = outcome("newSession");
    expect(newSession.extraResultField).toBeDefined();
    expect(newSession.configOptions[0].vendorField).toBe(1);
  });

  it("routes extension requests and preserves thrown errors", async () => {
    const transcript = await scenario("full");
    expect(
      (transcript.agentSaw["vendor/ask#1"] as { result: { echo: unknown } }).result.echo,
    ).toEqual({ q: "ping", extra: [1, 2] });
    expect(
      (transcript.agentSaw["vendor/throw_request_error#1"] as { error: unknown }).error,
    ).toEqual({ code: -32000, message: "custom failure", data: { detail: 1 } });
    const plain = transcript.agentSaw["vendor/throw_plain#1"] as {
      error: { code: number; data: { details: unknown } };
    };
    expect(plain.error.code).toBe(-32603);
    expect(plain.error.data.details).toBe("boom");
    expect(
      (transcript.agentSaw["vendor/return_undefined#1"] as { result: unknown }).result,
    ).toBeNull();
  });

  it("answers unknown requests with method-not-found when there is no extension handler", async () => {
    const transcript = await scenario("minimal");
    expect(transcript.handlerCalls.some((entry) => entry.handler === "extMethod")).toBe(false);
    expect(transcript.handlerCalls.some((entry) => entry.handler === "extNotification")).toBe(
      false,
    );
    expect(transcript.handlerCalls.some((entry) => entry.method === "vendor/progress")).toBe(false);
    for (const id of [
      "vendor/ask#1",
      "vendor/unknown2#1",
      "vendor/throw_plain#1",
      "vendor/return_undefined#1",
    ]) {
      expect((transcript.agentSaw[id] as { error?: { code?: number } }).error?.code).toBe(-32601);
    }
  });

  it("answers known methods without an implementation like the 1.x wrapper", async () => {
    const transcript = await scenario("minimal");
    for (const id of ["fs/write_text_file#1", "terminal/release#1", "terminal/kill#1"]) {
      expect((transcript.agentSaw[id] as { result?: unknown }).result).toEqual({});
    }
    for (const id of ["terminal/create#1", "terminal/output#1", "terminal/wait_for_exit#1"]) {
      expect((transcript.agentSaw[id] as { result?: unknown }).result).toBeNull();
    }
    const handlers = transcript.handlerCalls.map((entry) => entry.handler);
    expect(handlers).not.toContain("writeTextFile");
    expect(handlers.filter((handler) => handler.endsWith("Terminal"))).toEqual([]);
  });

  it("never routes known methods to the extension handler", async () => {
    const transcript = await scenario("coreExtensions");
    for (const entry of transcript.handlerCalls.filter((call) => call.handler === "extMethod")) {
      expect(entry.method.startsWith("fs/")).toBe(false);
      expect(entry.method.startsWith("terminal/")).toBe(false);
      expect(entry.method.startsWith("elicitation/")).toBe(false);
    }
    expect(
      (transcript.agentSaw["elicitation/create#1"] as { error?: { code?: number } }).error?.code,
    ).toBe(-32601);
    expect((transcript.agentSaw["fs/write_text_file#1"] as { result?: unknown }).result).toEqual(
      {},
    );
  });

  it("does not wait for a pending async handler", async () => {
    const transcript = await scenario("full");
    expect(transcript.handlerSettled).toEqual(["session/update", "fs/read_text_file"]);
  });

  it("rejects a pending request when the agent exits", async () => {
    const transcript = await scenario("exitWhilePending");
    const prompt = transcript.outcomes.find((entry) => entry.method === "prompt");
    expect(prompt?.status).toBe("rejected");
  });

  it("propagates a session-not-found rejection on close and delete", async () => {
    const full = await scenario("full");
    for (const method of ["closeSession", "deleteSession"]) {
      const outcome = full.outcomes.find((entry) => entry.method === method);
      expect(outcome?.status).toBe("rejected");
      expect(outcome?.error?.code).toBe(-32002);
    }
    const minimal = await scenario("minimal");
    expect(minimal.outcomes.find((entry) => entry.method === "closeSession")?.status).toBe(
      "resolved",
    );
  });
});
