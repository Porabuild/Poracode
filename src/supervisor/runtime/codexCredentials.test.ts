import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wsl = vi.hoisted(() => ({
  readCodexAuthFromWsl: vi.fn<() => Promise<string | undefined>>(),
}));
vi.mock("./wslCredentials", () => wsl);
vi.mock("node:os", async (original) => {
  const actual = await original<typeof import("node:os")>();
  const { mkdtempSync: makeTemp } = await import("node:fs");
  const { join: joinPath } = await import("node:path");
  const home = makeTemp(joinPath(actual.tmpdir(), "codex-credentials-home-"));
  return { ...actual, homedir: () => home };
});

import { resolveCodexToken } from "./codexCredentials";

const originalPlatform = process.platform;

beforeEach(() => {
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  wsl.readCodexAuthFromWsl
    .mockReset()
    .mockResolvedValue(JSON.stringify({ tokens: { access_token: "wsl-host-token" } }));
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
});

describe("resolveCodexToken", () => {
  it("falls back to the WSL account for the default home on Windows", async () => {
    await expect(resolveCodexToken({})).resolves.toMatchObject({ accessToken: "wsl-host-token" });
  });

  it("reads a profile's token from its own CODEX_HOME", async () => {
    const home = mkdtempSync(join(tmpdir(), "codex-profile-credentials-"));
    writeFileSync(
      join(home, "auth.json"),
      JSON.stringify({ tokens: { access_token: "profile-token" } }),
    );
    await expect(resolveCodexToken({ CODEX_HOME: home })).resolves.toMatchObject({
      accessToken: "profile-token",
    });
  });

  it("never substitutes the WSL account for a signed-out profile", async () => {
    const home = mkdtempSync(join(tmpdir(), "codex-profile-signed-out-"));
    await expect(resolveCodexToken({ CODEX_HOME: home })).resolves.toBeUndefined();
    expect(wsl.readCodexAuthFromWsl).not.toHaveBeenCalled();
  });
});
