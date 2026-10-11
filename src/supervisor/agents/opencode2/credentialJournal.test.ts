import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openOpenCode2CredentialJournal,
  parseOpenCode2CredentialJournal,
} from "./credentialJournal";

const mocks = vi.hoisted(() => ({
  output: vi.fn<typeof import("../base").readAgentCommandOutput>(),
  readWsl: vi.fn<typeof import("../plugin/wslStaging").readWslTextFile>(),
  writeWsl: vi.fn<typeof import("../plugin/wslStaging").writeWslTextFile>(),
}));
vi.mock("./binary", () => ({
  resolveOpenCode2Binary: vi.fn<() => Promise<string>>().mockResolvedValue("fixture-cli"),
}));
vi.mock("../base", () => ({ readAgentCommandOutput: mocks.output }));
vi.mock("../plugin/wslStaging", () => ({
  readWslTextFile: mocks.readWsl,
  writeWslTextFile: mocks.writeWsl,
}));
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("OpenCode credential journal v1", () => {
  it("starts an unversioned pre-upgrade profile and refuses future or malformed state", () => {
    expect(parseOpenCode2CredentialJournal(null)).toEqual({ version: 1, credentials: {} });
    for (const value of [
      { version: 2, credentials: {} },
      { version: 1, credentials: { id: "unknown" } },
      { version: 1, credentials: [] },
    ]) {
      expect(() => parseOpenCode2CredentialJournal(JSON.stringify(value))).toThrow("sign-in data");
    }
    const journal = parseOpenCode2CredentialJournal(
      '{"version":1,"credentials":{"__proto__":"revoked"}}',
    );
    expect(Object.getPrototypeOf(journal.credentials)).toBeNull();
    expect(journal.credentials["__proto__"]).toBe("revoked");
  });

  it("atomically persists only status/IDs and serializes two profile stores sharing upstream data", async () => {
    await mkdir(join(process.cwd(), "tmp"), { recursive: true });
    const root = await mkdtemp(join(process.cwd(), "tmp/credential-journal-"));
    roots.push(root);
    mocks.output.mockResolvedValue({ ok: true, stdout: root, stderr: "" });
    const location = { kind: "posix" as const, path: "/fixture" };
    const first = await openOpenCode2CredentialJournal(location);
    const second = await openOpenCode2CredentialJournal(location);
    const releaseFirst = await first.lock();
    let releasedFirst = false;
    let releaseSecond: (() => Promise<void>) | undefined;
    try {
      let acquiredSecond = false;
      const waiting = second.lock().then((release) => {
        acquiredSecond = true;
        return release;
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(acquiredSecond).toBe(false);
      await first.write({ version: 1, credentials: { fixture: "pending-revoke" } });
      await releaseFirst();
      releasedFirst = true;
      releaseSecond = await waiting;
      expect(await second.read()).toEqual({
        version: 1,
        credentials: { fixture: "pending-revoke" },
      });
      await second.write({ version: 1, credentials: { fixture: "revoked" } });
      expect(await first.read()).toEqual({ version: 1, credentials: { fixture: "revoked" } });
    } finally {
      if (!releasedFirst) await releaseFirst();
      await releaseSecond?.();
    }
  });

  it("uses the upstream WSL data path and existing atomic staging IO", async () => {
    mocks.output.mockResolvedValue({ ok: true, stdout: "/xdg-data/opencode\n", stderr: "" });
    mocks.readWsl.mockResolvedValue(null);
    const store = await openOpenCode2CredentialJournal({
      kind: "wsl",
      distro: "Fixture",
      linuxPath: "/project",
      uncPath: "\\\\wsl.localhost\\Fixture\\project",
    });
    const journal = await store.read();
    await store.write(journal);
    expect(mocks.readWsl).toHaveBeenCalledWith(
      "Fixture",
      "/xdg-data/opencode/poracode-credential-compatibility-v1.json",
    );
    expect(mocks.writeWsl).toHaveBeenCalledWith(
      "Fixture",
      "/xdg-data/opencode/poracode-credential-compatibility-v1.json",
      expect.any(String),
      { mode: 0o600 },
    );
  });
});
