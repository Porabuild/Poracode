import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportSessionTranscriptPayload } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import type { AgentAdapter } from "../agents/base";
import type { ImportedTranscript, SessionImportSource } from "../agents/base/sessionImport";
import { SessionImportService } from "./service";

let dir: string;
let root: string;
let payload: ImportSessionTranscriptPayload;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "poracode-session-import-"));
  root = join(dir, "store");
  mkdirSync(root);
  const path = join(root, "a.jsonl");
  writeFileSync(path, "");
  payload = { threadId: "thread-1", agentKind: "agent", path, providerSessionId: "ses-1" };
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup(transcript: ImportedTranscript) {
  const source: SessionImportSource = {
    roots: [root],
    acceptFile: (name) => name.endsWith(".jsonl"),
    summarize: async () => undefined,
    readTranscript: vi.fn<SessionImportSource["readTranscript"]>(async () => transcript),
  };
  const adapters = new Map([["agent", { kind: "agent", sessionImport: source } as AgentAdapter]]);
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  return { service: new SessionImportService(adapters, emit), emit, source };
}

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
      service.importTranscript({ ...payload, path: join(dir, "other.jsonl") }),
    ).rejects.toThrow(msg("sessionImport.unknownTranscript"));
    expect(source.readTranscript).not.toHaveBeenCalled();
  });

  it("refuses a store entry whose resolved file is outside the transcript root", async () => {
    const { service, source } = setup({ providerSessionId: "ses-1", messages: [] });
    const other = join(dir, "other");
    const link = join(root, "linked");
    mkdirSync(other);
    writeFileSync(join(other, "a.jsonl"), "");
    symlinkSync(other, link, "junction");
    await expect(
      service.importTranscript({ ...payload, path: join(link, "a.jsonl") }),
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
