import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fulfillPairingControlRequest, requestPairingFromRunningServer } from "./pairingControl";

describe("pairingControl", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), "lc-pairing-control-"));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("leaves a manual SIGUSR2 request unhandled", () => {
    const issuePairingUrl = vi.fn<() => string>(() => "http://127.0.0.1/pair#token=unused");

    expect(fulfillPairingControlRequest(baseDir, issuePairingUrl)).toBe(false);
    expect(issuePairingUrl).not.toHaveBeenCalled();
  });

  it("writes the machine response for a pending request", () => {
    writeFileSync(join(baseDir, "server-pairing-request.lock"), String(process.pid), "utf8");
    writeFileSync(
      join(baseDir, "server-pairing-request.json"),
      JSON.stringify({ requestId: "request-1" }),
      "utf8",
    );
    const issuePairingUrl = vi.fn<() => string>(() => "http://127.0.0.1/pair#token=lc_pair_test");

    expect(fulfillPairingControlRequest(baseDir, issuePairingUrl)).toBe(true);
    expect(issuePairingUrl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(join(baseDir, "server-pairing-response.json"), "utf8"))).toEqual(
      {
        requestId: "request-1",
        pairingUrl: "http://127.0.0.1/pair#token=lc_pair_test",
      },
    );
    expect(() => statSync(join(baseDir, "server-pairing-request.json"))).toThrow(/ENOENT/);
  });

  it.skipIf(process.platform === "win32")(
    "writes the pairing response with owner-only permissions",
    () => {
      writeFileSync(join(baseDir, "server-pairing-request.lock"), String(process.pid), "utf8");
      writeFileSync(
        join(baseDir, "server-pairing-request.json"),
        JSON.stringify({ requestId: "secure-request" }),
        "utf8",
      );
      fulfillPairingControlRequest(baseDir, () => "http://127.0.0.1/pair#token=secure");

      expect(statSync(join(baseDir, "server-pairing-response.json")).mode & 0o777).toBe(0o600);
    },
  );

  it("leaves a manual request unhandled when the machine requester died", () => {
    writeFileSync(join(baseDir, "server-pairing-request.lock"), "999999999", "utf8");
    writeFileSync(
      join(baseDir, "server-pairing-request.json"),
      JSON.stringify({ requestId: "stale-request" }),
      "utf8",
    );
    const issuePairingUrl = vi.fn<() => string>(() => "http://127.0.0.1/pair#token=unused");

    expect(fulfillPairingControlRequest(baseDir, issuePairingUrl)).toBe(false);
    expect(issuePairingUrl).not.toHaveBeenCalled();
    expect(() => statSync(join(baseDir, "server-pairing-request.json"))).toThrow(/ENOENT/);
  });

  it("requests and receives a fresh URL from the running process", async () => {
    writeFileSync(join(baseDir, "server.lock"), "4242", "utf8");
    const signalProcess = vi.fn<() => void>(() => {
      fulfillPairingControlRequest(baseDir, () => "http://127.0.0.1/pair#token=lc_pair_fresh");
    });

    await expect(
      requestPairingFromRunningServer(baseDir, {
        requestId: () => "request-2",
        isProcessAlive: () => true,
        signalProcess,
      }),
    ).resolves.toEqual({
      requestId: "request-2",
      pairingUrl: "http://127.0.0.1/pair#token=lc_pair_fresh",
    });
    expect(signalProcess).toHaveBeenCalledExactlyOnceWith(4242);
    expect(() => statSync(join(baseDir, "server-pairing-request.lock"))).toThrow(/ENOENT/);
    expect(() => statSync(join(baseDir, "server-pairing-response.json"))).toThrow(/ENOENT/);
  });

  it("rejects a dead server process", async () => {
    writeFileSync(join(baseDir, "server.lock"), "4242", "utf8");

    await expect(
      requestPairingFromRunningServer(baseDir, {
        isProcessAlive: () => false,
        signalProcess: () => undefined,
      }),
    ).rejects.toThrow(/is not running/);
  });

  it("rejects a concurrent pairing request", async () => {
    writeFileSync(join(baseDir, "server.lock"), "4242", "utf8");
    writeFileSync(join(baseDir, "server-pairing-request.lock"), "4343", "utf8");

    await expect(
      requestPairingFromRunningServer(baseDir, {
        isProcessAlive: (pid) => pid === 4242 || pid === 4343,
        signalProcess: () => undefined,
      }),
    ).rejects.toThrow(/already in progress/);
  });

  it("reclaims a pairing lock left by a dead requester", async () => {
    writeFileSync(join(baseDir, "server.lock"), "4242", "utf8");
    writeFileSync(join(baseDir, "server-pairing-request.lock"), "4343", "utf8");

    await expect(
      requestPairingFromRunningServer(baseDir, {
        requestId: () => "request-after-crash",
        isProcessAlive: (pid) => pid === 4242,
        signalProcess: () => {
          fulfillPairingControlRequest(baseDir, () => "http://127.0.0.1/pair#token=fresh");
        },
      }),
    ).resolves.toMatchObject({ requestId: "request-after-crash" });
  });

  it("ignores a stale response and times out", async () => {
    writeFileSync(join(baseDir, "server.lock"), "4242", "utf8");
    writeFileSync(
      join(baseDir, "server-pairing-response.json"),
      JSON.stringify({ requestId: "stale", pairingUrl: "http://old.invalid/pair" }),
      "utf8",
    );

    await expect(
      requestPairingFromRunningServer(baseDir, {
        timeoutMs: 10,
        pollIntervalMs: 1,
        requestId: () => "fresh",
        isProcessAlive: () => true,
        signalProcess: () => undefined,
      }),
    ).rejects.toThrow(/Timed out/);
    expect(() => statSync(join(baseDir, "server-pairing-request.json"))).toThrow(/ENOENT/);
    expect(() => statSync(join(baseDir, "server-pairing-response.json"))).toThrow(/ENOENT/);
  });
});
