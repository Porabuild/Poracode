import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractContextResult } from "@/shared/contracts";
import { buildForkMentionLaunchInput, buildHandoffLaunchInput } from "./providerHandoff";

describe("buildForkMentionLaunchInput", () => {
  it("leads with a mention of the source thread and keeps the user's prompt", () => {
    const launch = buildForkMentionLaunchInput({
      sourceThread: { id: "source-1", title: "Incident triage" },
      prompt: "Try the other approach",
      segments: undefined,
    });

    expect(launch.segments).toEqual([
      { kind: "thread", threadId: "source-1", title: "Incident triage" },
      { kind: "text", content: " " },
      { kind: "text", content: "Try the other approach" },
    ]);
    expect(launch.prompt).toContain("Try the other approach");
    expect(launch.prompt).toContain("Incident triage");
  });

  it("preserves structured prompt segments after the mention", () => {
    const launch = buildForkMentionLaunchInput({
      sourceThread: { id: "source-1", title: "Incident triage" },
      prompt: "see file",
      segments: [
        { kind: "attachment", path: "/tmp/shot.png", mimeType: "image/png" },
        { kind: "text", content: "see file" },
      ],
    });

    expect(launch.segments?.[0]).toEqual({
      kind: "thread",
      threadId: "source-1",
      title: "Incident triage",
    });
    expect(launch.segments?.[2]).toEqual({
      kind: "attachment",
      path: "/tmp/shot.png",
      mimeType: "image/png",
    });
  });
});

const originalPoracode = window.poracode;

function extracted(overrides: Partial<ExtractContextResult> = {}): ExtractContextResult {
  return {
    summary: "Prior context",
    sourceProvider: "claude",
    sourceSessionId: "session-1",
    extractedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildHandoffLaunchInput", () => {
  let saveHandoffContext: ReturnType<typeof vi.fn<() => Promise<string>>>;

  beforeEach(() => {
    saveHandoffContext = vi.fn<() => Promise<string>>(async () => "/repo/.poracode/handoff.md");
    window.poracode = { saveHandoffContext } as unknown as typeof window.poracode;
  });

  afterEach(() => {
    window.poracode = originalPoracode;
  });

  it("introduces a provider summary as a context file", async () => {
    const launch = await buildHandoffLaunchInput({
      threadId: "t1",
      prompt: "Continue",
      segments: undefined,
      extractedContext: extracted(),
    });

    expect(launch.prompt).toBe(
      "This task was handed off from a claude session. Use the attached context file as prior conversation context.\n\nContinue",
    );
    expect(launch.segments).toEqual([
      expect.objectContaining({ kind: "text" }),
      { kind: "attachment", path: "/repo/.poracode/handoff.md", mimeType: "text/markdown" },
      { kind: "text", content: "\n\n" },
      { kind: "text", content: "Continue" },
    ]);
  });

  it("tells the provider to read a verbatim chat history in full", async () => {
    const launch = await buildHandoffLaunchInput({
      threadId: "t1",
      prompt: "Continue",
      segments: undefined,
      extractedContext: extracted({ contentKind: "transcript" }),
    });

    expect(launch.prompt).toContain("The attached file is the chat history of this conversation");
    expect(launch.prompt).toContain("Read it in full before answering");
    expect(launch.prompt).not.toContain("attached context file");
    expect(saveHandoffContext).toHaveBeenCalledWith({ threadId: "t1", content: "Prior context" });
  });

  it("labels an inlined chat history when the file write fails", async () => {
    saveHandoffContext.mockRejectedValueOnce(new Error("disk full"));

    const launch = await buildHandoffLaunchInput({
      threadId: "t1",
      prompt: "Continue",
      segments: undefined,
      extractedContext: extracted({ contentKind: "transcript" }),
    });

    expect(launch.prompt.startsWith("[Chat history from previous claude session]\n\n")).toBe(true);
    expect(launch.prompt.endsWith("Prior context\n\nContinue")).toBe(true);
  });
});
