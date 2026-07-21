import { describe, expect, it } from "vitest";
import { filterAcpStdoutNonJsonLines } from "./sessionStreamFilter";

async function readUtf8(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return output + decoder.decode();
    output += decoder.decode(value, { stream: true });
  }
}

describe("filterAcpStdoutNonJsonLines", () => {
  it("drops plain-text startup diagnostics split across chunks", async () => {
    const encoder = new TextEncoder();
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"jsonrpc":"2.0","id":1,"result":{}}\nSkill comm'));
        controller.enqueue(
          encoder.encode(
            "and '/release-notes' was renamed because it conflicts with a built-in command.\n" +
              '{"jsonrpc":"2.0","method":"session/update","params":{}}\r\n',
          ),
        );
        controller.close();
      },
    });

    await expect(readUtf8(filterAcpStdoutNonJsonLines(input))).resolves.toBe(
      '{"jsonrpc":"2.0","id":1,"result":{}}\n' +
        '{"jsonrpc":"2.0","method":"session/update","params":{}}\n',
    );
  });

  it("preserves an object-shaped final line without a trailing newline", async () => {
    const encoder = new TextEncoder();
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('notice\n  {"jsonrpc":"2.0","id":2,"result":{}}'));
        controller.close();
      },
    });

    await expect(readUtf8(filterAcpStdoutNonJsonLines(input))).resolves.toBe(
      '  {"jsonrpc":"2.0","id":2,"result":{}}',
    );
  });
});
