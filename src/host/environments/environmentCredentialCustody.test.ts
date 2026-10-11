import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOpenSshCredentialResolver } from "./environmentCredentialCustody";
import { EnvironmentRuntimeError } from "./environmentRuntimeErrors";

const roots: string[] = [];

function homeFixture(): { readonly homeDir: string; readonly sshDir: string } {
  const homeDir = mkdtempSync(join(tmpdir(), "poracode-credential-test-"));
  roots.push(homeDir);
  const sshDir = join(homeDir, ".ssh");
  mkdirSync(sshDir, { recursive: true });
  return { homeDir, sshDir };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("host-local credential custody", () => {
  it("uses the system OpenSSH agent/config when no reference is configured", async () => {
    const resolver = createOpenSshCredentialResolver({ homeDir: homeFixture().homeDir });
    await expect(resolver.resolve(undefined)).resolves.toEqual({ kind: "system" });
    await expect(resolver.resolve("system")).resolves.toEqual({ kind: "system" });
  });

  it("resolves a file slot inside the host user's .ssh directory", async () => {
    const { homeDir, sshDir } = homeFixture();
    writeFileSync(join(sshDir, "work-key"), "private", { mode: 0o600 });
    const resolver = createOpenSshCredentialResolver({ homeDir });
    await expect(resolver.resolve("file:work-key")).resolves.toEqual({
      kind: "identity-file",
      identityFile: join(sshDir, "work-key"),
    });
  });

  it("fails closed with credential-missing for unknown schemes and traversal slots", async () => {
    const resolver = createOpenSshCredentialResolver({ homeDir: homeFixture().homeDir });
    for (const reference of [
      "file:missing",
      "file:../id_ed25519",
      "file:..",
      "file:",
      "vault:work",
      "file:.hidden",
      "file:a/b",
    ]) {
      await expect(resolver.resolve(reference)).rejects.toMatchObject({
        name: "EnvironmentRuntimeError",
        code: "environment/credential-missing",
      });
    }
  });

  it("never echoes the reference or the resolved path in the public error", async () => {
    const { homeDir } = homeFixture();
    const resolver = createOpenSshCredentialResolver({ homeDir });
    const error = await resolver.resolve("file:super-secret-name").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(EnvironmentRuntimeError);
    const runtimeError = error as EnvironmentRuntimeError;
    expect(runtimeError.message).not.toContain("super-secret-name");
    expect(runtimeError.message).not.toContain(homeDir);
    expect(runtimeError.toPublicError().message).not.toContain(homeDir);
  });

  it("refuses a directory slot", async () => {
    const { homeDir, sshDir } = homeFixture();
    mkdirSync(join(sshDir, "not-a-key"));
    const resolver = createOpenSshCredentialResolver({ homeDir });
    await expect(resolver.resolve("file:not-a-key")).rejects.toMatchObject({
      code: "environment/credential-missing",
    });
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "refuses an unreadable slot",
    async () => {
      const { homeDir, sshDir } = homeFixture();
      writeFileSync(join(sshDir, "unreadable"), "private", { mode: 0o000 });
      chmodSync(join(sshDir, "unreadable"), 0o000);
      const resolver = createOpenSshCredentialResolver({ homeDir });
      await expect(resolver.resolve("file:unreadable")).rejects.toMatchObject({
        code: "environment/credential-missing",
      });
    },
  );
});
