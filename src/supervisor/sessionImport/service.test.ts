import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import type { AgentAdapter } from "../agents/base";
import type { ImportedTranscript, SessionImportSource } from "../agents/base/sessionImport";
import { SessionImportService } from "./service";

const ROOT = join("/", "store", "sessions");

function setup(transcript: ImportedTranscript) {
  const source: SessionImportSource = {
    roots: [ROOT],
    acceptFile: (name) => name.endsWith(".jsonl"),
    summarize: async () => undefined,
    readTranscript: vi.fn<SessionImportSource["readTranscript"]>(async () => transcript),
  };
  const adapters = new Map([["agent", { kind: "agent", sessionImport: source } as AgentAdapter]]);
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  return { service: new SessionImportService(adapters, emit), emit, source };
}

const payload = {
  threadId: "thread-1",
  agentKind: "agent",
  path: join(ROOT, "a.jsonl"),
  providerSessionId: "ses-1",
};

describe("SessionImportService", () => {
  it("replays the transcript as runtime events for main to persist", async () => {
    const { service, emit } = setup({
      providerSessionId: "ses-1",
      messages: [
        { role: "user", text: "hello" },
        { role: "assistant", text: "hi" },
      ],
    });

    await expect(service.importTranscript(payload)).resolves.toEqual({ messageCount: 2 });

    const events = emit.mock.calls.flatMap(([event]) =>
      event.type === "thread-runtime-events" ? event.events : [],
    );
    expect(events.map((event) => event.type)).toEqual([
      "item.started",
      "item.completed",
      "item.started",
      "content.delta",
      "item.completed",
    ]);
    expect(events[0]).toMatchObject({
      threadId: "thread-1",
      itemType: "user_message",
      payload: { content: [{ kind: "text", text: "hello" }] },
    });
    expect(events[3]).toMatchObject({ stream: "assistant_text", delta: "hi" });
  });

  it("refuses paths outside the agent's own transcript store", async () => {
    const { service, source } = setup({ providerSessionId: "ses-1", messages: [] });

    await expect(
      service.importTranscript({ ...payload, path: join("/", "etc", "passwd.jsonl") }),
    ).rejects.toThrow(msg("sessionImport.unknownTranscript"));
    expect(source.readTranscript).not.toHaveBeenCalled();
  });

  it("refuses a transcript that no longer carries the listed session id", async () => {
    const { service, emit } = setup({ providerSessionId: "other", messages: [] });

    await expect(service.importTranscript(payload)).rejects.toThrow(
      msg("sessionImport.changedOnDisk"),
    );
    expect(emit).not.toHaveBeenCalled();
  });
});
