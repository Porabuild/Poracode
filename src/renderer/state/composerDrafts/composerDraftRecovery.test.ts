import "@/renderer/testUtils/clientDraftDatabase";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createComposerDraftStorage } from "../composerDraftStorage";
import { writeClientDraftJournal } from "./clientDraftJournal";
import { listClientSubmissions } from "./clientDraftDatabase";

const content = (text: string) => ({
  segments: [{ kind: "text" as const, content: text }],
  attachments: [],
});
const name = 'poracode-composer-draft-v2:["project","p"]';
const legacyName = 'poracode-composer-draft-v1:["project","p"]';
const stores: ReturnType<typeof createComposerDraftStorage>[] = [];
function instance() {
  const store = createComposerDraftStorage(localStorage, window);
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  vi.restoreAllMocks();
});

describe("draft checkpoint recovery and conditional retirement", () => {
  it("migrates a released v1 checkpoint without deleting later edits from an older tab", async () => {
    const legacy = JSON.stringify(content("old tab"));
    localStorage.setItem(legacyName, legacy);
    const first = instance();
    expect(first.load("project").p).toEqual(content("old tab"));
    const checkpoint = await first.checkpoint("project", "p", content("old tab"));
    expect(await first.acknowledge(checkpoint)).toBe(true);
    expect(localStorage.getItem(legacyName)).toBe(legacy);
    expect(instance().load("project").p).toBeUndefined();
    localStorage.setItem(legacyName, JSON.stringify(content("older tab edited again")));
    expect(instance().load("project").p).toEqual(content("older tab edited again"));
  });

  it("does not let a delayed legacy migration overwrite a newer window's checkpoint", async () => {
    localStorage.setItem(legacyName, JSON.stringify(content("legacy")));
    const delayed = instance();
    delayed.load("project");
    const current = instance();
    current.save("project", "p", content("newer"));
    await current.flushRequired();
    await expect(delayed.flushRequired()).rejects.toThrow("another window");
    expect(instance().load("project").p).toEqual(content("newer"));
    expect(JSON.parse(localStorage.getItem(legacyName)!)).toEqual(content("legacy"));
  });

  it("preserves conflicting user edits in a recovery copy instead of overwriting another window", async () => {
    const seed = instance();
    await seed.checkpoint("project", "p", content("base"));
    const first = instance();
    const second = instance();
    first.load("project");
    second.load("project");
    first.save("project", "p", content("first edit"));
    second.save("project", "p", content("second edit"));
    await first.flushRequired();
    await expect(second.flushRequired()).rejects.toThrow("another window");
    expect(instance().load("project").p).toEqual(content("first edit"));
    expect(await listClientSubmissions()).toEqual([
      expect.objectContaining({
        state: "failed",
        content: expect.objectContaining({ recoveryContent: content("second edit") }),
      }),
    ]);
  });

  it("lets explicit recovery merge a stale writer with the durable winner", async () => {
    await instance().checkpoint("project", "p", content("base"));
    const first = instance();
    const second = instance();
    first.load("project");
    second.load("project");
    first.save("project", "p", content("winner"));
    second.save("project", "p", content("loser"));
    await first.flushRequired();
    await expect(second.flushRequired()).rejects.toThrow("another window");
    const apply = vi.fn<(draft: unknown) => void>();
    await second.recover("project", "p", apply);
    expect(apply).toHaveBeenCalledOnce();
    const restored = instance().load("project").p!;
    expect(restored.segments).toEqual([
      ...content("loser").segments,
      { kind: "text", content: "\n\n" },
      ...content("winner").segments,
    ]);
    second.save("project", "p", content("new edit after recovery"));
    await second.flushRequired();
    expect(instance().load("project").p).toEqual(content("new edit after recovery"));
  });

  it("applies a late exact-base removal journal without resurrecting a legacy draft", async () => {
    localStorage.setItem(legacyName, JSON.stringify(content("legacy")));
    const store = instance();
    store.load("project");
    await store.flushRequired();
    const base = localStorage.getItem(name);
    const alreadyLoaded = instance();
    alreadyLoaded.load("project");
    writeClientDraftJournal(localStorage, "closed-window", name, base, null);
    await alreadyLoaded.recoverJournals();
    expect(alreadyLoaded.load("project").p).toBeUndefined();
    expect(instance().load("project").p).toBeUndefined();
    expect(localStorage.getItem(legacyName)).not.toBeNull();
  });

  it("captures the submitted revision before async persistence and preserves subsequent typing", async () => {
    const store = instance();
    const pending = store.checkpoint("project", "p", content("submitted"));
    store.save("project", "p", content("new typing"));
    const checkpoint = await pending;
    const retire = vi.fn<() => void>();
    expect(checkpoint.content).toEqual(content("submitted"));
    expect(await store.acknowledge(checkpoint, retire)).toBe(false);
    expect(retire).not.toHaveBeenCalled();
    expect(instance().load("project").p).toEqual(content("new typing"));
  });

  it("recovers a close-time journal before the asynchronous metadata writer can run", async () => {
    const store = instance();
    store.save("project", "p", content("close now"));
    window.dispatchEvent(new Event("pagehide"));
    // No IDB callback has run yet. Recovery uses the synchronous journal.
    expect(localStorage.getItem(name)).toBeNull();
    const restored = instance();
    expect(restored.load("project").p).toEqual(content("close now"));
    await store.flushRequired();
    // The old page completed its write in this test; an exact match is harmless.
    await restored.flushRequired().catch(() => undefined);
    await restored.recoverJournals();
    expect(instance().load("project").p).toEqual(content("close now"));
  });

  it("preserves the actual draft selection across reload and protects future checkpoints", async () => {
    const store = instance();
    store.saveSelection("project", "p", { agentKind: "codex", model: "gpt-5.4", mode: "plan" });
    await store.flushRequired();
    expect(instance().selection("project", "p")).toMatchObject({ mode: "plan" });
    const future = JSON.stringify({ formatVersion: 99, text: "future draft" });
    localStorage.setItem(name, future);
    const oldClient = instance();
    oldClient.save("project", "p", content("new edit"));
    await expect(oldClient.flushRequired()).rejects.toThrow("Unsupported");
    expect(localStorage.getItem(name)).toBe(future);
  });
});

it("indexes close journals once per bulk load and write", async () => {
  class CountingStorage implements Storage {
    values = new Map<string, string>();
    keyVisits = 0;
    get length() {
      return this.values.size;
    }
    clear() {
      this.values.clear();
    }
    getItem(key: string) {
      return this.values.get(key) ?? null;
    }
    key(index: number) {
      this.keyVisits++;
      return [...this.values.keys()][index] ?? null;
    }
    removeItem(key: string) {
      this.values.delete(key);
    }
    setItem(key: string, value: string) {
      this.values.set(key, value);
    }
  }
  const storage = new CountingStorage();
  const count = 20;
  for (let index = 0; index < count; index++)
    storage.setItem(
      "poracode-composer-draft-v2:" + JSON.stringify(["project", String(index)]),
      JSON.stringify({
        formatVersion: 2,
        draftId: `draft-${index}`,
        revision: 1,
        content: content("before"),
      }),
    );
  const store = createComposerDraftStorage(storage, window);
  stores.push(store);
  expect(Object.keys(store.load("project"))).toHaveLength(count);
  expect(storage.keyVisits).toBeLessThanOrEqual(2 * count);
  storage.keyVisits = 0;
  for (let index = 0; index < count; index++)
    store.save("project", String(index), content("after"));
  await store.flushRequired();
  expect(storage.keyVisits).toBeLessThanOrEqual(count);
});

it("retains both attachment-bar and attachment-segment asset references", () => {
  const store = instance();
  const segment = "poracode-draft-asset:segment/a.png";
  const bar = "poracode-draft-asset:bar/b.png";
  store.save("project", "p", {
    segments: [{ kind: "attachment", path: segment }],
    attachments: [{ id: "bar", name: "b.png", path: bar, isImage: true }],
  });
  expect(store.referencedAssets()).toEqual(new Set([segment, bar]));
});
