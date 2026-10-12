import { describe, expect, it, vi } from "vitest";
import {
  dispatchOptimisticCatalogEdit,
  projectPendingCatalogEdit,
  projectAuthoritativeCatalogPatch,
} from "./pendingCatalogEdits";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

describe("pending catalog edits", () => {
  it("coalesces undispatched script writes without accepting skipped values as a rollback base", async () => {
    const first = deferred();
    const last = deferred();
    let row = { id: "coalesced-scripts", scripts: "original" };
    const writes: string[] = [];
    const save = (scripts: string, host: ReturnType<typeof deferred>) =>
      dispatchOptimisticCatalogEdit({
        kind: "project",
        row,
        patch: { scripts },
        coalesceKey: "scripts",
        apply: () => {
          row = { ...row, scripts };
        },
        write: () => {
          writes.push(scripts);
          return host.promise;
        },
        restore: (base) => {
          row = base;
        },
      });
    const initial = save("first", first);
    const queued = Array.from({ length: 30 }, (_, index) => save(`edit-${index}`, last));
    const refused = queued.at(-1)!.catch((error: unknown) => error);
    expect(row.scripts).toBe("edit-29");
    first.resolve();
    await initial;
    await vi.waitFor(() => expect(writes).toEqual(["first", "edit-29"]));
    last.reject(new Error("refused"));
    expect(await refused).toBeInstanceOf(Error);
    await Promise.all(queued.slice(0, -1));
    expect(row.scripts).toBe("first");
  });

  it("preserves ordering barriers between coalescible writes", async () => {
    const host = deferred();
    const row = { id: "coalescing-barrier", scripts: "", title: "" };
    const writes: string[] = [];
    const save = (label: string, coalesceKey?: string) =>
      dispatchOptimisticCatalogEdit({
        kind: "project",
        row,
        patch: coalesceKey ? { scripts: label } : { title: label },
        ...(coalesceKey ? { coalesceKey } : {}),
        apply: () => {},
        restore: () => {},
        write: () => {
          writes.push(label);
          return writes.length === 1 ? host.promise : Promise.resolve();
        },
      });
    const jobs = [
      save("first", "scripts"),
      save("before", "scripts"),
      save("barrier"),
      save("after", "scripts"),
    ];
    host.resolve();
    await Promise.all(jobs);
    expect(writes).toEqual(["first", "before", "barrier", "after"]);
  });
  it("paints immediately and rejects stale metadata until the host has confirmed the intent", async () => {
    const host = deferred();
    const before = { id: "held", title: "Old" };
    let painted = before;
    const saving = dispatchOptimisticCatalogEdit({
      kind: "thread",
      row: before,
      patch: { title: "New" },
      apply: () => {
        painted = { ...before, title: "New" };
      },
      write: () => host.promise,
      restore: (row) => {
        painted = row;
      },
    });
    expect(painted.title).toBe("New");
    expect(projectPendingCatalogEdit("thread", before).title).toBe("New");
    host.resolve();
    await saving;
    expect(projectPendingCatalogEdit("thread", before).title).toBe("New");
    expect(projectPendingCatalogEdit("thread", painted)).toEqual(painted);
    expect(projectPendingCatalogEdit("thread", { ...before, title: "Another device" }).title).toBe(
      "Another device",
    );
  });

  it("allows the metadata event to arrive before the command acknowledgment", async () => {
    const host = deferred();
    const before = { id: "event-first", title: "Old" };
    const saving = dispatchOptimisticCatalogEdit({
      kind: "thread",
      row: before,
      patch: { title: "New" },
      apply: () => {},
      write: () => host.promise,
      restore: () => {},
    });
    projectPendingCatalogEdit("thread", { ...before, title: "New" });
    host.resolve();
    await saving;
    expect(projectPendingCatalogEdit("thread", { ...before, title: "External edit" }).title).toBe(
      "External edit",
    );
  });

  it("serializes typing without rolling back a newer edit when the preceding save fails", async () => {
    const first = deferred();
    const second = deferred();
    let row = { id: "typing", title: "a", icon: "folder" };
    const writes: string[] = [];
    const save = (title: string, host: ReturnType<typeof deferred>) =>
      dispatchOptimisticCatalogEdit({
        kind: "project",
        row,
        patch: { title },
        apply: () => {
          row = { ...row, title };
        },
        write: () => {
          writes.push(title);
          return host.promise;
        },
        restore: (restored) => {
          row = restored;
        },
      });
    const one = save("ab", first);
    const refused = one.catch((error: unknown) => error);
    const two = save("abc", second);
    expect(row.title).toBe("abc");
    expect(writes).toEqual(["ab"]);
    first.reject(new Error("offline"));
    expect(await refused).toBeInstanceOf(Error);
    expect(row.title).toBe("abc");
    await vi.waitFor(() => expect(writes).toEqual(["ab", "abc"]));
    second.resolve();
    await two;
    projectPendingCatalogEdit("project", row);
  });

  it("restores a failed independent field while preserving a later pending field", async () => {
    const first = deferred();
    const second = deferred();
    let row = { id: "fields", title: "a", icon: "folder" };
    const one = dispatchOptimisticCatalogEdit({
      kind: "project",
      row,
      patch: { title: "b" },
      apply: () => {
        row = { ...row, title: "b" };
      },
      write: () => first.promise,
      restore: (restored) => {
        row = restored;
      },
    });
    const refused = one.catch((error: unknown) => error);
    const two = dispatchOptimisticCatalogEdit({
      kind: "project",
      row,
      patch: { icon: "rocket" },
      apply: () => {
        row = { ...row, icon: "rocket" };
      },
      write: () => second.promise,
      restore: (restored) => {
        row = restored;
      },
    });
    first.reject(new Error("offline"));
    expect(await refused).toBeInstanceOf(Error);
    expect(row).toEqual({ id: "fields", title: "a", icon: "rocket" });
    second.resolve();
    await two;
    projectPendingCatalogEdit("project", row);
  });

  it("retires confirmed overlays despite host-generated timestamp differences", async () => {
    const row = { id: "timestamp", archived: false, archivedAt: "" };
    await dispatchOptimisticCatalogEdit({
      kind: "thread",
      row,
      patch: { archived: true, archivedAt: "local" },
      serverGeneratedFields: ["archivedAt"],
      apply: () => {},
      write: () => Promise.resolve(),
      restore: () => {},
    });
    const canonical = { ...row, archived: true, archivedAt: "host" };
    expect(projectPendingCatalogEdit("thread", canonical)).toEqual(canonical);
  });

  it("restores the latest authoritative value when a competing edit arrives before refusal", async () => {
    const host = deferred();
    let row = { id: "competing", title: "New thread" };
    const saving = dispatchOptimisticCatalogEdit({
      kind: "thread",
      row,
      patch: { title: "Manual title" },
      apply: () => {
        row = { ...row, title: "Manual title" };
      },
      write: () => host.promise,
      restore: (restored) => {
        row = restored;
      },
    });
    const refused = saving.catch((error: unknown) => error);
    expect(projectPendingCatalogEdit("thread", { ...row, title: "Generated title" }).title).toBe(
      "Manual title",
    );
    host.reject(new Error("refused"));
    expect(await refused).toBeInstanceOf(Error);
    expect(row.title).toBe("Generated title");
  });

  it("does not overwrite a newer observed value with an older acknowledgment before a later refusal", async () => {
    const first = deferred();
    const second = deferred();
    let row = { id: "older-ack", title: "original" };
    const save = (title: string, host: ReturnType<typeof deferred>) =>
      dispatchOptimisticCatalogEdit({
        kind: "thread",
        row,
        patch: { title },
        apply: () => {
          row = { ...row, title };
        },
        write: () => host.promise,
        restore: (restored) => {
          row = restored;
        },
      });
    const one = save("first", first);
    const two = save("second", second);
    const refused = two.catch((error: unknown) => error);
    projectPendingCatalogEdit("thread", { ...row, title: "newer authority" });
    first.resolve();
    await one;
    second.reject(new Error("refused"));
    expect(await refused).toBeInstanceOf(Error);
    expect(row.title).toBe("newer authority");
  });

  it("retains an accepted field when only unrelated authority changed before acknowledgment", async () => {
    const first = deferred();
    const second = deferred();
    let row = { id: "unrelated", title: "original", starred: false };
    const save = (title: string, host: ReturnType<typeof deferred>) =>
      dispatchOptimisticCatalogEdit({
        kind: "thread",
        row,
        patch: { title },
        apply: () => {
          row = { ...row, title };
        },
        write: () => host.promise,
        restore: (restored) => {
          row = restored;
        },
      });
    const one = save("first", first);
    const two = save("second", second);
    const refused = two.catch((error: unknown) => error);
    projectPendingCatalogEdit("thread", { ...row, title: "original", starred: true });
    first.resolve();
    await one;
    second.reject(new Error("refused"));
    expect(await refused).toBeInstanceOf(Error);
    expect(row).toEqual({ id: "unrelated", title: "first", starred: true });
  });

  it("keeps the latest intent while an earlier host command is forwarded, without contaminating other fields", async () => {
    const first = deferred();
    const second = deferred();
    let row = { id: "forwarded", title: "original", starred: false };
    const one = dispatchOptimisticCatalogEdit({
      kind: "thread",
      row,
      patch: { title: "typed" },
      apply: () => {
        row = { ...row, title: "typed" };
      },
      write: () => first.promise,
      restore: (restored) => {
        row = restored;
      },
    });
    const two = dispatchOptimisticCatalogEdit({
      kind: "thread",
      row,
      patch: { starred: true },
      apply: () => {
        row = { ...row, starred: true };
      },
      write: () => second.promise,
      restore: (restored) => {
        row = restored;
      },
    });
    const refused = two.catch((error: unknown) => error);
    row = projectAuthoritativeCatalogPatch("thread", row, { title: "typed" });
    expect(row.starred).toBe(true);
    first.resolve();
    await one;
    second.reject(new Error("refused"));
    expect(await refused).toBeInstanceOf(Error);
    expect(row).toEqual({ id: "forwarded", title: "typed", starred: false });
  });
});
