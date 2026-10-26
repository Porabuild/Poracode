import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:tls";
import { describe, expect, it } from "bun:test";
import { generateSelfSignedTlsMaterial } from "@/host/remote/server/tlsMaterial";
import {
  TUI_SESSION_FILE_NAME,
  TUI_SESSION_LOCK_NAME,
  TUI_SESSION_VERSION,
  tuiSessionSchema,
  type TuiSession,
} from "@/shared/tuiSession";
import {
  connectRemoteSession,
  pairingEndpoint,
  pinnedFetch,
  probePinnedCertificate,
  RemoteTlsPinError,
  verifyCertificateSan,
  verifyPinnedCertificate,
} from "./connection";

describe("TUI TLS certificate pinning", () => {
  const material = generateSelfSignedTlsMaterial({
    commonName: "localhost",
    dnsNames: ["localhost"],
    ipAddresses: ["127.0.0.1"],
  });
  const certificate = new X509Certificate(material.cert);

  it("accepts the pairing fingerprint only for a leaf with a matching SAN", () => {
    expect(
      verifyPinnedCertificate(certificate.raw, "127.0.0.1", material.fingerprint),
    ).toMatchObject({ fingerprint: material.fingerprint });
    expect(() => verifyCertificateSan(certificate, "wrong.local")).toThrow(
      "no subject alternative name matching",
    );
  });

  it("refuses a mismatched fingerprint and a certificate with no SAN", () => {
    expect(() => verifyPinnedCertificate(certificate.raw, "localhost", "00".repeat(32))).toThrow(
      RemoteTlsPinError,
    );
    expect(() =>
      verifyCertificateSan(
        { subjectAltName: undefined } as unknown as X509Certificate,
        "localhost",
      ),
    ).toThrow("no subject alternative name");
  });

  it("probes the live leaf certificate over TLS before returning its pin", async () => {
    const server = createServer({ cert: material.cert, key: material.key }, (socket) => {
      socket.end();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TLS test server has no address");
    try {
      const pin = await probePinnedCertificate(
        `https://127.0.0.1:${address.port}`,
        material.fingerprint,
      );
      expect(pin.fingerprint).toBe(material.fingerprint);
      expect(pin.pem).toContain("-----BEGIN CERTIFICATE-----");
      await expect(
        probePinnedCertificate(`https://127.0.0.1:${address.port}`, "00".repeat(32)),
      ).rejects.toThrow("does not match the fingerprint");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("does not resend a failed request or re-probe the pin", async () => {
    const server = createServer({ cert: material.cert, key: material.key }, (socket) => {
      socket.end();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TLS test server has no address");
    const original = globalThis.fetch;
    let sends = 0;
    globalThis.fetch = (async () => {
      sends += 1;
      throw new Error("send failed");
    }) as unknown as typeof fetch;
    try {
      const fetchImpl = pinnedFetch(`https://127.0.0.1:${address.port}`, material.fingerprint);
      await expect(
        fetchImpl(`https://127.0.0.1:${address.port}/oauth/token`, {
          method: "POST",
          body: "{}",
        }),
      ).rejects.toThrow("send failed");
      // A failed request is never resent and the pin is not re-probed.
      expect(sends).toBe(1);
    } finally {
      globalThis.fetch = original;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("requires a valid certificate fingerprint for HTTPS pairing", () => {
    expect(() => pairingEndpoint("https://localhost:49152/#token=token")).toThrow(
      "missing its certificate fingerprint",
    );
    expect(
      pairingEndpoint(`https://localhost:49152/#token=token&fp=sha256:${material.fingerprint}`),
    ).toMatchObject({
      endpoint: "https://localhost:49152",
      credential: "token",
      certFingerprint: material.fingerprint,
    });
  });
});

describe("TUI session refresh lock", () => {
  const writeSession = (home: string, session: TuiSession) =>
    writeFileSync(join(home, TUI_SESSION_FILE_NAME), JSON.stringify(session));
  const readSession = (home: string) =>
    tuiSessionSchema.parse(JSON.parse(readFileSync(join(home, TUI_SESSION_FILE_NAME), "utf8")));

  it("serializes concurrent refresh across clients sharing one session file", async () => {
    const home = mkdtempSync(join(tmpdir(), "tui-session-"));
    const original = globalThis.fetch;
    // Fake host: rotates the refresh token on each exchange and rejects a
    // reused (already-rotated) token like RefreshTokenReuseError does.
    let current = "refresh-0";
    let generation = 0;
    const presented: string[] = [];
    const reused: string[] = [];
    try {
      writeSession(home, {
        version: TUI_SESSION_VERSION,
        endpoint: "http://127.0.0.1:38987",
        accessToken: "access-0",
        refreshToken: "refresh-0",
        refreshExpiresAtMs: Date.now() + 86_400_000,
      });
      globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        if (new URL(String(url)).pathname !== "/oauth/token")
          return new Response("{}", { status: 404 });
        const body = JSON.parse(String(init?.body)) as { refreshToken: string };
        presented.push(body.refreshToken);
        if (body.refreshToken !== current) {
          reused.push(body.refreshToken);
          return new Response(
            JSON.stringify({ error: { code: "refresh_token_reused", message: "reused" } }),
            { status: 401, headers: { "content-type": "application/json" } },
          );
        }
        generation += 1;
        current = `refresh-${generation}`;
        // Yield so the two refreshers really interleave on the lock.
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response(
          JSON.stringify({
            accessToken: `access-${generation}`,
            tokenType: "Bearer",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            scopes: ["session:read"],
            refreshToken: current,
            refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;

      const first = await connectRemoteSession(home);
      const second = await connectRemoteSession(home);
      first.dispose();
      second.dispose();
      expect(reused).toEqual([]);
      // The second connect re-read the file under the lock and presented the
      // token the first rotation persisted — never the stale original.
      expect(presented).toEqual(["refresh-0", "refresh-1"]);
      expect(readSession(home).refreshToken).toBe("refresh-2");
    } finally {
      globalThis.fetch = original;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("waits out a just-created empty lock instead of breaking it", async () => {
    const home = mkdtempSync(join(tmpdir(), "tui-session-"));
    const original = globalThis.fetch;
    try {
      writeSession(home, {
        version: TUI_SESSION_VERSION,
        endpoint: "http://127.0.0.1:38987",
        accessToken: "access-0",
        refreshToken: "refresh-0",
        refreshExpiresAtMs: Date.now() + 86_400_000,
      });
      // The holder between openSync("wx") and writeFileSync leaves an empty,
      // fresh lock — a contender must wait, not stomp it.
      writeFileSync(join(home, TUI_SESSION_LOCK_NAME), "");
      const started = Date.now();
      const timer = setTimeout(
        () => rmSync(join(home, TUI_SESSION_LOCK_NAME), { force: true }),
        300,
      );
      timer.unref();
      globalThis.fetch = (async (url: RequestInfo | URL) => {
        if (new URL(String(url)).pathname !== "/oauth/token")
          return new Response("{}", { status: 404 });
        return new Response(
          JSON.stringify({
            accessToken: "access-1",
            tokenType: "Bearer",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            scopes: ["session:read"],
            refreshToken: "refresh-1",
            refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;
      const session = await connectRemoteSession(home);
      session.dispose();
      expect(Date.now() - started).toBeGreaterThanOrEqual(250);
      expect(readSession(home).refreshToken).toBe("refresh-1");
    } finally {
      globalThis.fetch = original;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("breaks an empty lock only once it is old", async () => {
    const home = mkdtempSync(join(tmpdir(), "tui-session-"));
    const original = globalThis.fetch;
    try {
      writeSession(home, {
        version: TUI_SESSION_VERSION,
        endpoint: "http://127.0.0.1:38987",
        accessToken: "access-0",
        refreshToken: "refresh-0",
        refreshExpiresAtMs: Date.now() + 86_400_000,
      });
      const lock = join(home, TUI_SESSION_LOCK_NAME);
      writeFileSync(lock, "");
      const old = new Date(Date.now() - 10_000);
      utimesSync(lock, old, old);
      let refreshed = false;
      globalThis.fetch = (async (url: RequestInfo | URL) => {
        if (new URL(String(url)).pathname !== "/oauth/token")
          return new Response("{}", { status: 404 });
        refreshed = true;
        return new Response(
          JSON.stringify({
            accessToken: "access-1",
            tokenType: "Bearer",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            scopes: ["session:read"],
            refreshToken: "refresh-1",
            refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;
      const started = Date.now();
      const session = await connectRemoteSession(home);
      session.dispose();
      expect(refreshed).toBe(true);
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(readSession(home).refreshToken).toBe("refresh-1");
    } finally {
      globalThis.fetch = original;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps the refresh when persisting rotated tokens fails", async () => {
    const home = mkdtempSync(join(tmpdir(), "tui-session-"));
    const original = globalThis.fetch;
    try {
      writeSession(home, {
        version: TUI_SESSION_VERSION,
        endpoint: "http://127.0.0.1:38987",
        accessToken: "access-0",
        refreshToken: "refresh-0",
        refreshExpiresAtMs: Date.now() + 86_400_000,
      });
      // The refresh reply carries no rotation fields, so building the
      // persisted session throws inside onTokensRefreshed — that must not
      // fault the refresh itself.
      globalThis.fetch = (async (url: RequestInfo | URL) => {
        if (new URL(String(url)).pathname !== "/oauth/token")
          return new Response("{}", { status: 404 });
        return new Response(
          JSON.stringify({
            accessToken: "access-1",
            tokenType: "Bearer",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            scopes: ["session:read"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;
      const session = await connectRemoteSession(home);
      session.dispose();
      // The prior session file is untouched — the failed persist never wrote.
      expect(readSession(home).refreshToken).toBe("refresh-0");
    } finally {
      globalThis.fetch = original;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("breaks a session.lock left by a dead process", async () => {
    const home = mkdtempSync(join(tmpdir(), "tui-session-"));
    const original = globalThis.fetch;
    try {
      writeSession(home, {
        version: TUI_SESSION_VERSION,
        endpoint: "http://127.0.0.1:38987",
        accessToken: "access-0",
        refreshToken: "refresh-0",
        refreshExpiresAtMs: Date.now() + 86_400_000,
      });
      // A lock from a pid that cannot exist, written long ago.
      writeFileSync(join(home, TUI_SESSION_LOCK_NAME), JSON.stringify({ pid: 4_000_000, at: 0 }));
      let refreshed = false;
      globalThis.fetch = (async (url: RequestInfo | URL) => {
        if (new URL(String(url)).pathname !== "/oauth/token")
          return new Response("{}", { status: 404 });
        refreshed = true;
        return new Response(
          JSON.stringify({
            accessToken: "access-1",
            tokenType: "Bearer",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            scopes: ["session:read"],
            refreshToken: "refresh-1",
            refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;
      const session = await connectRemoteSession(home);
      session.dispose();
      expect(refreshed).toBe(true);
      expect(readSession(home).refreshToken).toBe("refresh-1");
    } finally {
      globalThis.fetch = original;
      rmSync(home, { recursive: true, force: true });
    }
  });
});
