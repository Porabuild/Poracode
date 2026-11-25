import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerLocalStoragePressureRelief,
  resetLocalStoragePressureReliefsForTest,
} from "@/renderer/utils/localStorage";
import { createComposerDraftStorage } from "./composerDraftStorage";
import type { DraftContent } from "./slices/types";

const content: DraftContent = {
  segments: [{ kind: "text", content: "unsent text" }],
  attachments: [],
};
const quota = () => new DOMException("The quota has been exceeded.", "QuotaExceededError");
const DRAFT = 'poracode-composer-draft-v2:["thread","one"]';
const journals = () =>
  Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(
    (key): key is string => key?.startsWith("poracode-composer-draft-journal-v1:") ?? false,
  );

// With IndexedDB present the close-time flush writes a synchronous journal
// first and the record later through an async transaction.
describe("composer drafts under a full quota with IndexedDB writes", () => {
  let store: ReturnType<typeof createComposerDraftStorage>;
  let failed: ReturnType<typeof vi.fn<(event: Event) => void>>;
  beforeEach(() => {
    localStorage.clear();
    store = createComposerDraftStorage(localStorage, window);
    failed = vi.fn<(event: Event) => void>();
    window.addEventListener("poracode:composer-draft-save-failed", failed);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    store.dispose();
    window.removeEventListener("poracode:composer-draft-save-failed", failed);
    vi.restoreAllMocks();
    resetLocalStoragePressureReliefsForTest();
    localStorage.clear();
  });

  it("makes room for the close-time journal and saves the draft", async () => {
    const disposable = "poracode-git-cache-v3:branches:old";
    localStorage.setItem(disposable, "x".repeat(200_000));
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      name,
      value,
    ) {
      // The origin stays full until the disposable cache entry is gone.
      if (localStorage.getItem(disposable) !== null) throw quota();
      original.call(this, name, value);
    });
    const relieved = vi.fn<() => number>(() => {
      localStorage.removeItem(disposable);
      return 400_000;
    });
    registerLocalStoragePressureRelief(relieved);

    store.save("thread", "one", content);
    store.flush();
    expect(relieved).toHaveBeenCalledTimes(1);
    await store.flushRequired();
    expect(relieved).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(DRAFT)!).content).toEqual(content);
    expect(journals()).toEqual([]);
  });

  it("reports once when nothing disposable can be freed", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quota();
    });

    store.save("thread", "one", content);
    store.flush();
    await store.flushRequired().catch(() => undefined);

    expect(failed).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DRAFT)).toBeNull();
    expect(store.currentDraft("thread", "one")?.segments).toEqual(content.segments);
  });
});
