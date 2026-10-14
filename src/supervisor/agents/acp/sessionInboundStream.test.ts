import { describe, expect, it } from "vitest";
import { createAcpInboundStream, AcpInboundFrameLimitError } from "./sessionInboundStream";
import { ndJsonStream, type AnyMessage } from "@agentclientprotocol/sdk";
import { filterAcpInboundNoise, filterAcpStdoutNonJsonLines } from "./sessionStreamFilter";

const encoder = new TextEncoder();
const message = (n: number) => ({ jsonrpc: "2.0", method: "session/update", params: { n } });
function input(chunks: Uint8Array[]) {
  let pulls = 0,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulls: () => pulls, cancelled: () => cancelled };
}
function output() {
  const writes: string[] = [];
  return {
    writes,
    stream: new WritableStream<Uint8Array>({
      write(bytes) {
        writes.push(new TextDecoder().decode(bytes));
      },
    }),
  };
}
async function collect(stream: ReadableStream<AnyMessage>) {
  const reader = stream.getReader();
  const messages: AnyMessage[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) return messages;
    messages.push(next.value);
  }
}

describe("pull-based ACP byte framing", () => {
  it("one-byte fragments use bounded fixed blocks rather than one retained object per byte", async () => {
    const bytes = encoder.encode(
      JSON.stringify({ ...message(1), params: { text: "x".repeat(40000) } }) + "\n",
    );
    let at = 0;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (at === bytes.length) controller.close();
          else controller.enqueue(bytes.subarray(at, ++at));
        },
      },
      { highWaterMark: 0 },
    );
    const allocations: number[] = [];
    const framed = createAcpInboundStream(output().stream, source, {
      onRetainedBytes: (n) => allocations.push(n),
    });
    const values = await collect(framed.readable);
    expect(values).toEqual([{ ...message(1), params: { text: "x".repeat(40000) } }]);
    expect([...new Set(allocations)]).toEqual([16384, 32768, 49152, 0]);
  });
  it("never drains from start or queues a second parsed message without consumer demand", async () => {
    const raw = input([
      encoder.encode(`${JSON.stringify(message(1))}\n`),
      encoder.encode(`${JSON.stringify(message(2))}\n`),
    ]);
    const framed = createAcpInboundStream(output().stream, raw.stream);
    await Promise.resolve();
    expect(raw.pulls()).toBe(0);
    const reader = framed.readable.getReader();
    expect((await reader.read()).value).toEqual(message(1));
    await Promise.resolve();
    expect(raw.pulls()).toBe(1);
    expect((await reader.read()).value).toEqual(message(2));
    expect(raw.pulls()).toBe(2);
    await reader.cancel();
    expect(raw.cancelled()).toBe(true);
  });

  it("a gate stops dispatch before the next line even when both lines arrived in one chunk", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    const raw = input([
      encoder.encode(`${JSON.stringify(message(1))}\n${JSON.stringify(message(2))}\n`),
    ]);
    const stream = createAcpInboundStream(output().stream, raw.stream, {
      beforeRead: async () => {
        if (++reads === 2) await gate;
      },
    });
    const reader = stream.readable.getReader();
    expect((await reader.read()).value).toEqual(message(1));
    let delivered = false;
    const next = reader.read().then((value) => {
      delivered = true;
      return value;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(delivered).toBe(false);
    expect(raw.pulls()).toBe(1);
    release();
    expect((await next).value).toEqual(message(2));
    await reader.cancel();
  });

  it("preserves split UTF-8, CRLF, Unicode whitespace, final lines, and startup/stray noise filtering", async () => {
    const original = { ...message(1), params: { text: "🙂 Привіт café" } };
    const bytes = encoder.encode(
      `diagnostic\n\u00a0\ufeff  ${JSON.stringify(original)}\r\n{"jsonrpc":"2.0","id":"skills-reload","result":{}}\n${JSON.stringify(message(2))}`,
    );
    const stream = createAcpInboundStream(
      output().stream,
      input([...bytes].map((n) => Uint8Array.of(n))).stream,
    );
    expect(await collect(stream.readable)).toEqual([original, message(2)]);
  });

  it("reports parse errors in write order and continues with the next intact frame", async () => {
    const out = output();
    const stream = createAcpInboundStream(
      out.stream,
      input([encoder.encode(`{broken}\n${JSON.stringify(message(1))}\n`)]).stream,
    );
    const writer = stream.writable.getWriter();
    await writer.write({ jsonrpc: "2.0", id: 4, result: {} });
    writer.releaseLock();
    expect(await collect(stream.readable)).toEqual([message(1)]);
    expect(out.writes.map((line) => JSON.parse(line))).toEqual([
      { jsonrpc: "2.0", id: 4, result: {} },
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
    ]);
  });

  it("fails before copying a frame past its bound and releases partial retention on cancellation", async () => {
    const raw = input([
      encoder.encode('{"text":"'),
      encoder.encode("x".repeat(50)),
      encoder.encode('"}\n'),
    ]);
    const retained: number[] = [];
    const stream = createAcpInboundStream(output().stream, raw.stream, {
      maxFrameBytes: 32,
      onRetainedBytes: (n) => retained.push(n),
    });
    await expect(stream.readable.getReader().read()).rejects.toBeInstanceOf(
      AcpInboundFrameLimitError,
    );
    expect(Math.max(...retained)).toBeLessThanOrEqual(32);
    expect(retained.at(-1)).toBe(0);
    expect(raw.cancelled()).toBe(true);
  });

  it("large non-JSON diagnostics are discarded without accumulating a retained line", async () => {
    const retained: number[] = [];
    const raw = input([
      encoder.encode("startup " + "x".repeat(2000)),
      encoder.encode(`\n${JSON.stringify(message(1))}\n`),
    ]);
    const stream = createAcpInboundStream(output().stream, raw.stream, {
      maxFrameBytes: 100,
      onRetainedBytes: (n) => retained.push(n),
    });
    expect(await collect(stream.readable)).toEqual([message(1)]);
    expect(Math.max(...retained)).toBeLessThanOrEqual(100);
  });

  it("matches the released filter/SDK path for valid mixed notifications and responses", async () => {
    const bytes = encoder.encode(
      `notice\n${JSON.stringify(message(1))}\r\n{"jsonrpc":"2.0","id":2,"result":{}}\n${JSON.stringify(message(3))}\n`,
    );
    const old = filterAcpInboundNoise(
      ndJsonStream(
        output().stream,
        filterAcpStdoutNonJsonLines(input([bytes.slice(0, 31), bytes.slice(31)]).stream),
      ),
    );
    const next = createAcpInboundStream(
      output().stream,
      input([bytes.slice(0, 31), bytes.slice(31)]).stream,
    );
    expect(await collect(next.readable)).toEqual(await collect(old.readable));
  });

  it("rejects invalid bound configuration before locking the input", () => {
    const raw = input([]);
    expect(() => createAcpInboundStream(output().stream, raw.stream, { maxFrameBytes: 0 })).toThrow(
      RangeError,
    );
    expect(raw.stream.locked).toBe(false);
  });
});
