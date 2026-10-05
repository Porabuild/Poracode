import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeRuntimeStreamKey } from "./runtimeStreamHeadCodec";
import {
  measureRuntimeStreamHeadStorage,
  readRuntimeStreamHeadMetadata,
} from "./runtimeStreamHeadRead";
import {
  appendRuntimeStreamHead,
  isRuntimeStreamHeadIndexed,
  peekRuntimeStreamHead,
  prepareRuntimeStreamHead,
  resetRuntimeStreamHead,
} from "./runtimeStreamHeadStore";
import {
  createHeadFixture,
  fixtureAppend,
  fixtureHeads,
  HEAD_ITEM,
  HEAD_THREAD,
  openHeadDatabase,
  seedHeadItem,
  sqliteAvailable,
} from "./runtimeStreamHeadStore.testFixtures";

const key = { threadId: HEAD_THREAD, itemId: HEAD_ITEM, stream: "text" };

describe.skipIf(!sqliteAvailable)("transactional stream head authority", () => {
  let sqlite: InstanceType<typeof Database>;
  let peer: InstanceType<typeof Database> | undefined;
  let directory: string;
  let path: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "poracode-head-authority-"));
    path = join(directory, "state.sqlite");
    sqlite = openHeadDatabase(path);
    sqlite.pragma("journal_mode = WAL");
    createHeadFixture(sqlite);
    seedHeadItem(sqlite, JSON.stringify({ text: "seed", sibling: "kept" }));
  });
  afterEach(() => {
    peer?.close();
    peer = undefined;
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("rolls seed indexing/block insertion back on fault and retries from committed state", () => {
    sqlite.exec(`CREATE TRIGGER reject_first_block BEFORE INSERT ON thread_runtime_item_stream_head_blocks
      BEGIN SELECT RAISE(ABORT,'fixture insert failure'); END;`);
    expect(() => fixtureAppend(sqlite, "text", "new")).toThrow("fixture insert failure");
    expect(isRuntimeStreamHeadIndexed(sqlite, HEAD_THREAD, HEAD_ITEM)).toBe(false);
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "seed", sibling: "kept" });
    sqlite.exec("DROP TRIGGER reject_first_block");
    fixtureAppend(sqlite, "text", "new");
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "seednew", sibling: "kept" });
    expect(peekRuntimeStreamHead(sqlite, key)).toMatchObject({
      seed_chars: 4,
      head_chars: 7,
      next_seq: 1,
    });
  });

  it("rolls open writes/scalars back and reads fresh metadata even for a reused head ID", () => {
    fixtureAppend(sqlite, "text", "first");
    const committed = peekRuntimeStreamHead(sqlite, key)!;
    sqlite.exec(`CREATE TRIGGER reject_scalar_update BEFORE UPDATE ON thread_runtime_item_stream_heads
      WHEN NEW.head_chars > ${committed.head_chars}
      BEGIN SELECT RAISE(ABORT,'fixture scalar failure'); END;`);
    expect(() =>
      sqlite
        .transaction(() => appendRuntimeStreamHead(sqlite, committed.head_id, "FAIL"))
        .immediate(),
    ).toThrow("fixture scalar failure");
    expect(peekRuntimeStreamHead(sqlite, key)).toEqual(committed);
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "seedfirst", sibling: "kept" });
    sqlite.exec("DROP TRIGGER reject_scalar_update");
    sqlite.transaction(() => appendRuntimeStreamHead(sqlite, committed.head_id, "OK")).immediate();
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "seedfirstOK", sibling: "kept" });
  });

  it("rolls a deferred COMMIT failure back before a later prepare/append retry", () => {
    sqlite.exec(`
      CREATE TABLE fixture_parent(id INTEGER PRIMARY KEY);
      CREATE TABLE fixture_deferred(id INTEGER REFERENCES fixture_parent(id) DEFERRABLE INITIALLY DEFERRED);
    `);
    expect(() =>
      sqlite
        .transaction(() => {
          const ready = prepareRuntimeStreamHead(sqlite, key);
          if (ready.kind !== "ready" || !ready.head) throw new Error("not ready");
          appendRuntimeStreamHead(sqlite, ready.head.head_id, "pending");
          sqlite.prepare("INSERT INTO fixture_deferred VALUES (1)").run();
        })
        .immediate(),
    ).toThrow("FOREIGN KEY");
    expect(sqlite.inTransaction).toBe(false);
    expect(isRuntimeStreamHeadIndexed(sqlite, HEAD_THREAD, HEAD_ITEM)).toBe(false);
    fixtureAppend(sqlite, "text", "retry");
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "seedretry", sibling: "kept" });
  });

  it("restores nested savepoints and outer reset rollback without volatile observations", () => {
    fixtureAppend(sqlite, "text", "committed");
    const committed = peekRuntimeStreamHead(sqlite, key)!;
    sqlite
      .transaction(() => {
        appendRuntimeStreamHead(sqlite, committed.head_id, "outer");
        expect(() =>
          sqlite.transaction(() => {
            resetRuntimeStreamHead(sqlite, committed.head_id);
            appendRuntimeStreamHead(sqlite, committed.head_id, "discarded");
            throw new Error("savepoint failure");
          })(),
        ).toThrow("savepoint failure");
        appendRuntimeStreamHead(sqlite, committed.head_id, "end");
      })
      .immediate();
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({
      text: "seedcommittedouterend",
      sibling: "kept",
    });
    const afterOuter = peekRuntimeStreamHead(sqlite, key)!;
    expect(() =>
      sqlite
        .transaction(() => {
          resetRuntimeStreamHead(sqlite, afterOuter.head_id);
          appendRuntimeStreamHead(sqlite, afterOuter.head_id, "discarded again");
          throw new Error("outer failure");
        })
        .immediate(),
    ).toThrow("outer failure");
    expect(peekRuntimeStreamHead(sqlite, key)).toEqual(afterOuter);
  });

  it("sees same-size external seed replacement and fresh block/scalar edits across connections", () => {
    fixtureAppend(sqlite, "text", "one");
    peer = openHeadDatabase(path);
    peer.pragma("foreign_keys = ON");
    const version = sqlite.pragma("data_version", { simple: true });
    const replacement = JSON.stringify({ text: "new!", sibling: "kept" });
    peer
      .prepare("UPDATE thread_runtime_items SET streams=? WHERE item_id=?")
      .run(replacement, HEAD_ITEM);
    expect(sqlite.pragma("data_version", { simple: true })).not.toBe(version);
    expect(peekRuntimeStreamHead(sqlite, key)).toBeUndefined();
    fixtureAppend(sqlite, "text", "A");
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "new!A", sibling: "kept" });
    fixtureAppend(peer, "text", "B");
    const head = peekRuntimeStreamHead(sqlite, key)!;
    expect(head).toMatchObject({ seed_chars: 4, head_chars: 6, next_seq: 1, open_chars: 2 });
    sqlite.transaction(() => appendRuntimeStreamHead(sqlite, head.head_id, "C")).immediate();
    expect(fixtureHeads(peer).get(HEAD_ITEM)).toEqual({ text: "new!ABC", sibling: "kept" });
  });

  it("keeps one read snapshot while another connection commits", () => {
    fixtureAppend(sqlite, "text", "before");
    peer = openHeadDatabase(path);
    peer.pragma("foreign_keys = ON");
    sqlite.transaction(() => {
      const before = fixtureHeads(sqlite).get(HEAD_ITEM);
      fixtureAppend(peer!, "text", "after");
      expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual(before);
    })();
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({
      text: "seedbeforeafter",
      sibling: "kept",
    });
  });

  it("reads effective heads and scalar/storage projections through a native readonly handle", () => {
    fixtureAppend(sqlite, "text", "blocks");
    peer = openHeadDatabase(path, true);
    expect(peer.readonly).toBe(true);
    expect(fixtureHeads(peer).get(HEAD_ITEM)).toEqual({ text: "seedblocks", sibling: "kept" });
    expect(peekRuntimeStreamHead(peer, key)).toMatchObject({ head_chars: 10, head_has_content: 1 });
    expect(isRuntimeStreamHeadIndexed(peer, HEAD_THREAD, HEAD_ITEM)).toBe(true);
    expect(
      readRuntimeStreamHeadMetadata(peer, HEAD_THREAD, [HEAD_ITEM]).get(HEAD_ITEM),
    ).toHaveLength(2);
    expect(
      measureRuntimeStreamHeadStorage(peer, HEAD_THREAD, [HEAD_ITEM]).get(HEAD_ITEM),
    ).toMatchObject({ blockBytes: 12, blockCount: 1, streamCount: 2 });
  });

  it("resets overlays on explicit raw seed assignment, preserves payload/state edits and cascades keys", () => {
    fixtureAppend(sqlite, "text", "blocks");
    const originalHead = peekRuntimeStreamHead(sqlite, key)!;
    sqlite.prepare("UPDATE thread_runtime_items SET state='completed',payload='kept'").run();
    expect(peekRuntimeStreamHead(sqlite, key)).toEqual(originalHead);
    sqlite.prepare("UPDATE thread_runtime_items SET item_id='moved'").run();
    expect(peekRuntimeStreamHead(sqlite, key)).toBeUndefined();
    expect(fixtureHeads(sqlite, ["moved"]).get("moved")).toEqual({
      text: "seedblocks",
      sibling: "kept",
    });
    expect(peekRuntimeStreamHead(sqlite, { ...key, itemId: "moved" })?.head_id).toBe(
      originalHead.head_id,
    );
    const seed = JSON.stringify({ text: "replacement" });
    sqlite.prepare("UPDATE thread_runtime_items SET streams=? WHERE item_id='moved'").run(seed);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM thread_runtime_item_stream_head_blocks").get(),
    ).toEqual({ n: 0 });
    expect(fixtureHeads(sqlite, ["moved"]).get("moved")).toEqual({ text: "replacement" });
  });

  it("does not reuse deleted-row metadata and remains fresh after close/rebind", () => {
    fixtureAppend(sqlite, "text", "old");
    const old = peekRuntimeStreamHead(sqlite, key)!;
    sqlite.prepare("DELETE FROM thread_runtime_items WHERE item_id=?").run(HEAD_ITEM);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM thread_runtime_item_stream_head_blocks").get(),
    ).toEqual({ n: 0 });
    seedHeadItem(sqlite, JSON.stringify({ text: "new" }));
    fixtureAppend(sqlite, "text", "fresh");
    expect(peekRuntimeStreamHead(sqlite, key)?.stream_key).toBe(encodeRuntimeStreamKey("text"));
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "newfresh" });
    // Integer IDs may be reused; only the current committed row is authoritative.
    sqlite.transaction(() => appendRuntimeStreamHead(sqlite, old.head_id, "live")).immediate();
    sqlite.close();
    sqlite = openHeadDatabase(path);
    sqlite.pragma("foreign_keys = ON");
    fixtureAppend(sqlite, "text", "reopen");
    expect(fixtureHeads(sqlite).get(HEAD_ITEM)).toEqual({ text: "newfreshlivereopen" });
  });
});
