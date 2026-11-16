import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  readCommandOutputAsync: vi.fn<typeof import("../base").readCommandOutputAsync>(),
}));
vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  readCommandOutputAsync: mocks.readCommandOutputAsync,
}));

import { readCodexNativeMcpNames } from "./nativeMcp";

const servers: ResolvedMcpServer[] = [
  {
    id: "custom-admin",
    name: "custom-admin",
    timeoutMs: 30_000,
    transport: { type: "stdio", command: "node", args: [], env: {} },
  },
];

describe("Codex native MCP discovery", () => {
  beforeEach(() => mocks.readCommandOutputAsync.mockReset());

  it("asks the target account and project for effective names without connecting to servers", async () => {
    mocks.readCommandOutputAsync.mockResolvedValue({
      ok: true,
      stdout: JSON.stringify([
        { name: "custom-admin", enabled: true, transport: { url: "https://fixture.test/secret" } },
        { name: "disabled", enabled: false },
      ]),
      stderr: "",
    });
    const names = await readCodexNativeMcpNames(
      { kind: "posix", path: "/project" },
      servers,
      { CODEX_HOME: "/account" },
      "/bin/codex-fixture",
    );
    expect(names).toEqual(["custom-admin", "disabled"]);
    expect(mocks.readCommandOutputAsync).toHaveBeenCalledWith(
      "/bin/codex-fixture",
      ["mcp", "list", "--json"],
      { cwd: "/project", env: { CODEX_HOME: "/account" } },
    );
  });

  it("does not probe when no servers are injected", async () => {
    expect(await readCodexNativeMcpNames({ kind: "posix", path: "/project" }, [])).toEqual([]);
    expect(mocks.readCommandOutputAsync).not.toHaveBeenCalled();
  });

  it("ignores login-shell banners before the complete JSON document", async () => {
    mocks.readCommandOutputAsync.mockResolvedValue({
      ok: true,
      stdout: '[workspace loaded]\nWelcome from .zshrc\n[\n  {"name":"custom-admin"}\n]\n',
      stderr: "",
    });
    expect(await readCodexNativeMcpNames({ kind: "posix", path: "/project" }, servers)).toEqual([
      "custom-admin",
    ]);
  });

  it.each([
    { ok: false, stdout: "fixture-secret", stderr: "fixture-secret" },
    { ok: true, stdout: "invalid fixture-secret", stderr: "" },
    { ok: true, stdout: '{"name":"fixture-secret"}', stderr: "" },
    { ok: true, stdout: '[{"name":3}]', stderr: "" },
  ])("refuses failed or malformed discovery without exposing its output: %j", async (result) => {
    mocks.readCommandOutputAsync.mockResolvedValue(result);
    await expect(
      readCodexNativeMcpNames({ kind: "posix", path: "/project" }, servers),
    ).rejects.toThrow("Unable to read Codex MCP configuration before launch.");
  });
});
