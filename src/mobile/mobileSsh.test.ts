// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SshBridgePlugin } from "@lightcode/ssh-bridge";
import type { SshConnectionConfig } from "@/shared/ssh";

const bridge = vi.hoisted(() => ({
  probeHostKey: vi.fn<SshBridgePlugin["probeHostKey"]>(),
  connect: vi.fn<SshBridgePlugin["connect"]>(),
  run: vi.fn<SshBridgePlugin["run"]>(),
  upload: vi.fn<SshBridgePlugin["upload"]>(),
  forward: vi.fn<SshBridgePlugin["forward"]>(),
  disconnect: vi.fn<SshBridgePlugin["disconnect"]>(),
}));

vi.mock("@lightcode/ssh-bridge", () => ({ SshBridge: bridge }));

import { __resetMobileSshRuntimeForTests, connectMobileSsh, probeMobileSshHost } from "./mobileSsh";

const connection: SshConnectionConfig = {
  id: "a5fe6f57-e779-4efe-aad8-6cd9ec0c38fb",
  label: "Build host",
  target: "dev@example.com",
  port: 2222,
  authentication: "password",
  hostKeyFingerprint: `SHA256:${"a".repeat(43)}`,
};

function response(input: { json?: unknown; bytes?: Uint8Array; ok?: boolean; status?: number }) {
  return {
    ok: input.ok ?? true,
    status: input.status ?? 200,
    json: vi.fn<() => Promise<unknown>>(async () => input.json),
    arrayBuffer: vi.fn<() => Promise<ArrayBuffer>>(
      async () => (input.bytes ?? new Uint8Array()).buffer as ArrayBuffer,
    ),
  } as unknown as Response;
}

describe("mobile SSH bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMobileSshRuntimeForTests();
    bridge.connect.mockResolvedValue(undefined);
    bridge.upload.mockResolvedValue(undefined);
    bridge.disconnect.mockResolvedValue(undefined);
    bridge.forward.mockResolvedValue({ endpoint: "http://127.0.0.1:40123/", localPort: 40123 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("probes a host key without sending credentials", async () => {
    bridge.probeHostKey.mockResolvedValue({
      fingerprint: "SHA256:key",
      algorithm: "ssh-ed25519",
    });
    await expect(probeMobileSshHost("dev@example.com", 2222)).resolves.toEqual({
      fingerprint: "SHA256:key",
      algorithm: "ssh-ed25519",
    });
    expect(bridge.probeHostKey).toHaveBeenCalledWith({ host: "example.com", port: 2222 });
  });

  it("reuses an installed runtime, launches, pairs, and probes the tunnel", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ json: { hash: "a".repeat(64), archive: "runtime.tar.gz" } }),
        )
        .mockResolvedValueOnce(response({})),
    );
    bridge.run
      .mockResolvedValueOnce({ stdout: "ready\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '{"remotePort":38987}\n', stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({
        stdout: '{"pairingUrl":"http://127.0.0.1:38987/pair#token=lc_pair_mobile"}\n',
        stderr: "",
        exitCode: 0,
      });

    await expect(
      connectMobileSsh(connection, { kind: "password", password: "secret" }, true),
    ).resolves.toEqual({
      endpoint: "http://127.0.0.1:40123/",
      pairingCredential: "lc_pair_mobile",
    });
    expect(bridge.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "example.com",
        username: "dev",
        port: 2222,
        hostKeyFingerprint: `SHA256:${"a".repeat(43)}`,
      }),
    );
    expect(bridge.upload).not.toHaveBeenCalled();
    expect(bridge.forward).toHaveBeenCalledWith({
      connectionId: connection.id,
      remotePort: 38987,
    });
  });

  it("uploads and installs the bundled runtime when the host is cold", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ json: { hash: "b".repeat(64), archive: "runtime.tar.gz" } }),
        )
        .mockResolvedValueOnce(response({ bytes: new Uint8Array([1, 2, 3]) }))
        .mockResolvedValueOnce(response({})),
    );
    bridge.run
      .mockResolvedValueOnce({ stdout: "install\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "ready\n", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '{"remotePort":38988}\n', stderr: "", exitCode: 0 });

    await connectMobileSsh(connection, { kind: "password", password: "secret" }, false);
    expect(bridge.upload).toHaveBeenCalledWith({
      connectionId: connection.id,
      remotePath: `.lightcode/ssh/uploads/${"b".repeat(64)}.tar.gz`,
      base64: "AQID",
    });
  });

  it("closes the native SSH connection when bootstrap fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ json: { hash: "c".repeat(64), archive: "runtime.tar.gz" } }),
        ),
    );
    bridge.run.mockResolvedValueOnce({
      stdout: "",
      stderr: "node is too old",
      exitCode: 41,
    });
    await expect(
      connectMobileSsh(connection, { kind: "password", password: "secret" }, false),
    ).rejects.toThrow("node is too old");
    expect(bridge.disconnect).toHaveBeenCalledWith({ connectionId: connection.id });
  });
});
