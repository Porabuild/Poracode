import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { parsePairingCertFingerprint } from "@/shared/remote/pairingUrl";
import { generateSelfSignedTlsMaterial } from "./server/tlsMaterial";
import { remoteAccessBindRefusal } from "./config";
import { probeTlsCertificateFingerprint } from "./certFingerprintProbe";

/**
 * Gate 6 item 4.2 (TLS) acceptance, server-side end-to-end with a generated
 * self-signed certificate in-process: the listener serves HTTPS, the pairing
 * QR carries the leaf fingerprint, a probe-capable client pairs over https and
 * pins, and a mismatched fingerprint refuses BEFORE the one-time credential is
 * spent.
 */

vi.mock("./db", () => ({
  dbGetThreadRuntimeItem: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetThreads: vi.fn<(...args: unknown[]) => unknown[]>(() => []),
  dbGetThread: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetProject: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbGetState: vi.fn<(...args: unknown[]) => unknown>(() => null),
  dbSetState: vi.fn<(...args: unknown[]) => void>(),
}));

const servers: RemoteAccessServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

function createServer(options?: Partial<RemoteAccessServerOptions>): RemoteAccessServer {
  const server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "desktop-tls-test", label: "TLS Test Desktop" },
    host: "127.0.0.1",
    port: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    ...options,
  });
  servers.push(server);
  return server;
}

/** A fetch that talks real TLS to the self-signed listener without installing
 * a process-wide certificate bypass. Mirrors what a Node-transport client
 * (desktop helper, attached Electron main) can legitimately do. */
function insecureTlsFetch(
  url: string | URL,
  init?: {
    method?: string;
    body?: string | Uint8Array;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
): Promise<Response> {
  const target = new URL(String(url));
  const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const options = {
      method: init?.method ?? "GET",
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      headers: init?.headers,
      rejectUnauthorized: false,
      signal: init?.signal,
    };
    const request = transport(options as RequestOptions, (message) => {
      const chunks: Buffer[] = [];
      message.on("data", (chunk: Buffer) => chunks.push(chunk));
      message.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve(
          new Response(body, {
            status: message.statusCode ?? 0,
            headers: { "content-type": message.headers["content-type"] ?? "application/json" },
          }),
        );
      });
    });
    request.on("error", reject);
    if (init?.body !== undefined) request.write(init.body);
    request.end();
  });
}

function pairingParts(pairingUrl: string): { credential: string; fingerprint: string | null } {
  const credential = new URLSearchParams(new URL(pairingUrl).hash.slice(1)).get("token");
  expect(credential).toBeTruthy();
  return {
    credential: credential!,
    fingerprint: parsePairingCertFingerprint(pairingUrl),
  };
}

describe("RemoteAccessServer TLS (Gate 6 item 4.2)", () => {
  it("listens HTTPS, carries the certificate fingerprint in the pairing QR, and answers over https", async () => {
    const material = generateSelfSignedTlsMaterial({ commonName: "tls-test-host" });
    const server = createServer({ tls: material });
    const info = await server.start();

    expect(info.httpBaseUrl.startsWith("https://")).toBe(true);
    expect(server.tlsFingerprint()).toBe(material.fingerprint);

    const pairingUrl = server.issuePairingUrl("TLS acceptance");
    const parts = pairingParts(pairingUrl);
    // The QR carries the exact sha256 hex the server serves.
    expect(parts.fingerprint).toBe(material.fingerprint);

    // A plaintext-speaking client gets nothing on the TLS port and vice versa:
    // real TLS is live (the handshake below succeeds against the cert).
    await expect(probeTlsCertificateFingerprint(info.httpBaseUrl)).resolves.toBe(
      material.fingerprint,
    );

    // The unauthenticated operability probe rides the same TLS surface.
    const health = await insecureTlsFetch(new URL("/healthz", info.httpBaseUrl));
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
  });

  it("pairs a probe-capable client over https and pins the observed certificate", async () => {
    const material = generateSelfSignedTlsMaterial();
    const server = createServer({ tls: material });
    const info = await server.start();
    const { credential, fingerprint } = pairingParts(server.issuePairingUrl("Pin acceptance"));
    expect(fingerprint).toBe(material.fingerprint);

    const onCertFingerprintValidated = vi.fn<(fingerprint: string) => void>();
    const client = new RemoteDesktopClient(info.httpBaseUrl, undefined, insecureTlsFetch, {
      certFingerprintProbe: () => probeTlsCertificateFingerprint(info.httpBaseUrl),
      onCertFingerprintValidated,
    });

    const token = await client.exchangePairingCredential({
      credential,
      scopes: ["session:read"],
      ...(fingerprint ? { certFingerprint: fingerprint } : {}),
    });
    expect(token.accessToken).toBeTruthy();
    // The refresh lifecycle is live on the wire (Gate 6 item 4.6).
    expect(token.refreshToken).toBeTruthy();
    // First pair over a probe-capable transport adopted the observed cert.
    expect(onCertFingerprintValidated).toHaveBeenCalledWith(material.fingerprint);

    // The pinned client keeps working on the same server.
    const pinned = new RemoteDesktopClient(info.httpBaseUrl, token.accessToken, insecureTlsFetch, {
      certFingerprint: material.fingerprint,
      certFingerprintProbe: () => probeTlsCertificateFingerprint(info.httpBaseUrl),
    });
    await expect(pinned.environment()).resolves.toMatchObject({
      desktopId: "desktop-tls-test",
    });
  });

  it("refuses a pairing whose QR fingerprint contradicts the served certificate and keeps the credential unspent", async () => {
    const material = generateSelfSignedTlsMaterial();
    const imposter = generateSelfSignedTlsMaterial();
    const server = createServer({ tls: material });
    const info = await server.start();
    const { credential } = pairingParts(server.issuePairingUrl("Mismatch acceptance"));

    const client = new RemoteDesktopClient(info.httpBaseUrl, undefined, insecureTlsFetch, {
      // The probe sees the REAL server certificate…
      certFingerprintProbe: () => Promise.resolve(material.fingerprint),
    });

    // …but the scanned QR asserts a different one: refuse.
    await expect(
      client.exchangePairingCredential({
        credential,
        scopes: ["session:read"],
        certFingerprint: imposter.fingerprint,
      }),
    ).rejects.toMatchObject({ code: "certificate_fingerprint_mismatch" });

    // The one-time credential was never sent, so pairing with the honest QR
    // (same credential) still succeeds.
    const honest = new RemoteDesktopClient(info.httpBaseUrl, undefined, insecureTlsFetch, {
      certFingerprintProbe: () => Promise.resolve(material.fingerprint),
    });
    await expect(
      honest.exchangePairingCredential({
        credential,
        scopes: ["session:read"],
        certFingerprint: material.fingerprint,
      }),
    ).resolves.toMatchObject({ accessToken: expect.stringMatching(/^lc_access_/) });
  });

  it("refuses every request once a pinned client meets a different certificate", async () => {
    const server = createServer({ tls: generateSelfSignedTlsMaterial() });
    const info = await server.start();
    const actual = await probeTlsCertificateFingerprint(info.httpBaseUrl);
    const stale = generateSelfSignedTlsMaterial().fingerprint;
    expect(stale).not.toBe(actual);

    const client = new RemoteDesktopClient(info.httpBaseUrl, "lc_access_stale", insecureTlsFetch, {
      certFingerprint: stale,
      certFingerprintProbe: () => probeTlsCertificateFingerprint(info.httpBaseUrl),
    });

    await expect(client.environment()).rejects.toMatchObject({
      code: "certificate_fingerprint_mismatch",
      status: 502,
    });
  });

  it("stays plaintext without material and accepts a wildcard bind when TLS is configured", async () => {
    const plaintext = createServer({ tls: null });
    const info = await plaintext.start();
    expect(info.httpBaseUrl.startsWith("http://")).toBe(true);
    expect(plaintext.tlsFingerprint()).toBeNull();

    // Gate 6 items 4.1/4.2: the all-interfaces bind needs TLS material OR the
    // explicit acknowledgement; configured TLS alone satisfies the gate.
    expect(remoteAccessBindRefusal("0.0.0.0", { tlsConfigured: true })).toBeNull();
    expect(
      remoteAccessBindRefusal("0.0.0.0", {
        env: { PORACODE_ALLOW_PLAINTEXT_LAN: "1" },
        tlsConfigured: false,
      }),
    ).toBeNull();
    expect(remoteAccessBindRefusal("0.0.0.0", { tlsConfigured: false })).toMatch(
      /Refusing to bind the remote access listener/,
    );
  });
});
