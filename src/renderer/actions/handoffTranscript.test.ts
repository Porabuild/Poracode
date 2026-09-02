import { beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "../state/appStore";
import type { RuntimeChatItem } from "../state/slices/runtimeEventSlice";
import { buildTranscriptContext, MAX_TRANSCRIPT_CONTEXT_CHARS } from "./handoffTranscript";
import { MAX_HANDOFF_MESSAGE_CHARS } from "./handoffTranscriptRows";

const thread: Thread = {
  id: "thread-1",
  projectId: "project-1",
  agentKind: "claude",
  config: { model: "claude-opus-5" },
  title: "Incident triage",
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function userMessage(id: string, text: string): RuntimeChatItem {
  return {
    id,
    type: "user_message",
    state: "completed",
    payload: { content: [{ kind: "text", text }] },
    streams: {},
  };
}

function assistantMessage(id: string, text: string): RuntimeChatItem {
  return {
    id,
    type: "assistant_message",
    state: "completed",
    payload: { content: [{ kind: "text", text }] },
    streams: { assistant_text: text },
  };
}

function seed(items: readonly RuntimeChatItem[]) {
  useAppStore.setState({
    runtimeItemIdsByThread: { [thread.id]: items.map((item) => item.id) },
    runtimeItemsByIdByThread: {
      [thread.id]: Object.fromEntries(items.map((item) => [item.id, item])),
    },
  } as never);
}

describe("buildTranscriptContext", () => {
  beforeEach(() => {
    useAppStore.setState({ runtimeItemIdsByThread: {}, runtimeItemsByIdByThread: {} } as never);
  });

  it("returns null when the thread has no stored rows", () => {
    expect(buildTranscriptContext(thread, "Claude")).toBeNull();
  });

  it("tags the result as a verbatim transcript with a chat-history header", () => {
    seed([userMessage("u1", "Fix the flaky test")]);

    const result = buildTranscriptContext(thread, "Claude");

    expect(result?.contentKind).toBe("transcript");
    expect(
      result?.summary.startsWith("Chat history of this conversation from the Claude session"),
    ).toBe(true);
    expect(result?.summary).toContain("User:\nFix the flaky test");
  });

  it("keeps command lines and file changes but drops command output and tool noise", () => {
    seed([
      userMessage("u1", "Build it"),
      {
        id: "cmd",
        type: "command_execution",
        state: "completed",
        payload: { command: "pnpm run build" },
        streams: { command_output: "x".repeat(60_000) },
      },
      {
        id: "file",
        type: "file_change",
        state: "completed",
        payload: { path: "src/index.ts", changeKind: "edit" },
        streams: {},
      },
      {
        id: "tool",
        type: "tool_call",
        state: "completed",
        payload: { title: "Read", status: "completed" },
        streams: {},
      },
    ]);

    const summary = buildTranscriptContext(thread, "Claude")?.summary ?? "";

    expect(summary).toContain("Command: pnpm run build");
    expect(summary).toContain("File edit: src/index.ts");
    expect(summary).not.toContain("xxxx");
    expect(summary).not.toContain("Tool completed");
    expect(summary).not.toContain("Read");
  });

  it("keeps visible assistant attachments while omitting suppressed display text", () => {
    seed([
      {
        id: "assistant",
        type: "assistant_message",
        state: "completed",
        payload: {
          content: [
            { kind: "text", text: "" },
            {
              kind: "image",
              mimeType: "image/png",
              dataUrl: "data:image/png;base64,eA==",
              name: "kept.png",
            },
          ],
          displayAuthoritative: true,
        },
        streams: { assistant_text: "Suppressed secret" },
      },
    ]);

    const summary = buildTranscriptContext(thread, "Claude")?.summary ?? "";

    expect(summary).toContain("Assistant:\n[image: kept.png]");
    expect(summary).not.toContain("Suppressed secret");
  });

  it("always keeps the first user message and marks omitted turns when the budget fills", () => {
    const long = "y".repeat(MAX_HANDOFF_MESSAGE_CHARS - 10);
    seed([
      userMessage("u1", "Original ask: migrate the auth module"),
      ...Array.from({ length: 12 }, (_, index) =>
        assistantMessage(`a${index}`, `${index}:${long}`),
      ),
      userMessage("u2", "Latest follow-up"),
    ]);

    const summary = buildTranscriptContext(thread, "Claude")?.summary ?? "";

    expect(summary).toContain("User:\nOriginal ask: migrate the auth module");
    expect(summary).toContain("User:\nLatest follow-up");
    expect(summary).toContain("[turns omitted]");
    expect(summary).not.toContain("[earlier turns omitted]");
    expect(summary.indexOf("Original ask")).toBeLessThan(summary.indexOf("Latest follow-up"));
    expect(summary.length).toBeLessThan(52_000);
  });

  it("spends the budget on conversation before tool activity", () => {
    // Eight near-cap assistant rows take ~48k of the 50k budget; twenty
    // 480-char command rows cannot all fit in what remains.
    const long = "z".repeat(MAX_HANDOFF_MESSAGE_CHARS - 10);
    const commands: RuntimeChatItem[] = Array.from({ length: 20 }, (_, index) => ({
      id: `cmd${index}`,
      type: "command_execution",
      state: "completed",
      payload: { command: `pnpm test cmd${index} ${"-".repeat(460)}` },
      streams: {},
    }));
    seed([
      ...commands,
      ...Array.from({ length: 8 }, (_, index) => assistantMessage(`a${index}`, `${index}:${long}`)),
    ]);

    const summary = buildTranscriptContext(thread, "Claude")?.summary ?? "";

    expect(summary).toContain("0:zzz");
    expect(summary).toContain("7:zzz");
    expect(summary).toContain("Command: pnpm test cmd19 ");
    expect(summary).not.toContain("Command: pnpm test cmd0 ");
    expect(summary).toContain("[earlier turns omitted]");
  });

  it("truncates a single oversized user message from the tail, keeping its start", () => {
    seed([userMessage("u1", `ASK ${"w".repeat(MAX_HANDOFF_MESSAGE_CHARS * 2)}`)]);

    const summary = buildTranscriptContext(thread, "Claude")?.summary ?? "";

    expect(summary).toContain("User:\nASK ");
    expect(summary).toContain("[message truncated]");
  });

  it("stays near the character budget when interleaved rows force gap markers", () => {
    // Alternating commands and tiny messages make the kept conversation rows
    // position-scattered, so every join needs a gap marker the row budget
    // alone would never account for.
    const interleaved: RuntimeChatItem[] = Array.from({ length: 1500 }, (_, index) => [
      {
        id: `cmd${index}`,
        type: "command_execution" as const,
        state: "completed" as const,
        payload: { command: `pnpm test ${index} ${"-".repeat(45)}` },
        streams: {},
      },
      assistantMessage(`a${index}`, `${index}:`.padEnd(16, "0")),
    ]).flat();
    seed(interleaved);

    const summary = buildTranscriptContext(thread, "Claude")?.summary ?? "";

    expect(summary).toContain("[turns omitted]");
    // The header line rides outside the row budget, hence the small slack.
    expect(summary.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CONTEXT_CHARS + 500);
  });
});
