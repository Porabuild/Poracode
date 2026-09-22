import { describe, expect, it, vi } from "vitest";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import {
  ExperimentResponseTooLargeError,
  readExperimentResponseTranscript,
  type ExperimentRuntimeItemsPage,
} from "./experimentResponseReads";

function item(id: string, text: string): PersistedRuntimeItem {
  return {
    id,
    type: "assistant_message",
    state: "completed",
    streams: {},
    payload: { content: [{ kind: "text", text }] },
  };
}

function page(
  items: PersistedRuntimeItem[],
  nextCursor: number | null,
): ExperimentRuntimeItemsPage {
  return { items, nextCursor };
}

describe("experiment response transcript reads", () => {
  it("walks every bounded page to exhaustion in ascending order", async () => {
    const readPage = vi
      .fn<
        (input: {
          threadId: string;
          limit: number;
          beforePosition?: number;
        }) => Promise<ExperimentRuntimeItemsPage>
      >()
      .mockResolvedValueOnce(page([item("c", "third"), item("d", "fourth")], 8))
      .mockResolvedValueOnce(page([item("a", "first"), item("b", "second")], null));

    const transcript = await readExperimentResponseTranscript(readPage, "candidate-1");

    expect(readPage).toHaveBeenCalledTimes(2);
    expect(readPage.mock.calls[0]![0]).toEqual({ threadId: "candidate-1", limit: 500 });
    expect(readPage.mock.calls[1]![0]).toEqual({
      threadId: "candidate-1",
      limit: 500,
      beforePosition: 8,
    });
    expect(transcript).toContain("first");
    expect(transcript.indexOf("first")).toBeLessThan(transcript.indexOf("third"));
  });

  it("builds the same empty response a completed walk of an empty thread always produced", async () => {
    const transcript = await readExperimentResponseTranscript(
      async () => page([], null),
      "candidate-2",
    );
    expect(transcript).toBe("");
  });

  it("refuses typed instead of judging a transcript truncated by the page budget", async () => {
    const readPage = vi.fn<
      (input: {
        threadId: string;
        limit: number;
        beforePosition?: number;
      }) => Promise<ExperimentRuntimeItemsPage>
    >(async () => page([item(`i-${Math.random()}`, "more")], 1));

    await expect(readExperimentResponseTranscript(readPage, "candidate-3")).rejects.toBeInstanceOf(
      ExperimentResponseTooLargeError,
    );
  });

  it("propagates a failed page read instead of judging partial data", async () => {
    const readPage = vi
      .fn<
        (input: {
          threadId: string;
          limit: number;
          beforePosition?: number;
        }) => Promise<ExperimentRuntimeItemsPage>
      >()
      .mockRejectedValueOnce(new Error("host unreachable"));

    await expect(readExperimentResponseTranscript(readPage, "candidate-4")).rejects.toThrow(
      "host unreachable",
    );
  });
});
