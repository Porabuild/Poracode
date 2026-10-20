import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRuntimePayloadProjectionSource,
  RUNTIME_PAYLOAD_PROJECTION_MODULE,
} from "@/build/runtimePayloadProjectionSource.mjs";
import * as asyncReads from "./asyncReads";
import { elisionNotice } from "@/shared/runtimeStreamRetentionPolicy";
import { messageReplyFormText } from "@/shared/messageReplyForm";
import { closeDatabase, getSqlite, initDatabase, initReadOnlyDatabase } from "./connection";
import { dbDeleteThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetThreadRuntimeItemCommitted,
  dbReplaceThreadRuntimeItems,
  dbTruncateThreadRuntimeAfter,
  type PersistedRuntimeItem,
} from "./runtimeItems";
import { dbSearchConversations } from "./conversationSearch";
import {
  conversationSearchExpression,
  readConversationSearchBatch,
  SEARCH_INDEX_BATCH_ITEMS,
} from "./conversationSearchReads";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import {
  assertRequiredDatabaseSchema,
  LATEST_SCHEMA_VERSION,
  runDatabaseMigrations,
} from "./migrations";
import {
  captureSchema53PayloadOriginEvidence,
  createSchema53PayloadOriginDatabase,
  migrateSchema53FixtureThrough,
  installFixtureOrigin,
} from "./runtimePayloadOrigins.testFixtures";
import { prepareRuntimeStreamHead, appendRuntimeStreamHead } from "./runtimeStreamHeadStore";
import { ensureConversationSearchGeneration } from "./conversationSearchSchema";

describe.skipIf(!sqliteAvailable)("saved conversation search", () => {
  let directory: string;
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-search-"));
    initDatabase(join(directory, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), status: "idle", attention: "none" }, 0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });
  const message = (id: string, text: string, type = "assistant_message"): PersistedRuntimeItem => ({
    id,
    type,
    state: "completed",
    streams: {},
    payload: { content: [{ kind: "text", text }] },
  });
  const search = async (query: string, extra = {}) => {
    let page;
    do {
      page = await dbSearchConversations({ version: "1", query, ...extra });
    } while (page.indexing);
    return page;
  };
  const keyMoveTriggers = [
    "search_runtime_item_key_move",
    "search_thread_runtime_item_stream_chunks_owner_move",
    "search_thread_runtime_item_stream_heads_owner_move",
    "search_head_block_owner_move",
  ];
  const retainOldProjection = (sqlite: Database.Database) => {
    for (const name of keyMoveTriggers) sqlite.exec(`DROP TRIGGER ${name}`);
    sqlite.prepare("UPDATE conversation_search_meta SET generation = '3.visual2'").run();
  };
  const canonicalEvidence = (sqlite: Database.Database) => {
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'conversation_search*' AND name NOT GLOB 'sqlite_*' ORDER BY name",
      )
      .all() as { name: string }[];
    return tables.map(({ name }) => ({
      name,
      rows: sqlite.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
    }));
  };
  const replyForm = {
    questions: [
      {
        id: "format",
        question: "Generatedquestionneedle choose a format",
        options: [{ optionId: "compact", label: "Compact" }],
      },
    ],
  };

  it.each(["payload", "stream"])(
    "excludes generated reply-form %s text while keeping ordinary user text",
    async (source) => {
      const text = messageReplyFormText(replyForm);
      await dbReplaceThreadRuntimeItems("thread-1", [
        {
          ...message("generated", text),
          payload: { content: [{ kind: "text", text }], replyForm },
          streams: source === "stream" ? { assistant_text: text } : {},
        },
        message("user", text, "user_message"),
      ]);
      expect(
        (await search("Generatedquestionneedle")).entries.map((entry) => entry.itemId),
      ).toEqual(["user"]);
    },
  );

  it.each([false, true])(
    "keeps independent assistant prose with a reply form (authoritative: %s)",
    async (authoritative) => {
      const text = "Independentproseneedle remains visible next to the form.";
      await dbReplaceThreadRuntimeItems("thread-1", [
        {
          ...message("independent", text),
          payload: {
            content: [{ kind: "text", text }],
            replyForm,
            ...(authoritative ? { displayAuthoritative: true } : {}),
          },
          streams: authoritative ? { assistant_text: messageReplyFormText(replyForm) } : {},
        },
      ]);
      expect((await search("Independentproseneedle")).entries[0]?.itemId).toBe("independent");
    },
  );

  it("finds unopened user text and final answers, excluding tools, reasoning, nested messages and intermediate replies", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      message("user", "needle user", "user_message"),
      message("intermediate", "needle intermediate"),
      message("tool", "needle secret", "tool_call"),
      message("reasoning", "needle reasoning", "reasoning"),
      { ...message("child", "needle child"), parentItemId: "tool" },
      message("final", "needle final"),
    ]);
    expect((await search("needle")).entries.map((entry) => entry.itemId).sort()).toEqual([
      "final",
      "user",
    ]);
    expect(await search("secret")).toMatchObject({ entries: [] });
  });

  it("includes archived chats, supports project/archive filters, and excludes delegated threads", async () => {
    dbUpsertThread({ ...testThread(), archived: true, status: "idle", attention: "none" }, 0);
    await dbReplaceThreadRuntimeItems("thread-1", [message("archived", "archivekeyword")]);
    expect((await search("archivekeyword")).entries[0]?.archived).toBe(true);
    expect((await search("archivekeyword", { includeArchived: "false" })).entries).toEqual([]);
    expect((await search("archivekeyword", { projectId: "other" })).entries).toEqual([]);
    dbUpsertThread(
      { ...testThread(), parentThreadId: "parent", status: "idle", attention: "none" },
      0,
    );
    expect((await search("archivekeyword")).entries).toEqual([]);
  });

  it("retains final replies followed by non-chat plan and goal controls", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      message("final", "answerneedle"),
      message("plan", "plan", "plan"),
      message("goal", "goal", "goal"),
    ]);
    expect((await search("answerneedle")).entries[0]?.itemId).toBe("final");
  });

  it.each(["provider_handoff", "pending_request", "error"])(
    "retains a saved final reply across a completed %s control before the next user",
    async (type) => {
      await dbReplaceThreadRuntimeItems("thread-1", [
        message("final", "answerneedle"),
        message("control", "controlsecret", type),
        message("next-user", "next turn", "user_message"),
      ]);
      expect((await search("answerneedle")).entries.map((entry) => entry.itemId)).toEqual([
        "final",
      ]);
      expect((await search("controlsecret")).entries).toEqual([]);
    },
  );

  it("does not index a visual tail whose opening fence was elided", async () => {
    const text =
      "safeprose\n" +
      "x".repeat(257_000) +
      "\n```poracode-html-v1 chart\n" +
      " ".repeat(4_000_000) +
      "\n<script>htmlneedle</script>\n```";
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "elided",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: text },
      },
    ]);
    expect((await search("htmlneedle")).entries).toEqual([]);
    expect((await search("safeprose")).entries).toHaveLength(1);
  });

  it("uses authoritative assistant text, ignores attachments/metadata, and excludes visual HTML", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        ...message(
          "visual",
          "visible prose\n```poracode-html-v1 Calculator\n<script>credentialsecret</script>\n```",
        ),
        streams: { assistant_text: "obsolete stream", reasoning_text: "privatereasoning" },
        payload: {
          displayAuthoritative: true,
          credential: "configsecret",
          content: [
            {
              kind: "text",
              text: "visible prose\n```poracode-html-v1 Calculator\n<script>credentialsecret</script>\n```",
            },
            { kind: "image", dataUrl: "attachmentsecret" },
          ],
        },
      },
    ]);
    expect((await search("Calculator")).entries).toHaveLength(1);
    for (const term of [
      "credentialsecret",
      "configsecret",
      "attachmentsecret",
      "privatereasoning",
      "obsolete",
    ])
      expect((await search(term)).entries).toEqual([]);
  });

  it.each([
    {
      kind: "valid",
      version: 1,
      source: JSON.stringify({
        blocks: [{ type: "outputs", items: [{ label: "nativebodysecret", value: 42 }] }],
      }),
      closed: true,
    },
    { kind: "invalid", version: 1, source: "not JSON nativebodysecret {", closed: true },
    { kind: "future", version: 999, source: '{"body":"nativebodysecret"}', closed: true },
    { kind: "unclosed", version: 1, source: '{"body":"nativebodysecret"}', closed: false },
  ])(
    "keeps prose and title but excludes $kind native visual bodies",
    async ({ version, source, closed }) => {
      const text = `prefixneedle\n~~~poracode-visual-v${version} Publictitle\n${source}${closed ? "\n~~~" : ""}\nsuffixneedle`;
      await dbReplaceThreadRuntimeItems("thread-1", [message("native", text)]);
      const page = await search("prefixneedle");
      expect(page.entries.map((entry) => entry.itemId)).toEqual(["native"]);
      expect(page.entries[0]?.excerpt).toContain("Publictitle");
      expect((await search("Publictitle")).entries[0]?.itemId).toBe("native");
      expect((await search("suffixneedle")).entries.map((entry) => entry.itemId)).toEqual(
        closed ? ["native"] : [],
      );
      expect((await search("nativebodysecret")).entries).toEqual([]);
    },
  );

  it("fails closed after a legacy persisted elision notice without retention metadata", async () => {
    const text = `knownprose\n${elisionNotice(1000)}\n<script>unprovablesecret</script>\n\`\`\``;
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        ...message("legacy", text),
        payload: { displayAuthoritative: true, content: [{ kind: "text", text }] },
      },
    ]);
    expect((await search("knownprose")).entries).toHaveLength(1);
    expect((await search("unprovablesecret")).entries).toEqual([]);
  });

  it("invalidates replacement, truncation and deletion atomically, including reused item IDs", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      message("first", "oldkeyword", "user_message"),
      message("tail", "tailkeyword"),
    ]);
    expect((await search("oldkeyword")).entries).toHaveLength(1);
    const previous = readConversationSearchBatch();
    await dbReplaceThreadRuntimeItems("thread-1", [
      message("first", "newkeyword", "user_message"),
      message("tail", "tailkeyword"),
    ]);
    expect((await search("oldkeyword")).entries).toEqual([]);
    expect((await search("newkeyword")).entries).toHaveLength(1);
    expect(previous.every((entry) => entry.text !== "newkeyword")).toBe(true);
    dbTruncateThreadRuntimeAfter("thread-1", "first");
    expect((await search("tailkeyword")).entries).toEqual([]);
    dbDeleteThread("thread-1");
    expect((await search("newkeyword")).entries).toEqual([]);
  });

  it("indexes persisted stream heads/tails and invalidates content replacement", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "stream",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "x ".repeat(140_000) + "tailneedle" },
      },
    ]);
    expect((await search("tailneedle")).entries[0]?.excerpt).toContain("tailneedle");
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "stream",
        stream: "assistant_text",
        delta: "replacementneedle",
        replace: true,
      },
    ]);
    await dbFlushThreadRuntimeWrites("thread-1");
    expect((await search("tailneedle")).entries).toEqual([]);
    expect((await search("replacementneedle")).entries).toHaveLength(1);
  });

  it("rejects a worker snapshot after deletion and reuse of the same canonical item ID", async () => {
    await search("needle");
    await dbReplaceThreadRuntimeItems("thread-1", [message("reused", "oldneedle", "user_message")]);
    let release!: () => void;
    let captured!: () => void;
    const ready = new Promise<void>((resolve) => {
      captured = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(asyncReads, "readDatabaseAsync").mockImplementationOnce(async () => {
      const snapshot = readConversationSearchBatch();
      captured();
      await held;
      return snapshot as never;
    });
    const stale = dbSearchConversations({ version: "1", query: "oldneedle" });
    await ready;
    await dbReplaceThreadRuntimeItems("thread-1", [message("reused", "newneedle", "user_message")]);
    release();
    expect((await stale).entries).toEqual([]);
    expect((await search("newneedle")).entries[0]?.itemId).toBe("reused");
    expect((await search("oldneedle")).entries).toEqual([]);
  });

  it("bounds index batches and excerpts, pages without repeats, and binds cursors to filters", async () => {
    await dbReplaceThreadRuntimeItems(
      "thread-1",
      Array.from({ length: 55 }, (_, index) =>
        message(`user-${index}`, `needle ${index} ${"context ".repeat(100)}`, "user_message"),
      ),
    );
    const initial = await dbSearchConversations({ version: "1", query: "needle" });
    expect(initial.indexing).toBe(true);
    expect(initial.entries.length).toBeLessThanOrEqual(SEARCH_INDEX_BATCH_ITEMS);
    const first = await search("needle");
    expect(first.entries).toHaveLength(50);
    expect(first.entries.every((entry) => entry.excerpt.length <= 320)).toBe(true);
    const next = await search("needle", { cursor: first.nextCursor });
    expect(next.entries).toHaveLength(5);
    expect(new Set([...first.entries, ...next.entries].map((entry) => entry.itemId)).size).toBe(55);
    await expect(search("other", { cursor: first.nextCursor })).rejects.toThrow("cursor");
  });

  it.each(["1.visual1", "1.visual2", "2.visual2", "3.visual1"])(
    "rebuilds older extraction generation %s without changing canonical history",
    async (generation) => {
      await dbReplaceThreadRuntimeItems("thread-1", [message("older", "preupgrade needle")]);
      await search("needle");
      const before = getSqlite().prepare("SELECT * FROM thread_runtime_items").all();
      getSqlite().prepare("UPDATE conversation_search_meta SET generation = ?").run(generation);
      getSqlite().prepare("DELETE FROM conversation_search_documents").run();
      expect((await search("needle")).entries[0]?.itemId).toBe("older");
      expect(getSqlite().prepare("SELECT * FROM thread_runtime_items").all()).toEqual(before);
    },
  );

  it("rebuilds native bodies indexed by 2.visual1 while preserving canonical rows and streams", async () => {
    const text =
      "prefixneedle\n~~~poracode-visual-v1 Publictitle\n" +
      '{"blocks":[{"type":"outputs","items":[{"label":"nativebodysecret","value":42}]}]}\n' +
      "~~~\nsuffixneedle";
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "native",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: text },
      },
    ]);
    const sqlite = getSqlite();
    sqlite.prepare("UPDATE conversation_search_meta SET generation = '2.visual1'").run();
    sqlite
      .prepare(
        "INSERT INTO conversation_search_documents(id, thread_id, item_id, text) SELECT rowid, thread_id, item_id, ? FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
      )
      .run(text, "thread-1", "native");
    sqlite.prepare("DELETE FROM conversation_search_pending").run();
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM conversation_search_fts WHERE conversation_search_fts MATCH ?",
        )
        .get("nativebodysecret"),
    ).toEqual({ count: 1 });
    const before = sqlite.prepare("SELECT * FROM thread_runtime_items").all();
    const committed = dbGetThreadRuntimeItemCommitted("thread-1", "native");
    expect(committed?.streams.assistant_text).toBe(text);
    expect((await search("nativebodysecret")).entries).toEqual([]);
    for (const query of ["prefixneedle", "Publictitle", "suffixneedle"])
      expect((await search(query)).entries[0]?.itemId).toBe("native");
    expect(sqlite.prepare("SELECT generation FROM conversation_search_meta").get()).toEqual({
      generation: "4.visual2",
    });
    expect(sqlite.prepare("SELECT * FROM thread_runtime_items").all()).toEqual(before);
    expect(dbGetThreadRuntimeItemCommitted("thread-1", "native")).toEqual(committed);
  });

  it("rebuilds indexed 2.visual2 question fallbacks without rewriting canonical rows or streams", async () => {
    const text = messageReplyFormText(replyForm);
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "generated",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: text },
        payload: { content: [{ kind: "text", text }], replyForm },
      },
    ]);
    const sqlite = getSqlite();
    sqlite.prepare("UPDATE conversation_search_meta SET generation = '2.visual2'").run();
    sqlite
      .prepare(
        "INSERT INTO conversation_search_documents(id, thread_id, item_id, text) SELECT rowid, thread_id, item_id, ? FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
      )
      .run(text, "thread-1", "generated");
    sqlite.prepare("DELETE FROM conversation_search_pending").run();
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM conversation_search_fts WHERE conversation_search_fts MATCH ?",
        )
        .get("Generatedquestionneedle"),
    ).toEqual({ count: 1 });
    const before = sqlite.prepare("SELECT * FROM thread_runtime_items").all();
    const committed = dbGetThreadRuntimeItemCommitted("thread-1", "generated");
    expect(committed?.streams.assistant_text).toBe(text);
    expect((await search("Generatedquestionneedle")).entries).toEqual([]);
    expect(sqlite.prepare("SELECT generation FROM conversation_search_meta").get()).toEqual({
      generation: "4.visual2",
    });
    expect(sqlite.prepare("SELECT * FROM thread_runtime_items").all()).toEqual(before);
    expect(dbGetThreadRuntimeItemCommitted("thread-1", "generated")).toEqual(committed);
  });

  it("extracts native text and rejects an old-generation cursor through the real read worker", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      message(
        "native",
        'needle prose\n~~~poracode-visual-v1 Publictitle\n{"body":"nativebodysecret"}\n~~~',
      ),
      message("second", "needle second", "user_message"),
      {
        ...message("generated", messageReplyFormText(replyForm)),
        payload: {
          content: [{ kind: "text", text: messageReplyFormText(replyForm) }],
          replyForm,
        },
      },
    ]);
    mkdirSync(resolvePath("tmp"), { recursive: true });
    const artifacts = mkdtempSync(resolvePath("tmp/search-read-worker-"));
    const workerPath = join(artifacts, "databaseReadWorker.cjs");
    const projectionsPath = join(artifacts, "runtimePayloadProjections.ts");
    try {
      writeFileSync(projectionsPath, createRuntimePayloadProjectionSource(process.cwd()).source);
      await build({
        entryPoints: [fileURLToPath(new URL("./databaseReadWorker.ts", import.meta.url))],
        outfile: workerPath,
        bundle: true,
        platform: "node",
        format: "cjs",
        packages: "external",
        alias: { "@": resolvePath("src"), [RUNTIME_PAYLOAD_PROJECTION_MODULE]: projectionsPath },
      });
      asyncReads.enableAsyncDatabaseReads(join(directory, "state.sqlite"), workerPath);
      const reads = vi.spyOn(asyncReads, "readDatabaseAsync");
      const first = await search("needle", { limit: 1 });
      expect(first.nextCursor).not.toBeNull();
      const next = await search("needle", { cursor: first.nextCursor });
      expect(next.entries[0]).toMatchObject({
        itemId: "native",
        excerpt: expect.stringContaining("Publictitle"),
      });
      expect((await search("nativebodysecret")).entries).toEqual([]);
      expect((await search("Generatedquestionneedle")).entries).toEqual([]);
      expect(reads).toHaveBeenCalledWith(
        "conversationSearchBatch",
        [],
        readConversationSearchBatch,
      );
      const cursor = JSON.parse(
        Buffer.from(first.nextCursor!.slice(4), "base64url").toString(),
      ) as {
        q: string;
        id: number;
      };
      for (const generation of ["2.visual1", "2.visual2", "3.visual2"]) {
        cursor.q = createHash("sha256")
          .update(JSON.stringify([generation, "needle", null, "true"]))
          .digest("base64url");
        const oldCursor = `cs1.${Buffer.from(JSON.stringify(cursor)).toString("base64url")}`;
        await expect(search("needle", { cursor: oldCursor })).rejects.toThrow(
          "does not match this query or index version",
        );
        expect(reads).toHaveBeenCalledWith(
          "conversationSearch",
          [expect.objectContaining({ cursor: oldCursor })],
          expect.any(Function),
        );
      }
    } finally {
      await asyncReads.closeAsyncDatabaseReads();
      rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it("upgrades actual pre-search schema61 through the exact cost62 dependency and search63", async () => {
    closeDatabase();
    const path = join(directory, "previous.sqlite");
    const previous = createSchema53PayloadOriginDatabase(path);
    try {
      migrateSchema53FixtureThrough(previous, 61);
      previous
        .prepare(
          "INSERT INTO thread_runtime_items(thread_id,item_id,position,type,state,payload,streams) VALUES ('thread-1','pre-search',99,'user_message','completed',?,'{}')",
        )
        .run(JSON.stringify({ content: [{ kind: "text", text: "upgrade-search-needle" }] }));
      const before = captureSchema53PayloadOriginEvidence(previous);
      expect(() => assertRequiredDatabaseSchema(previous)).toThrow("usage_events.cost_details");
      expect(
        previous
          .prepare("SELECT name FROM sqlite_master WHERE name='conversation_search_meta'")
          .get(),
      ).toBeUndefined();
      runDatabaseMigrations(previous, 61);
      expect(captureSchema53PayloadOriginEvidence(previous)).toEqual(before);
      expect(
        previous
          .prepare("SELECT sql FROM sqlite_master WHERE name='idx_usage_token_ledger_scope'")
          .get(),
      ).toEqual({
        sql: "CREATE INDEX idx_usage_token_ledger_scope ON usage_token_ledger (scope_id, epoch)",
      });
      for (const table of ["usage_events", "usage_token_ledger"])
        expect(previous.prepare(`PRAGMA table_info(${table})`).all()).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "cost_details", notnull: 0 })]),
        );
    } finally {
      previous.close();
    }
    initDatabase(path);
    expect((await search("upgrade-search-needle")).entries[0]?.itemId).toBe("pre-search");
  });

  it.each(["5.visual1", "4.visual3", "3.visual3", "2.visual3", "unknown"])(
    "preserves all bytes of future index generation %s instead of rewriting it on downgrade",
    async (generation) => {
      await dbReplaceThreadRuntimeItems("thread-1", [message("future", "savedneedle")]);
      await search("savedneedle");
      const sqlite = getSqlite();
      sqlite.prepare("UPDATE conversation_search_meta SET generation = ?").run(generation);
      const before = sqlite.serialize();
      await expect(search("savedneedle")).rejects.toThrow("newer or unknown generation");
      expect(sqlite.serialize()).toEqual(before);
      closeDatabase();
      const path = join(directory, "state.sqlite");
      const bytes = readFileSync(path);
      const other = initDatabase(join(directory, "active.sqlite"));
      for (const open of [
        () => initDatabase(path),
        () => initDatabase(path, { schemaMode: "validate" }),
        () => initReadOnlyDatabase(path),
      ]) {
        expect(open).toThrow("newer or unknown generation");
        expect(getSqlite()).toBe(other);
        expect(readFileSync(path)).toEqual(bytes);
      }
    },
  );

  it.each(["pending", "indexed"])(
    "admits canonical key moves with an %s projection and removes old identities",
    async (mode) => {
      await dbReplaceThreadRuntimeItems("thread-1", [message("old", "moveneedle", "user_message")]);
      if (mode === "indexed") await search("moveneedle");
      const sqlite = getSqlite();
      sqlite.exec(
        "UPDATE thread_runtime_items SET item_id='moved' WHERE thread_id='thread-1' AND item_id='old'",
      );
      expect(
        sqlite.prepare("SELECT * FROM conversation_search_documents WHERE item_id='old'").all(),
      ).toEqual([]);
      expect(
        sqlite.prepare("SELECT * FROM conversation_search_pending WHERE item_id='old'").all(),
      ).toEqual([]);
      expect((await search("moveneedle")).entries.map((e) => e.itemId)).toEqual(["moved"]);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    },
  );

  it("invalidates conflicting old/new canonical owners and restores all projection bytes on rollback", async () => {
    dbUpsertThread({ ...testThread(), id: "thread-2" }, 1);
    await dbReplaceThreadRuntimeItems("thread-1", [
      message("same", "sourceneedle", "user_message"),
    ]);
    await dbReplaceThreadRuntimeItems("thread-2", [
      message("same", "targetneedle", "user_message"),
    ]);
    await search("needle");
    const sqlite = getSqlite();
    const before = sqlite.serialize();
    const move = () =>
      sqlite.exec(
        "UPDATE OR REPLACE thread_runtime_items SET thread_id='thread-2' WHERE thread_id='thread-1' AND item_id='same'",
      );
    expect(() =>
      sqlite.transaction(() => {
        move();
        throw new Error("rollback");
      })(),
    ).toThrow("rollback");
    expect(sqlite.serialize()).toEqual(before);
    move();
    expect((await search("targetneedle")).entries).toEqual([]);
    expect((await search("sourceneedle")).entries.map((e) => [e.threadId, e.itemId])).toEqual([
      ["thread-2", "same"],
    ]);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it.each(["head", "chunk"])(
    "invalidates OLD and NEW owners of an admitted %s retarget",
    async (kind) => {
      dbUpsertThread({ ...testThread(), id: "thread-2" }, 1);
      const assistant: PersistedRuntimeItem = {
        id: "a",
        type: "assistant_message",
        state: "completed",
        streams: {},
      };
      await dbReplaceThreadRuntimeItems("thread-1", [assistant]);
      await dbReplaceThreadRuntimeItems("thread-2", [assistant]);
      const sqlite = getSqlite();
      const text = "retargetneedle body";
      if (kind === "head")
        sqlite.transaction(() => {
          const prepared = prepareRuntimeStreamHead(sqlite, {
            threadId: "thread-1",
            itemId: "a",
            stream: "assistant_text",
          });
          if (prepared.kind !== "ready" || !prepared.head) throw new Error("Expected head");
          appendRuntimeStreamHead(sqlite, prepared.head.head_id, text);
        })();
      else
        sqlite
          .prepare(
            "INSERT INTO thread_runtime_item_stream_chunks(thread_id,item_id,stream,seq,chars,text) VALUES ('thread-1','a','assistant_text',0,?,?)",
          )
          .run(text.length, text);
      expect((await search("retargetneedle")).entries.map((e) => e.threadId)).toEqual(["thread-1"]);
      const table =
        kind === "head" ? "thread_runtime_item_stream_heads" : "thread_runtime_item_stream_chunks";
      const move = () =>
        sqlite.exec(
          `UPDATE ${table} SET thread_id='thread-2' WHERE thread_id='thread-1' AND item_id='a'`,
        );
      const before = sqlite.serialize();
      expect(() =>
        sqlite.transaction(() => {
          move();
          throw new Error("rollback");
        })(),
      ).toThrow("rollback");
      expect(sqlite.serialize()).toEqual(before);
      move();
      expect(sqlite.prepare("SELECT * FROM conversation_search_documents").all()).toEqual([]);
      expect(
        sqlite
          .prepare("SELECT thread_id FROM conversation_search_pending ORDER BY thread_id")
          .all(),
      ).toEqual([{ thread_id: "thread-1" }, { thread_id: "thread-2" }]);
      expect(dbGetThreadRuntimeItemCommitted("thread-1", "a")?.streams.assistant_text ?? "").toBe(
        "",
      );
      expect(dbGetThreadRuntimeItemCommitted("thread-2", "a")?.streams.assistant_text).toBe(text);
      expect((await search("retargetneedle")).entries.map((e) => e.threadId)).toEqual(["thread-2"]);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    },
  );

  it("invalidates both block owners before a retarget and supports a parent head-id cascade", async () => {
    dbUpsertThread({ ...testThread(), id: "thread-2" }, 1);
    const heads: number[] = [];
    for (const threadId of ["thread-1", "thread-2"]) {
      await dbReplaceThreadRuntimeItems(threadId, [
        { id: "a", type: "assistant_message", state: "completed", streams: {} },
      ]);
      getSqlite().transaction(() => {
        const p = prepareRuntimeStreamHead(getSqlite(), {
          threadId,
          itemId: "a",
          stream: "assistant_text",
        });
        if (p.kind !== "ready" || !p.head) throw new Error("Expected head");
        heads.push(p.head.head_id);
        if (threadId === "thread-1")
          appendRuntimeStreamHead(getSqlite(), p.head.head_id, "blockneedle");
      })();
    }
    await search("blockneedle");
    const sqlite = getSqlite();
    const before = sqlite.serialize();
    expect(() =>
      sqlite.transaction(() => {
        sqlite
          .prepare("UPDATE thread_runtime_item_stream_head_blocks SET head_id=? WHERE head_id=?")
          .run(heads[1]!, heads[0]!);
        expect(sqlite.prepare("SELECT * FROM conversation_search_documents").all()).toEqual([]);
        expect(
          sqlite
            .prepare("SELECT thread_id FROM conversation_search_pending ORDER BY thread_id")
            .all(),
        ).toEqual([{ thread_id: "thread-1" }, { thread_id: "thread-2" }]);
        throw new Error("rollback");
      })(),
    ).toThrow("rollback");
    expect(sqlite.serialize()).toEqual(before);
    sqlite
      .prepare("UPDATE thread_runtime_item_stream_heads SET head_id=? WHERE head_id=?")
      .run(heads[0]! + 1000, heads[0]!);
    expect(dbGetThreadRuntimeItemCommitted("thread-1", "a")?.streams.assistant_text).toBe(
      "blockneedle",
    );
    expect((await search("blockneedle")).entries.map((e) => e.threadId)).toEqual(["thread-1"]);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it.each([64, LATEST_SCHEMA_VERSION])(
    "repairs an existing schema%i/gen3 root at startup before the first writer, preserving canonical evidence",
    async (schemaVersion) => {
      closeDatabase();
      const path = join(directory, "old64.sqlite");
      const previous = createSchema53PayloadOriginDatabase(path);
      migrateSchema53FixtureThrough(previous, schemaVersion);
      installFixtureOrigin(previous);
      previous
        .prepare(
          "INSERT INTO usage_events(ts,kind,provider,value,cost_details) VALUES (?,'tokens','fixture',7,'retained cost')",
        )
        .run(Date.now());
      previous
        .prepare(
          "INSERT INTO usage_token_ledger(provider,scope_id,epoch,last_counter,cost_details) VALUES ('fixture','scope',1,7,'retained baseline')",
        )
        .run();
      previous
        .prepare(
          "INSERT INTO thread_runtime_items(thread_id,item_id,position,type,state,payload,streams) VALUES ('thread-1','startup',99,'user_message','completed',?,'{}')",
        )
        .run(JSON.stringify({ content: [{ kind: "text", text: "startupneedle" }] }));
      retainOldProjection(previous);
      previous
        .prepare(
          "INSERT INTO conversation_search_documents(id,thread_id,item_id,text) SELECT rowid,thread_id,item_id,'staledocneedle' FROM thread_runtime_items WHERE item_id='startup'",
        )
        .run();
      const sequence = previous
        .prepare("SELECT seq FROM sqlite_sequence WHERE name='conversation_search_pending'")
        .get() as { seq: number };
      const before = canonicalEvidence(previous);
      previous.close();
      const refusal =
        schemaVersion === 64
          ? "Database schema is incomplete; missing: pr_watches.review_scope."
          : "owning startup upgrade";
      expect(() => initReadOnlyDatabase(path)).toThrow(refusal);
      expect(() => initDatabase(path, { schemaMode: "validate" })).toThrow(refusal);
      const sqlite = initDatabase(path);
      const expected = before.map((table) =>
        table.name === "app_state"
          ? {
              ...table,
              rows: table.rows.map((row) => {
                const state = row as { key: string; value: string };
                return state.key === "schema_version"
                  ? { ...state, value: String(LATEST_SCHEMA_VERSION) }
                  : state;
              }),
            }
          : table,
      );
      expect(canonicalEvidence(sqlite)).toEqual(expected);
      expect(
        sqlite.prepare("SELECT value FROM app_state WHERE key='schema_version'").get(),
      ).toEqual({
        value: String(LATEST_SCHEMA_VERSION),
      });
      expect(sqlite.prepare("SELECT generation FROM conversation_search_meta").get()).toEqual({
        generation: "4.visual2",
      });
      expect(
        sqlite.prepare("SELECT MIN(revision) AS revision FROM conversation_search_pending").get(),
      ).toEqual({ revision: expect.any(Number) });
      const pending = sqlite
        .prepare("SELECT MIN(revision) AS revision FROM conversation_search_pending")
        .get() as { revision: number };
      expect(pending.revision).toBeGreaterThan(sequence.seq);
      sqlite.exec(
        "UPDATE thread_runtime_items SET item_id='startup-moved' WHERE item_id='startup'",
      );
      expect((await search("startupneedle")).entries[0]?.itemId).toBe("startup-moved");
      expect((await search("staledocneedle")).entries).toEqual([]);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    },
  );

  it("rolls back failed startup trigger installation and projection rebuild without retaining a handle", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [message("a", "savedneedle", "user_message")]);
    await search("savedneedle");
    const sqlite = getSqlite();
    retainOldProjection(sqlite);
    sqlite.exec(
      "CREATE TRIGGER reject_projection_rebuild BEFORE INSERT ON conversation_search_pending BEGIN SELECT RAISE(ABORT,'projection rebuild rejected'); END;",
    );
    const before = sqlite.serialize();
    closeDatabase();
    const path = join(directory, "state.sqlite");
    expect(() => initDatabase(path)).toThrow("projection rebuild rejected");
    expect(() => getSqlite()).toThrow("not initialized");
    const restored = new Database(path, {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    });
    try {
      expect(restored.serialize()).toEqual(before);
    } finally {
      restored.close();
    }
  });

  it("rejects a pre-upgrade worker batch by its monotonic pending revision", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [message("a", "oldneedle", "user_message")]);
    const sqlite = getSqlite();
    const snapshot = readConversationSearchBatch();
    const revision = snapshot[0]!.revision;
    retainOldProjection(sqlite);
    ensureConversationSearchGeneration(sqlite);
    const current = sqlite
      .prepare("SELECT revision FROM conversation_search_pending WHERE item_id='a'")
      .get() as { revision: number };
    expect(current.revision).toBeGreaterThan(revision);
    await dbReplaceThreadRuntimeItems("thread-1", [message("a", "newneedle", "user_message")]);
    vi.spyOn(asyncReads, "readDatabaseAsync").mockImplementationOnce(async () => snapshot as never);
    expect((await dbSearchConversations({ version: "1", query: "oldneedle" })).entries).toEqual([]);
    expect((await search("newneedle")).entries[0]?.itemId).toBe("a");
  });

  it.each(["missing-row", "non-string"])(
    "refuses malformed existing metadata %s before exposing a new handle",
    (mode) => {
      const sqlite = getSqlite();
      if (mode === "missing-row") sqlite.exec("DELETE FROM conversation_search_meta");
      else
        sqlite
          .prepare("UPDATE conversation_search_meta SET generation=?")
          .run(Buffer.from("3.visual2"));
      const before = sqlite.serialize();
      expect(() => ensureConversationSearchGeneration(sqlite)).toThrow(
        "metadata is incomplete or malformed",
      );
      expect(sqlite.serialize()).toEqual(before);
      closeDatabase();
      const path = join(directory, "state.sqlite");
      const bytes = readFileSync(path);
      expect(() => initDatabase(path)).toThrow("metadata is incomplete or malformed");
      expect(readFileSync(path)).toEqual(bytes);
      expect(() => getSqlite()).toThrow("not initialized");
    },
  );

  it("refuses missing schema63 metadata before startup writes", () => {
    const sqlite = getSqlite();
    sqlite.exec("DROP TABLE conversation_search_meta");
    const before = sqlite.serialize();
    expect(() => ensureConversationSearchGeneration(sqlite)).toThrow("metadata is missing");
    expect(sqlite.serialize()).toEqual(before);
    closeDatabase();
    const path = join(directory, "state.sqlite");
    const bytes = readFileSync(path);
    expect(() => initDatabase(path)).toThrow("metadata is missing");
    expect(readFileSync(path)).toEqual(bytes);
    expect(() => getSqlite()).toThrow("not initialized");
  });

  it("rebuilds a same-policy older visual generation without changing canonical history", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [message("a", "savedneedle", "user_message")]);
    const sqlite = getSqlite();
    const before = canonicalEvidence(sqlite);
    sqlite.prepare("UPDATE conversation_search_meta SET generation='4.visual1'").run();
    expect((await search("savedneedle")).entries[0]?.itemId).toBe("a");
    expect(canonicalEvidence(sqlite)).toEqual(before);
  });

  it("quotes FTS operators and handles Unicode without searching syntax", () => {
    expect(conversationSearchExpression('" OR foo* -bar')).toBe('"OR"* AND "foo"* AND "bar"*');
    expect(conversationSearchExpression("Привет 世界")).toBe('"Привет"* AND "世界"*');
    expect(conversationSearchExpression("***")).toBeNull();
  });
});
