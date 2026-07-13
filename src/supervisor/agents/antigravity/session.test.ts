import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const tempDirs: string[] = [];

function makeTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-antigravity-"));
  tempDirs.push(dir);
  return dir;
}

// Mimic an `agy` conversation SQLite db: the workspace is stored as a
// length-delimited protobuf field-1 string `0x0A <len> file://<cwd>`. An
// optional `decoy` is an unframed `file://` in conversation text placed before
// the workspace, to prove the framed field is preferred. Returns the path.
function writeConversationDb(dir: string, id: string, cwd: string, decoy?: string): string {
  const path = join(dir, `${id}.db`);
  const uri = Buffer.from(
    `file://${cwd.startsWith("/") ? cwd : `/${cwd.replace(/\\/g, "/")}`}`,
    "latin1",
  );
  const parts = [Buffer.from("SQLite format 3 ", "latin1")];
  if (decoy) parts.push(Buffer.from(`(see ${decoy} for details) `, "latin1"));
  parts.push(Buffer.from([0x0a, uri.length]), uri, Buffer.from([0x1a, 0x00]));
  writeFileSync(path, Buffer.concat(parts));
  return path;
}

async function loadSessionModule(home: string) {
  vi.resetModules();
  vi.doMock("node:os", async (importActual) => {
    const actual = await importActual<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => home,
    };
  });
  return import("./session");
}

async function loadAdapterModule(home: string) {
  vi.resetModules();
  vi.doMock("node:os", async (importActual) => {
    const actual = await importActual<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => home,
    };
  });
  return import(".");
}

afterEach(() => {
  vi.doUnmock("node:os");
  vi.resetModules();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Antigravity session files", () => {
  const location: ProjectLocation = {
    kind: "windows",
    path: "C:\\repo",
  };

  it("watches the Antigravity config root so cache and conversation writes wake discovery", async () => {
    const home = makeTempHome();
    const configDir = join(home, ".gemini", "antigravity-cli");
    mkdirSync(join(configDir, "conversations"), { recursive: true });

    const { resolveAntigravityWatchPaths } = await loadSessionModule(home);

    expect(resolveAntigravityWatchPaths(location)).toEqual([configDir, join(home, ".gemini")]);
  });

  it("reads the cwd mapping and snapshots conversation ids", async () => {
    const home = makeTempHome();
    const configDir = join(home, ".gemini", "antigravity-cli");
    const conversationsDir = join(configDir, "conversations");
    mkdirSync(join(configDir, "cache"), { recursive: true });
    mkdirSync(conversationsDir, { recursive: true });
    writeFileSync(
      join(configDir, "cache", "last_conversations.json"),
      JSON.stringify({ [location.path]: "conversation-new" }),
      "utf8",
    );
    writeFileSync(join(conversationsDir, "conversation-old.pb"), "");
    writeFileSync(join(conversationsDir, "conversation-new.pb"), "");

    const { readAntigravityConversationIds, readAntigravityLastConversationForCwd } =
      await loadSessionModule(home);

    expect(readAntigravityLastConversationForCwd(location, location.path)).toBe("conversation-new");
    expect(readAntigravityConversationIds(location)).toEqual(
      new Set(["conversation-old", "conversation-new"]),
    );
  });

  it("discovers the new conversation id after launch", async () => {
    const home = makeTempHome();
    const configDir = join(home, ".gemini", "antigravity-cli");
    const conversationsDir = join(configDir, "conversations");
    mkdirSync(join(configDir, "cache"), { recursive: true });
    mkdirSync(conversationsDir, { recursive: true });
    writeFileSync(
      join(configDir, "cache", "last_conversations.json"),
      JSON.stringify({ [location.path]: "conversation-old" }),
      "utf8",
    );
    writeFileSync(join(conversationsDir, "conversation-old.pb"), "");

    const { createAntigravityAdapter } = await loadAdapterModule(home);
    const adapter = createAntigravityAdapter();

    adapter.buildLaunchArgv(location, { model: "Gemini 3.5 Flash" }, "hello");
    writeFileSync(
      join(configDir, "cache", "last_conversations.json"),
      JSON.stringify({ [location.path]: "conversation-new" }),
      "utf8",
    );
    writeFileSync(join(conversationsDir, "conversation-new.pb"), "");

    await expect(adapter.discoverSessionRef?.(location)).resolves.toMatchObject({
      providerSessionId: "conversation-new",
    });
  });

  it("snapshots both .pb and .db ids and ignores -wal/-shm sidecars", async () => {
    const home = makeTempHome();
    const conversationsDir = join(home, ".gemini", "antigravity-cli", "conversations");
    mkdirSync(conversationsDir, { recursive: true });
    writeFileSync(join(conversationsDir, "legacy.pb"), "");
    writeConversationDb(conversationsDir, "modern", location.path);
    writeFileSync(join(conversationsDir, "modern.db-wal"), "");
    writeFileSync(join(conversationsDir, "modern.db-shm"), "");

    const { readAntigravityConversationIds } = await loadSessionModule(home);

    expect(readAntigravityConversationIds(location)).toEqual(new Set(["legacy", "modern"]));
  });

  it("discovers the new conversation whose stored workspace matches the launch cwd", async () => {
    const home = makeTempHome();
    const conversationsDir = join(home, ".gemini", "antigravity-cli", "conversations");
    mkdirSync(conversationsDir, { recursive: true });

    const { createAntigravityAdapter } = await loadAdapterModule(home);
    const adapter = createAntigravityAdapter();
    adapter.buildLaunchArgv(location, { model: "Gemini 3.5 Flash" }, "hello");

    // Real interactive session for this workspace (with a decoy file:// in its
    // content), plus a concurrent one-shot (title gen) that ran in an isolated
    // cwd. The one-shot is made NEWER so a naive newest-by-mtime would wrongly
    // pick it; the workspace match must still select the real session.
    const real = writeConversationDb(
      conversationsDir,
      "real-session",
      location.path,
      "file:///C:/some/output.log",
    );
    const oneShot = writeConversationDb(conversationsDir, "title-gen", "C:\\Users\\me\\Temp");
    utimesSync(real, new Date("2026-05-20T00:00:00Z"), new Date("2026-05-20T00:00:00Z"));
    utimesSync(oneShot, new Date("2026-05-20T00:00:05Z"), new Date("2026-05-20T00:00:05Z"));

    await expect(adapter.discoverSessionRef?.(location)).resolves.toMatchObject({
      providerSessionId: "real-session",
    });
  });

  it("does not rediscover a conversation that existed before launch", async () => {
    const home = makeTempHome();
    const conversationsDir = join(home, ".gemini", "antigravity-cli", "conversations");
    mkdirSync(conversationsDir, { recursive: true });
    // Pre-existing conversation for this workspace is captured in the snapshot.
    writeConversationDb(conversationsDir, "old-session", location.path);

    const { createAntigravityAdapter } = await loadAdapterModule(home);
    const adapter = createAntigravityAdapter();
    adapter.buildLaunchArgv(location, { model: "Gemini 3.5 Flash" }, "hello");

    await expect(adapter.discoverSessionRef?.(location)).resolves.toBeUndefined();
  });
});
