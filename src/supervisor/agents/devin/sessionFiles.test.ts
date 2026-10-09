import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as { id: string }[] }));
vi.mock("node:fs", () => ({ existsSync: () => true }));
vi.mock("../../runtime/sqliteRead", () => ({
  withReadonlyDb: async (_path: string, fn: (db: unknown) => unknown) =>
    fn({ prepare: () => ({ all: () => state.rows }) }),
}));
vi.mock("../base", () => ({
  createKnownSessionRef: (providerSessionId: string) => ({ providerSessionId }),
  quotePosixShellArg: (value: string) => `'${value.replaceAll("'", `'\\''`)}'`,
  watchSessionPaths: () => () => {},
}));
import {
  buildDevinSessionHookOverlay,
  createDevinSessionDiscovery,
  detectDevinInvalidSessionRef,
  devinSessionRecordDir,
  mergeDevinSessionHookConfig,
  prepareDevinSessionRecordLaunch,
  readDevinSessionRecord,
} from "./sessionFiles";
const location = { kind: "posix" as const, path: "/project" };

describe("Devin terminal session discovery", () => {
  it("returns only a newly created ID and releases snapshots after discovery", async () => {
    const discovery = createDevinSessionDiscovery();
    state.rows = [{ id: "old" }];
    const stop = discovery.prepare(location);
    await discovery.ready(location);
    state.rows.push({ id: "new" });
    expect(await discovery.discover(location)).toEqual({ providerSessionId: "new" });
    stop?.();
    expect(await discovery.discover(location)).toBeUndefined();
  });
  it("refuses overlapping same-folder launches even when the second snapshot sees the first ID", async () => {
    const discovery = createDevinSessionDiscovery();
    state.rows = [];
    const stopFirst = discovery.prepare(location);
    await discovery.ready(location);
    state.rows.push({ id: "first" });
    const stopSecond = discovery.prepare(location);
    await discovery.ready(location);
    state.rows.push({ id: "second" });
    expect(await discovery.discover(location)).toBeUndefined();
    stopFirst?.();
    expect(await discovery.discover(location)).toBeUndefined();
    stopSecond?.();
    discovery.prepare(location);
    await discovery.ready(location);
    state.rows.push({ id: "third" });
    expect(await discovery.discover(location)).toEqual({ providerSessionId: "third" });
  });
  it("releases canceled launches before any watcher attaches", async () => {
    const discovery = createDevinSessionDiscovery();
    state.rows = [];
    const cancel = discovery.prepare(location);
    await discovery.ready(location);
    cancel?.();
    discovery.prepare(location);
    await discovery.ready(location);
    state.rows = [{ id: "after-cancellation" }];
    expect(await discovery.discover(location)).toEqual({ providerSessionId: "after-cancellation" });
  });
  it("refuses ambiguous IDs without reading provider transcripts", async () => {
    const discovery = createDevinSessionDiscovery();
    state.rows = [];
    const stop = discovery.prepare(location);
    await discovery.ready(location);
    state.rows = [{ id: "one" }, { id: "two" }];
    expect(await discovery.discover(location)).toBeUndefined();
    stop?.();
  });
  it("coordinates reservations across adapter instances sharing one data root", async () => {
    // Base adapter and a same-login profile adapter each build their own
    // discovery; on the shared default root they must see each other.
    const base = createDevinSessionDiscovery();
    const profile = createDevinSessionDiscovery();
    state.rows = [];
    const stopBase = base.prepare(location);
    await base.ready(location);
    const stopProfile = profile.prepare(location);
    await profile.ready(location);
    state.rows = [{ id: "a" }, { id: "b" }];
    expect(await base.discover(location)).toBeUndefined();
    expect(await profile.discover(location)).toBeUndefined();
    stopBase?.();
    stopProfile?.();
  });
  it("keeps distinct account data roots isolated from each other", async () => {
    const base = createDevinSessionDiscovery();
    const isolated = createDevinSessionDiscovery();
    state.rows = [];
    const stopBase = base.prepare(location);
    await base.ready(location);
    const stopIsolated = isolated.prepare(location, { dataRoot: "/roots/owner-a/data" });
    await isolated.ready(location, { dataRoot: "/roots/owner-a/data" });
    // One new row appears per root: each discovery attributes its own ID.
    state.rows = [{ id: "a" }];
    expect(await isolated.discover(location, { dataRoot: "/roots/owner-a/data" })).toEqual({
      providerSessionId: "a",
    });
    expect(await base.discover(location)).toEqual({ providerSessionId: "a" });
    stopBase?.();
    stopIsolated?.();
  });
});

describe("SessionStart record attribution", () => {
  it("attributes the exact hook-written session id, even past diff ambiguity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "poracode-devin-rec-"));
    const recordPath = join(dir, "session-x.json");
    const discovery = createDevinSessionDiscovery();
    state.rows = [];
    const stop = discovery.prepare(location, undefined, recordPath);
    await discovery.ready(location);
    // Two concurrent same-cwd launches make the diff ambiguous...
    const other = createDevinSessionDiscovery();
    const stopOther = other.prepare(location);
    await other.ready(location);
    state.rows = [{ id: "one" }, { id: "two" }];
    // ...but this launch's own SessionStart record is exact.
    await writeFile(recordPath, JSON.stringify({ session_id: "exact-slug", source: "startup" }));
    expect(await discovery.discover(location)).toEqual({ providerSessionId: "exact-slug" });
    // The record is consumed after attribution.
    await expect(readDevinSessionRecord(recordPath)).resolves.toBeUndefined();
    stop?.();
    stopOther?.();
  });

  it("falls back to the snapshot diff when the record never appears", async () => {
    const dir = await mkdtemp(join(tmpdir(), "poracode-devin-rec-"));
    const recordPath = join(dir, "session-absent.json");
    const discovery = createDevinSessionDiscovery();
    state.rows = [];
    const stop = discovery.prepare(location, undefined, recordPath);
    await discovery.ready(location);
    state.rows = [{ id: "diffed" }];
    expect(await discovery.discover(location)).toEqual({ providerSessionId: "diffed" });
    stop?.();
  });

  it("reads records leniently (absent, partial, or wrong shape)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "poracode-devin-rec-"));
    await expect(readDevinSessionRecord(join(dir, "missing.json"))).resolves.toBeUndefined();
    const partial = join(dir, "partial.json");
    await writeFile(partial, '{"session_id":"va');
    await expect(readDevinSessionRecord(partial)).resolves.toBeUndefined();
    const wrong = join(dir, "wrong.json");
    await writeFile(wrong, '{"other":1}');
    await expect(readDevinSessionRecord(wrong)).resolves.toBeUndefined();
  });

  it("refuses oversized records and implausible session ids instead of truncating", async () => {
    const dir = await mkdtemp(join(tmpdir(), "poracode-devin-rec-"));
    // A record above the read bound is not a hook payload: refuse it whole
    // rather than parsing a truncated prefix into a fake session id.
    const oversized = join(dir, "oversized.json");
    await writeFile(oversized, `{"session_id":"ok","pad":"${"x".repeat(64 * 1024)}"}`);
    await expect(readDevinSessionRecord(oversized)).resolves.toBeUndefined();
    // An id longer than any native session id is rejected, not clipped.
    const hugeId = join(dir, "huge-id.json");
    await writeFile(hugeId, JSON.stringify({ session_id: "s".repeat(300) }));
    await expect(readDevinSessionRecord(hugeId)).resolves.toBeUndefined();
    // A normal payload still parses.
    const good = join(dir, "good.json");
    await writeFile(good, JSON.stringify({ session_id: "native-slug" }));
    await expect(readDevinSessionRecord(good)).resolves.toBe("native-slug");
  });

  it("detects the CLI's captured stale-resume message", () => {
    // Captured live from `devin --resume <deleted-id>` on 3000.11.3
    // (tmp/devin/probe/p2/results-hook-auth.json): the TUI prints this exact
    // line and falls back to a fresh session.
    const captured =
      "devin: resume booming-lumber No session found matching 'booming-lumber' Ask Devin to build features";
    expect(detectDevinInvalidSessionRef(captured)).toBe(true);
    // Ordinary transcript text must not trip the recovery path.
    expect(detectDevinInvalidSessionRef("list all sessions matching the prefix")).toBe(false);
    expect(detectDevinInvalidSessionRef("")).toBe(false);
  });
});

describe("per-launch SessionStart hook view", () => {
  it("merges the hook into the effective user config, preserving unknown keys", () => {
    const merged = JSON.parse(
      mergeDevinSessionHookConfig(
        JSON.stringify({
          version: 1,
          theme_mode: "dark",
          hooks: { SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "keep" }] }] },
        }),
        "/records/session-1.json",
      ),
    );
    expect(merged.theme_mode).toBe("dark");
    expect(merged.version).toBe(1);
    const entries = merged.hooks.SessionStart;
    expect(entries).toHaveLength(2);
    // The user's own SessionStart entries survive; ours is appended.
    expect(entries[0].hooks[0].command).toBe("keep");
    expect(entries[1].hooks[0].command).toContain("'/records/session-1.json'");
    expect(JSON.parse(mergeDevinSessionHookConfig(undefined, "/r.json")).version).toBe(1);
    expect(Object.keys(buildDevinSessionHookOverlay("/r.json"))).toEqual(["SessionStart"]);
  });

  it("writes a private per-launch view and cleans both files up", async () => {
    const base = await mkdtemp(join(tmpdir(), "poracode-devin-launch-"));
    const original = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = base;
    try {
      const source = join(base, "user-config.json");
      await writeFile(source, JSON.stringify({ version: 1, theme_mode: "dark" }));
      const launch = await prepareDevinSessionRecordLaunch(source);
      expect(launch).toBeDefined();
      if (!launch) return;
      expect(launch.prefixArgs).toEqual(["--config", expect.stringContaining("launch-")]);
      const view = JSON.parse(await readFile(launch.prefixArgs[1]!, "utf8"));
      expect(view.theme_mode).toBe("dark");
      expect(view.hooks.SessionStart[0].hooks[0].command).toContain(launch.recordPath);
      const mode = (await stat(launch.prefixArgs[1]!)).mode & 0o777;
      expect(mode).toBe(0o600);
      // The record is pre-created 0600 (the hook writes through a shell
      // redirect) and the record directory is private 0700.
      expect((await stat(launch.recordPath)).mode & 0o777).toBe(0o600);
      expect((await stat(devinSessionRecordDir())).mode & 0o777).toBe(0o700);
      await launch.cleanup();
      await expect(readFile(launch.prefixArgs[1]!)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(launch.recordPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(devinSessionRecordDir()).toContain(join("Poracode", "devin-session-records"));
    } finally {
      if (original === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = original;
      await rm(base, { recursive: true, force: true });
    }
  });

  it("refuses to replace an explicit config it could not read, unless told to proceed", async () => {
    const missing = join(tmpdir(), "poracode-devin-missing-config.json");
    await expect(
      prepareDevinSessionRecordLaunch(missing, { strictSource: true }),
    ).resolves.toBeUndefined();
    const tolerant = await prepareDevinSessionRecordLaunch(missing);
    expect(tolerant).toBeDefined();
    await tolerant?.cleanup();
  });

  it("treats only ENOENT as absence: an unreadable source throws instead of seeding an empty view", async () => {
    // An existing config Poracode cannot READ must never become the `{}` +
    // hook view: the throw sends the launch to the snapshot-diff fallback
    // (index.ts catches), which runs the CLI against its own real config.
    const dir = await mkdtemp(join(tmpdir(), "poracode-devin-unreadable-"));
    const unreadable = join(dir, "config.json");
    await writeFile(unreadable, JSON.stringify({ theme_mode: "dark" }));
    await chmod(unreadable, 0o000);
    try {
      await expect(prepareDevinSessionRecordLaunch(unreadable)).rejects.toMatchObject({
        code: "EACCES",
      });
      // The strict profile lane surfaces the same refusal as its fallback.
      await expect(
        prepareDevinSessionRecordLaunch(unreadable, { strictSource: true }),
      ).rejects.toMatchObject({ code: "EACCES" });
    } finally {
      await chmod(unreadable, 0o644);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on a source config that exists but does not parse", async () => {
    const dir = await mkdtemp(join(tmpdir(), "poracode-devin-badcfg-"));
    const malformed = join(dir, "broken.json");
    await writeFile(malformed, "{ hooks: { SessionStart: [");
    // The private view must never swap the user's malformed-but-effective
    // policy for `{}`: the prepare throws and the launch keeps the
    // snapshot-diff fallback (index.ts catches).
    await expect(prepareDevinSessionRecordLaunch(malformed)).rejects.toThrowError(/JSON|object/i);
    // The merge helper itself carries the contract.
    expect(() => mergeDevinSessionHookConfig("not json at all", "/r.json")).toThrowError(/JSON/);
    expect(() => mergeDevinSessionHookConfig("[1]", "/r.json")).toThrowError(/not a JSON object/);
  });
});
