import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStorage = vi.hoisted(() => ({
  set: vi.fn<(key: string, value: string) => Promise<void>>(),
  get: vi.fn<(key: string) => Promise<unknown>>(),
  remove: vi.fn<(key: string) => Promise<void>>(),
}));

vi.mock("@aparajita/capacitor-secure-storage", () => ({ SecureStorage: secureStorage }));

import { deleteSshCredential, getSshCredential, setSshCredential } from "./sshVault";

describe("SSH credential vault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores password credentials under the connection-scoped secure key", async () => {
    await setSshCredential("connection-1", { kind: "password", password: "secret" });

    expect(secureStorage.set).toHaveBeenCalledWith(
      "remoteSshCredential.connection-1",
      JSON.stringify({ kind: "password", password: "secret" }),
    );
  });

  it("restores private-key credentials with an optional passphrase", async () => {
    secureStorage.get.mockResolvedValue(
      JSON.stringify({ kind: "private-key", privateKey: "PRIVATE KEY", passphrase: "phrase" }),
    );

    await expect(getSshCredential("connection-2")).resolves.toEqual({
      kind: "private-key",
      privateKey: "PRIVATE KEY",
      passphrase: "phrase",
    });
  });

  it("treats malformed secure-storage data as a missing credential", async () => {
    secureStorage.get.mockResolvedValue("not-json");

    await expect(getSshCredential("connection-3")).resolves.toBeNull();
  });

  it("removes the connection-scoped secure key", async () => {
    await deleteSshCredential("connection-4");

    expect(secureStorage.remove).toHaveBeenCalledWith("remoteSshCredential.connection-4");
  });
});
