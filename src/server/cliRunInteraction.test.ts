import { PassThrough, Writable } from "node:stream";
import { expect, it, vi } from "vitest";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import { CliRunInteraction } from "./cliRunInteraction";

class TerminalInput extends PassThrough {
  isTTY = true;
  isRaw = false;
  setRawMode(enabled: boolean) {
    this.isRaw = enabled;
    return this;
  }
}
const metadata = {
  formatVersion: 1 as const,
  scope: "controlled-run" as const,
  runId: "187b821c-8453-4b8f-afd3-f5538851dabb",
  threadId: "thread",
};
const token = "1043c9af-fcd1-4eb2-95db-062a7a73d6ec";
function fixture(multiSelect = false, raw = false) {
  const input = new TerminalInput(),
    signal = new AbortController();
  let text = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      text += String(chunk);
      callback();
    },
  });
  const state = { pending: true, foreign: false };
  const request = vi.fn<(command: HostAdminCommand, signal?: AbortSignal) => Promise<unknown>>(
    async (command) => {
      if (command.action === "run-request-read")
        return {
          ...metadata,
          ...(state.foreign ? { threadId: "foreign" } : {}),
          request: state.pending
            ? {
                requestToken: token,
                requestType: raw ? "tool_user_input" : "tool_call_approval",
                payload: {
                  summary: "Review\u001b[2J action",
                  details: { command: "fixture command" },
                  multiSelect,
                  ...(raw
                    ? {}
                    : {
                        options: [
                          { optionId: "once", label: "Allow once" },
                          { optionId: "reject", label: "Deny" },
                        ],
                      }),
                },
              }
            : null,
        };
      if (command.action === "run-request-respond") {
        state.pending = false;
        return { ...metadata, requestToken: command.requestToken, responded: true };
      }
      throw new Error("Unexpected fixture request");
    },
  );
  const fail = vi.fn<(error: Error) => void>();
  const interaction = new CliRunInteraction({
    metadata,
    request,
    signal: signal.signal,
    input,
    output,
    fail,
  });
  return {
    input,
    output,
    signal,
    state,
    request,
    fail,
    interaction,
    text: () => text,
    replies: () =>
      request.mock.calls.filter(([command]) => command.action === "run-request-respond"),
  };
}

it("submits only explicitly chosen advertised options and escapes provider terminal controls", async () => {
  const f = fixture();
  await f.interaction.poll();
  expect(f.text()).toContain("Review\\u001b[2J action");
  expect(f.text()).toContain("fixture command");
  expect(f.replies()).toHaveLength(0);
  f.input.write("1\r");
  await f.interaction.join();
  expect(f.replies()[0]![0]).toEqual({
    action: "run-request-respond",
    runId: metadata.runId,
    requestToken: token,
    response: { optionId: "once" },
  });
  expect(f.fail).not.toHaveBeenCalled();
  expect(f.input.isRaw).toBe(false);
  expect(f.output.listenerCount("error")).toBe(0);
  f.interaction.stop();
});

it("rejects empty, duplicate and unknown selections before accepting a multi-select response", async () => {
  const f = fixture(true);
  await f.interaction.poll();
  for (const value of ["", "1,1", "3"]) {
    const before = f.text().length;
    f.input.write(value + "\r");
    await vi.waitFor(() => expect(f.text().length).toBeGreaterThan(before + value.length + 2));
    expect(f.replies()).toHaveLength(0);
  }
  f.input.write("2,1\r");
  await f.interaction.join();
  expect(f.replies()[0]![0]).toMatchObject({
    response: { optionId: "reject", optionIds: ["reject", "once"] },
  });
  f.interaction.stop();
});

it("reads an explicit JSON response without echoing answer contents", async () => {
  const f = fixture(false, true);
  await f.interaction.poll();
  f.input.write("j\r");
  await vi.waitFor(() => expect(f.text()).toContain("Response JSON (hidden"));
  f.input.write('{"answers":{"fixture":"private answer"}}\r');
  await f.interaction.join();
  expect(f.replies()[0]![0]).toMatchObject({
    response: { answers: { fixture: "private answer" } },
  });
  expect(f.text()).not.toContain("private answer");
  expect(f.fail).not.toHaveBeenCalled();
  f.interaction.stop();
});

it.each(["resolved", "cancelled", "stopped"])(
  "closes %s input without sending a late answer",
  async (mode) => {
    const f = fixture();
    await f.interaction.poll();
    f.input.write("partial");
    if (mode === "resolved") {
      f.state.pending = false;
      await f.interaction.poll();
    } else if (mode === "cancelled") f.signal.abort(new Error("Owned caller left"));
    else f.interaction.stop();
    await f.interaction.join();
    expect(f.replies()).toHaveLength(0);
    expect(f.fail).not.toHaveBeenCalled();
    expect(f.input.isRaw).toBe(false);
    expect(f.input.listenerCount("error")).toBe(0);
    expect(f.output.listenerCount("error")).toBe(0);
    f.interaction.stop();
  },
);

it("refuses another run's request before terminal or response effects", async () => {
  const f = fixture();
  f.state.foreign = true;
  await expect(f.interaction.poll()).rejects.toThrow("different interactive run");
  expect(f.text()).toBe("");
  expect(f.replies()).toHaveLength(0);
  f.interaction.stop();
});

it("reports a terminal failure and joins its listener/raw-mode cleanup", async () => {
  const f = fixture();
  await f.interaction.poll();
  const error = new Error("Fixture terminal output failed");
  f.output.emit("error", error);
  await f.interaction.join();
  expect(f.fail).toHaveBeenCalledExactlyOnceWith(error);
  expect(f.replies()).toHaveLength(0);
  expect(f.input.isRaw).toBe(false);
  expect(f.output.listenerCount("error")).toBe(0);
  f.interaction.stop();
});

it("joins a submitted response and preserves acknowledgement errors after terminal stop", async () => {
  const f = fixture(),
    held = Promise.withResolvers<unknown>();
  const original = f.request.getMockImplementation()!;
  f.request.mockImplementation((command, signal) =>
    command.action === "run-request-respond" ? held.promise : original(command, signal),
  );
  await f.interaction.poll();
  f.input.write("1\r");
  await vi.waitFor(() => expect(f.replies()).toHaveLength(1));
  f.interaction.stop();
  let joined = false;
  const join = f.interaction.join().then(() => {
    joined = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(joined).toBe(false);
  held.resolve({ ...metadata, threadId: "foreign", requestToken: token, responded: true });
  await join;
  expect(f.fail).toHaveBeenCalledOnce();
  expect(f.fail.mock.calls[0]![0].message).toContain("different interactive run");
});
