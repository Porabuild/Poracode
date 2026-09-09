import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createComposerDraftStorage } from "./composerDraftStorage";
import type { DraftContent } from "./slices/types";

const content: DraftContent = {
  segments: [{ kind: "text", content: "Unsent 日本語\nsecond line" }],
  attachments: [
    {
      id: "image",
      path: "/saved/image.png",
      name: "image.png",
      isImage: true,
      previewUrl: "blob:temporary",
    },
  ],
};

describe("composer draft checkpoints", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("recovers serialized text and durable attachments in a new client instance", () => {
    const first = createComposerDraftStorage(localStorage, window);
    first.save("thread", "remote:server-a:thread:1", content);
    vi.advanceTimersByTime(250);
    const reloaded = createComposerDraftStorage(localStorage, window);
    expect(reloaded.load("thread")["remote:server-a:thread:1"]).toEqual({
      segments: content.segments,
      attachments: [{ id: "image", path: "/saved/image.png", name: "image.png", isImage: true }],
    });
  });

  it("coalesces rapid typing and flushes the latest content on pagehide", () => {
    const store = createComposerDraftStorage(localStorage, window);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    store.save("project", "one", content);
    store.save("project", "one", { ...content, segments: [{ kind: "text", content: "latest" }] });
    expect(setItem).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pagehide"));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(store.load("project").one?.segments).toEqual([{ kind: "text", content: "latest" }]);
    vi.advanceTimersByTime(1000);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect a sent or discarded draft from a queued checkpoint", () => {
    const store = createComposerDraftStorage(localStorage, window);
    store.save("thread", "one", content);
    store.flush();
    store.save("thread", "one", content);
    store.remove("thread", "one");
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(1000);
    expect(store.load("thread")).toEqual({});
  });

  it("keeps different servers, projects and windows from overwriting unrelated drafts", () => {
    const first = createComposerDraftStorage(localStorage, window);
    const second = createComposerDraftStorage(localStorage, window);
    first.save("thread", "remote:a:thread:1", content);
    second.save("thread", "remote:b:thread:1", content);
    second.save("project", "remote:a:thread:1", content);
    first.flush();
    second.flush();
    expect(Object.keys(first.load("thread"))).toEqual(["remote:a:thread:1", "remote:b:thread:1"]);
    expect(Object.keys(first.load("project"))).toEqual(["remote:a:thread:1"]);
  });

  it("starts without drafts for a previous-version profile and isolates corrupt records", () => {
    localStorage.setItem("poracode-app-v2", JSON.stringify({ version: 5, state: { threads: [] } }));
    const store = createComposerDraftStorage(localStorage, window);
    expect(store.load("thread")).toEqual({});
    localStorage.setItem('poracode-composer-draft-v1:["thread","bad"]', "{broken");
    localStorage.setItem(
      'poracode-composer-draft-v1:["thread","invalid"]',
      JSON.stringify({ segments: [{}], attachments: [] }),
    );
    store.save("thread", "valid", content);
    store.flush();
    expect(Object.keys(store.load("thread"))).toEqual(["valid"]);
  });
});
