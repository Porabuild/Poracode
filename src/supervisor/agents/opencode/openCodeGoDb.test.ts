import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPENCODE_GO_USAGE_ENDPOINT,
  type HostPort,
  type HttpRequest,
} from "@poracode/agents-usage";
import { createFakeHost } from "../../../../packages/agents-usage/src/testHost";
import { UsageService } from "../../runtime/usageService";
import { normalizeRows, readOpenCodeUsageCredential } from "./openCodeGoDb";
import { scanOpenCodeUsage } from "./openCodeUsageScanner";

describe("normalizeRows", () => {
  it("scales epoch-second timestamps to milliseconds and keeps ms ones", () => {
    const rows = normalizeRows([
      { createdMs: 1_700_000_000, cost: 0.5 },
      { createdMs: 1_700_000_000_000, cost: 1.25 },
    ]);
    expect(rows).toEqual([
      { createdMs: 1_700_000_000_000, cost: 0.5 },
      { createdMs: 1_700_000_000_000, cost: 1.25 },
    ]);
  });

  it("drops rows with non-numeric, negative, or non-finite values", () => {
    const rows = normalizeRows([
      { createdMs: "x", cost: 1 },
      { createdMs: 1_700_000_000_000, cost: -1 },
      { createdMs: 1_700_000_000_000, cost: Number.NaN },
      { createdMs: 0, cost: 1 },
      { createdMs: 1_700_000_000_000, cost: 2 },
    ]);
    expect(rows).toEqual([{ createdMs: 1_700_000_000_000, cost: 2 }]);
  });
});

const osMock = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => osMock.home };
});

describe("readOpenCodeUsageCredential", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "opencode-go-db-test-"));
    osMock.home = home;
    for (const name of ["XDG_DATA_HOME", "APPDATA", "LOCALAPPDATA", "OPENCODE_DB"]) {
      vi.stubEnv(name, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });

  function writeAuthJson(entries: Record<string, unknown>): void {
    const dir = join(home, ".local", "share", "opencode");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "auth.json"), JSON.stringify(entries), "utf8");
  }

  function writeNativeCredentials(
    entries: { provider: string; active: boolean; value: unknown }[],
    dbPath = join(home, ".local", "share", "opencode", "opencode.db"),
  ): void {
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    try {
      db.exec("CREATE TABLE credential (integration_id TEXT, active INTEGER, value TEXT)");
      const insert = db.prepare("INSERT INTO credential VALUES (?, ?, ?)");
      for (const entry of entries) {
        insert.run(entry.provider, Number(entry.active), JSON.stringify(entry.value));
      }
    } finally {
      db.close();
    }
  }

  it("reads and trims the legacy opencode-go key", async () => {
    writeAuthJson({ "opencode-go": { type: "api", key: "  go-key-123  " } });
    expect(await readOpenCodeUsageCredential()).toEqual({ apiKey: "go-key-123", plan: "Go" });
  });

  it("falls back to the legacy opencode (Zen) key when no opencode-go entry exists", async () => {
    writeAuthJson({ opencode: { type: "api", key: "zen-key-456" } });
    expect(await readOpenCodeUsageCredential()).toEqual({ apiKey: "zen-key-456", plan: "Zen" });
  });

  it("prefers the legacy opencode-go entry over the opencode fallback", async () => {
    writeAuthJson({
      "opencode-go": { type: "api", key: "go-key" },
      opencode: { type: "api", key: "zen-key" },
    });
    expect(await readOpenCodeUsageCredential()).toEqual({ apiKey: "go-key", plan: "Go" });
  });

  it("returns undefined for missing files, entries, or blank keys", async () => {
    expect(await readOpenCodeUsageCredential()).toBeUndefined();

    writeAuthJson({ "opencode-go": { type: "api", key: "   " } });
    expect(await readOpenCodeUsageCredential()).toBeUndefined();

    writeAuthJson({ "opencode-go": "not-an-object" });
    expect(await readOpenCodeUsageCredential()).toBeUndefined();
  });

  it("ignores malformed auth.json files", async () => {
    const dir = join(home, ".local", "share", "opencode");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "auth.json"), "{not json", "utf8");
    expect(await readOpenCodeUsageCredential()).toBeUndefined();
  });

  it("uses the active native Go key instead of obsolete JSON and inactive keys", async () => {
    writeAuthJson({ "opencode-go": { type: "api", key: "obsolete-json-key" } });
    writeNativeCredentials([
      { provider: "opencode", active: true, value: { type: "key", key: "zen-key" } },
      { provider: "opencode-go", active: false, value: { type: "key", key: "inactive-key" } },
      { provider: "opencode-go", active: true, value: { type: "key", key: "  native-go-key  " } },
    ]);
    expect(await readOpenCodeUsageCredential()).toEqual({ apiKey: "native-go-key", plan: "Go" });
  });

  it("does not resurrect JSON credentials when the native account has been removed", async () => {
    writeAuthJson({ "opencode-go": { type: "api", key: "obsolete-json-key" } });
    writeNativeCredentials([]);
    expect(await readOpenCodeUsageCredential()).toBeUndefined();
  });

  it("does not use obsolete JSON credentials when the native database cannot be read", async () => {
    writeAuthJson({ "opencode-go": { type: "api", key: "obsolete-json-key" } });
    writeFileSync(join(home, ".local", "share", "opencode", "opencode.db"), "invalid database");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await readOpenCodeUsageCredential()).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps auth.json readable for a pre-upgrade database without native credentials", async () => {
    writeAuthJson({ "opencode-go": { type: "api", key: "legacy-go-key" } });
    const db = new DatabaseSync(join(home, ".local", "share", "opencode", "opencode.db"));
    db.exec("CREATE TABLE message (data TEXT)");
    db.close();
    expect(await readOpenCodeUsageCredential()).toEqual({ apiKey: "legacy-go-key", plan: "Go" });
  });

  it.each(["relative", "absolute", "xdg"])(
    "honors the %s native database location",
    async (kind) => {
      writeNativeCredentials([
        { provider: "opencode-go", active: true, value: { type: "key", key: "default-key" } },
      ]);
      const dbPath =
        kind === "relative"
          ? join(home, ".local", "share", "opencode", "custom.db")
          : join(home, "custom-data", "opencode", "custom.db");
      if (kind === "xdg") {
        vi.stubEnv("XDG_DATA_HOME", join(home, "custom-data"));
        vi.stubEnv("OPENCODE_DB", "custom.db");
      } else {
        vi.stubEnv("OPENCODE_DB", kind === "absolute" ? dbPath : "custom.db");
      }
      writeNativeCredentials(
        [{ provider: "opencode-go", active: true, value: { type: "key", key: "custom-key" } }],
        dbPath,
      );
      expect(await readOpenCodeUsageCredential()).toEqual({ apiKey: "custom-key", plan: "Go" });
    },
  );

  describe.each(["legacy JSON", "native SQLite"])("%s collection", (storage) => {
    function writeCredential(provider: string): void {
      if (storage === "legacy JSON") {
        writeAuthJson({ [provider]: { type: "api", key: "fixture-api-key" } });
      } else {
        writeAuthJson({ [provider]: { type: "api", key: "obsolete-json-key" } });
        writeNativeCredentials([
          { provider, active: true, value: { type: "key", key: "fixture-api-key" } },
        ]);
      }
    }

    it("collects Go windows, retains them on failure, and replaces them on recovery", async () => {
      writeCredential("opencode-go");
      const usage = {
        rolling: { percent: 0, resetsAt: "2026-10-21T00:00:00Z" },
        weekly: { percent: 20, resetsAt: "2026-10-26T00:00:00Z" },
        monthly: { percent: 30, resetsAt: "2026-11-01T00:00:00Z" },
      };
      const route = { status: 200, body: JSON.stringify({ usage }) };
      const onRequest = vi.fn<(req: HttpRequest) => void>();
      const host = createFakeHost({
        routes: { [OPENCODE_GO_USAGE_ENDPOINT]: route },
        onRequest,
      });
      const service = new UsageService({
        cachePath: join(home, "usage.json"),
        emit: () => {},
        host,
        providerIds: ["opencode"],
        profileSources: () => [],
        localCollectors: [{ id: "opencode", collect: scanOpenCodeUsage }],
      });
      try {
        const refresh = () =>
          service.refreshProviderUsage({ providerIds: ["opencode"], force: true });
        const first = (await refresh()).snapshots[0]!;
        expect(first).toMatchObject({
          status: "ok",
          plan: "Go",
          windows: [
            { id: "session-5h", usedPercent: 0, resetsAt: Date.parse(usage.rolling.resetsAt) },
            { id: "weekly", usedPercent: 20, resetsAt: Date.parse(usage.weekly.resetsAt) },
            { id: "monthly", usedPercent: 30, resetsAt: Date.parse(usage.monthly.resetsAt) },
          ],
        });
        expect(onRequest).toHaveBeenLastCalledWith(
          expect.objectContaining({
            url: OPENCODE_GO_USAGE_ENDPOINT,
            headers: expect.objectContaining({ Authorization: "Bearer fixture-api-key" }),
          }),
        );
        route.status = 503;
        expect((await refresh()).snapshots).toEqual([{ ...first, status: "error" }]);
        route.status = 200;
        usage.rolling.percent = 13;
        route.body = JSON.stringify({ usage });
        expect((await refresh()).snapshots[0]).toMatchObject({
          status: "ok",
          windows: [
            { id: "session-5h", usedPercent: 13 },
            { usedPercent: 20 },
            { usedPercent: 30 },
          ],
        });
      } finally {
        service.stop();
      }
    });

    it("refreshes Zen balance, including zero, without requiring a Go subscription", async () => {
      writeCredential("opencode");
      let balance = 9;
      const request = vi.fn<HostPort["http"]["request"]>(async (req) => {
        if (req.url === OPENCODE_GO_USAGE_ENDPOINT) {
          return { status: 401, headers: {}, body: "{}" };
        }
        const url = new URL(req.url);
        expect(req.headers?.Cookie).toBe("auth=fixture-session");
        if (url.pathname === "/_server") {
          return {
            status: 200,
            headers: {},
            body: req.method === "GET" ? JSON.stringify({ id: "wrk_fixture" }) : "{}",
          };
        }
        expect(url.pathname).toMatch(/^\/workspace\/wrk_fixture(?:\/go)?$/);
        return { status: 200, headers: {}, body: JSON.stringify({ currentBalanceUsd: balance }) };
      });
      const host = createFakeHost({
        secrets: { opencode: { cookie: "auth=fixture-session; other=ignored" } },
      });
      host.http.request = request;
      expect(await scanOpenCodeUsage(host.now(), host)).toMatchObject({
        status: "ok",
        plan: "Zen",
        windows: [],
        credits: { balance: 9, currency: "USD" },
      });
      balance = 0;
      expect(await scanOpenCodeUsage(host.now(), host)).toMatchObject({
        status: "ok",
        plan: "Zen",
        windows: [],
        credits: { balance: 0, currency: "USD" },
      });
    });
  });
});
