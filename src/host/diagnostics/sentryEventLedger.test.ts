import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildSync } from "esbuild";
import { lockSync } from "proper-lockfile";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic } from "@/shared/atomicFile";
import { createPersistentSentryEventLimiter } from "./sentryEventLedger";

vi.mock("@/shared/atomicFile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/atomicFile")>();
  return {
    ...actual,
    writeFileAtomic: vi.fn<typeof actual.writeFileAtomic>(actual.writeFileAtomic),
  };
});

vi.mock("proper-lockfile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("proper-lockfile")>();
  return { ...actual, lockSync: vi.fn<typeof actual.lockSync>(actual.lockSync) };
});

const DAY = 24 * 60 * 60 * 1000;
const run = promisify(execFile);
let directory: string;
let path: string;
let time: number;
const event = (signature = "failure", level = "error") => ({ fingerprint: [signature], level });
const limiter = () => createPersistentSentryEventLimiter(path, () => time);

beforeEach(() => {
  vi.clearAllMocks();
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(join(process.cwd(), "tmp", "sentry-ledger-"));
  path = join(directory, "budget.json");
  time = DAY * 2;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

describe("persistent Sentry event budget", () => {
  it("drops exhausted signatures in memory without further disk operations", () => {
    const shouldSend = limiter();
    for (let index = 0; index < 3; index++) expect(shouldSend(event())).toBe(true);
    expect(lockSync).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 20; index++) expect(shouldSend(event())).toBe(false);
    expect(lockSync).toHaveBeenCalledTimes(3);
    const restarted = limiter();
    expect(restarted(event())).toBe(false);
    expect(lockSync).toHaveBeenCalledTimes(4);
    for (let index = 0; index < 20; index++) expect(restarted(event())).toBe(false);
    expect(lockSync).toHaveBeenCalledTimes(4);
    time += DAY;
    expect(shouldSend(event())).toBe(true);
    expect(lockSync).toHaveBeenCalledTimes(5);
  });

  it("upgrades a profile without a ledger and preserves signature limits across restarts", () => {
    for (let index = 0; index < 3; index++) expect(limiter()(event())).toBe(true);
    expect(limiter()(event())).toBe(false);
    const stored = readFileSync(path, "utf8");
    expect(stored).not.toContain("failure");
    expect(JSON.parse(stored).formatVersion).toBe(1);
    time += DAY - 1;
    expect(limiter()(event())).toBe(false);
    time++;
    expect(limiter()(event())).toBe(true);
  });

  it("preserves the total and reserved fatal budget across restarts", () => {
    for (let index = 0; index < 15; index++) expect(limiter()(event(String(index)))).toBe(true);
    expect(limiter()(event("another handled"))).toBe(false);
    for (let index = 0; index < 5; index++)
      expect(limiter()(event(`fatal-${index}`, "fatal"))).toBe(true);
    expect(limiter()(event("another fatal", "fatal"))).toBe(false);
    time += DAY;
    expect(limiter()(event("new day"))).toBe(true);
  });

  it("keeps independent transmission owners in separate ledgers", () => {
    const first = limiter();
    const second = createPersistentSentryEventLimiter(
      join(directory, "supervisor.json"),
      () => time,
    );
    for (let index = 0; index < 3; index++) expect(first(event())).toBe(true);
    expect(first(event())).toBe(false);
    expect(second(event())).toBe(true);
  });

  it("refuses a busy lock without falling back or spending an allowance", () => {
    const release = lockSync(path, { realpath: false });
    const shouldSend = limiter();
    try {
      for (let index = 0; index < 4; index++) expect(shouldSend(event())).toBe(false);
      expect(console.warn).not.toHaveBeenCalled();
    } finally {
      release();
    }
    for (let index = 0; index < 3; index++) expect(shouldSend(event())).toBe(true);
    expect(shouldSend(event())).toBe(false);
  });

  it("recovers a stale lock left by a killed process", () => {
    mkdirSync(`${path}.lock`);
    const past = new Date(Date.now() - 60_000);
    utimesSync(`${path}.lock`, past, past);
    expect(limiter()(event())).toBe(true);
  });

  it("refuses Windows delete-pending lock EPERM without allocating a fallback budget", () => {
    const platform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    const shouldSend = limiter();
    try {
      vi.mocked(lockSync).mockImplementationOnce(() => {
        throw Object.assign(new Error("delete-pending lock"), {
          code: "EPERM",
          syscall: "mkdir",
          path: `${path}.lock`,
        });
      });
      expect(shouldSend(event())).toBe(false);
      expect(console.warn).not.toHaveBeenCalled();
      for (let index = 0; index < 3; index++) expect(shouldSend(event())).toBe(true);
      expect(shouldSend(event())).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", { value: platform });
    }
  });

  it.each([
    "not json",
    JSON.stringify({ formatVersion: 2 }),
    JSON.stringify({
      formatVersion: 1,
      processEvents: [],
      handledEvents: [1],
      signatureEvents: [],
    }),
    "x".repeat(16_385),
  ])("preserves unreadable or unsupported state and uses bounded memory", (stored) => {
    writeFileSync(path, stored);
    const shouldSend = limiter();
    for (let index = 0; index < 3; index++) expect(shouldSend(event())).toBe(true);
    expect(shouldSend(event())).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(stored);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it.each(["ENOSPC", "EPERM"])("keeps already admitted samples charged on write %s", (code) => {
    const shouldSend = limiter();
    expect(shouldSend(event())).toBe(true);
    vi.mocked(writeFileAtomic).mockImplementationOnce(() => {
      throw Object.assign(new Error("storage write failed"), { code });
    });
    expect(shouldSend(event())).toBe(true);
    expect(shouldSend(event())).toBe(true);
    expect(shouldSend(event())).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(path, "utf8")).processEvents).toHaveLength(1);
  });

  it("keeps reporting bounded when the storage directory is unavailable", () => {
    writeFileSync(join(directory, "file"), "not a directory");
    const shouldSend = createPersistentSentryEventLimiter(join(directory, "file", "budget.json"));
    for (let index = 0; index < 15; index++) expect(shouldSend(event(String(index)))).toBe(true);
    expect(shouldSend(event("handled overflow"))).toBe(false);
    expect(shouldSend(event("crash", "fatal"))).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("serializes admission from concurrently restarting processes", async () => {
    const bundle = join(directory, "ledger.cjs");
    buildSync({
      entryPoints: ["src/host/diagnostics/sentryEventLedger.ts"],
      outfile: bundle,
      bundle: true,
      platform: "node",
      format: "cjs",
    });
    const source = `
      const { createPersistentSentryEventLimiter } = require(process.argv[1]);
      const send = createPersistentSentryEventLimiter(process.argv[2]);
      let accepted = 0;
      for (let index = 0; index < 10; index++) {
        if (send({ fingerprint: [process.argv[3] + '-' + index], level: 'error' })) accepted++;
      }
      process.stdout.write(String(accepted));
    `;
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        run(process.execPath, ["-e", source, bundle, path, String(index)]),
      ),
    );
    expect(results.map((result) => result.stderr)).toEqual(Array<string>(6).fill(""));
    const admitted = results.reduce((sum, result) => sum + Number(result.stdout), 0);
    expect(admitted).toBeGreaterThan(0);
    expect(admitted).toBeLessThanOrEqual(15);
    expect(JSON.parse(readFileSync(path, "utf8")).processEvents).toHaveLength(admitted);
    const restarted = createPersistentSentryEventLimiter(path);
    for (let index = admitted; index < 15; index++)
      expect(restarted(event(`remaining-${index}`))).toBe(true);
    expect(restarted(event("overflow"))).toBe(false);
  });
});
