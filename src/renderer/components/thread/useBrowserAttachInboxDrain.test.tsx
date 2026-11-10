import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBrowserAttachInbox, type BrowserAttachItem } from "@/renderer/state/browserAttachInbox";
import {
  useBrowserAttachInboxDrain,
  type PickedBrowserAttachment,
} from "./useBrowserAttachInboxDrain";

function item(threadId: string, id: string): BrowserAttachItem {
  return {
    id,
    threadId,
    attachmentPath: `/tmp/${id}.png`,
    attachmentName: `${id}.png`,
    mimeType: "image/png",
    selector: `#${id}`,
    sourceUrl: "https://example.test/",
    createdAt: 1,
  };
}

function enqueue(...items: BrowserAttachItem[]) {
  act(() => {
    useBrowserAttachInbox.setState((state) => {
      const itemsByThread = { ...state.itemsByThread };
      for (const entry of items) {
        itemsByThread[entry.threadId] = [...(itemsByThread[entry.threadId] ?? []), entry];
      }
      return { itemsByThread };
    });
  });
}

afterEach(() => {
  useBrowserAttachInbox.setState({ itemsByThread: {} });
});

describe("useBrowserAttachInboxDrain", () => {
  it("drains only its own inbox key into the latest callback", () => {
    const first = vi.fn<(attachment: PickedBrowserAttachment) => void>();
    const latest = vi.fn<(attachment: PickedBrowserAttachment) => void>();
    const { rerender } = renderHook(
      ({ onPicked }) => useBrowserAttachInboxDrain("thread-a", onPicked),
      {
        initialProps: { onPicked: first },
      },
    );
    rerender({ onPicked: latest });

    enqueue(item("thread-a", "a1"), item("thread-b", "b1"), item("thread-a", "a2"));

    expect(first).not.toHaveBeenCalled();
    expect(latest.mock.calls.map(([attachment]) => attachment)).toEqual([
      {
        path: "/tmp/a1.png",
        name: "a1.png",
        mimeType: "image/png",
        selector: "#a1",
        sourceUrl: "https://example.test/",
      },
      {
        path: "/tmp/a2.png",
        name: "a2.png",
        mimeType: "image/png",
        selector: "#a2",
        sourceUrl: "https://example.test/",
      },
    ]);
    expect(useBrowserAttachInbox.getState().itemsByThread["thread-a"] ?? []).toEqual([]);
    expect(useBrowserAttachInbox.getState().itemsByThread["thread-b"]).toHaveLength(1);
  });

  it("drains items that were queued before the composer mounted", () => {
    enqueue(item("draft:project-1", "early"));
    const onPicked = vi.fn<(attachment: PickedBrowserAttachment) => void>();
    renderHook(() => useBrowserAttachInboxDrain("draft:project-1", onPicked));
    expect(onPicked).toHaveBeenCalledOnce();
    expect(onPicked.mock.calls[0]?.[0].name).toBe("early.png");
  });
});
