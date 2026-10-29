import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FX_BACKENDS,
  FX_CONNECTIONS_PROBE_ENV,
  manageFxCredentials,
  parseFxConnectedProviders,
  readFxConnectedProviders,
} from "./credentials";

const base = vi.hoisted(() => ({
  readAgentCommandOutput: vi.fn<typeof import("../base").readAgentCommandOutput>(),
}));

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  ...base,
}));

vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => undefined }));

function statusJson(connected: string[]): string {
  return JSON.stringify({ kind: "status", connected_providers: connected });
}

describe("parseFxConnectedProviders", () => {
  it("maps known ids to backends in FX_BACKENDS order and ignores unknown ids", () => {
    expect(parseFxConnectedProviders(statusJson(["grok", "local", "vercel-ai-gateway"]))).toEqual([
      { id: "vercel", label: "Vercel AI Gateway" },
      { id: "grok", label: "Grok" },
    ]);
    expect(FX_BACKENDS.map((backend) => backend.slug)).toEqual(["vercel", "codex", "grok"]);
  });

  it("returns an empty list when only unknown ids are reported", () => {
    expect(parseFxConnectedProviders(statusJson(["local"]))).toEqual([]);
  });

  it("returns undefined without a valid status payload", () => {
    expect(parseFxConnectedProviders("not json")).toBeUndefined();
    expect(
      parseFxConnectedProviders(JSON.stringify({ kind: "models", connected_providers: [] })),
    ).toBeUndefined();
    expect(parseFxConnectedProviders(JSON.stringify({ kind: "status" }))).toBeUndefined();
    expect(
      parseFxConnectedProviders(JSON.stringify({ kind: "status", connected_providers: {} })),
    ).toBeUndefined();
  });
});

describe("readFxConnectedProviders", () => {
  beforeEach(() => {
    base.readAgentCommandOutput.mockReset();
  });

  it("pins the Codex provider and a placeholder model for the read-only status call", async () => {
    base.readAgentCommandOutput.mockResolvedValueOnce({
      ok: true,
      stdout: statusJson(["codex"]),
      stderr: "",
    });
    const providers = await readFxConnectedProviders({ kind: "posix", path: "/repo" }, "fx", {
      timeoutMs: 15_000,
      env: { FX_AUTO_UPGRADE: "0" },
    });
    expect(providers).toEqual([{ id: "codex", label: "Codex" }]);
    expect(base.readAgentCommandOutput).toHaveBeenCalledWith(
      { kind: "posix", path: "/repo" },
      "fx",
      ["status", "--json"],
      {
        timeoutMs: 15_000,
        env: { FX_AUTO_UPGRADE: "0", ...FX_CONNECTIONS_PROBE_ENV },
      },
    );
    expect(FX_CONNECTIONS_PROBE_ENV).toEqual({
      FX_PROVIDER: "codex",
      FX_MODEL: "poracode-status-probe",
    });
  });

  it("returns undefined when the status command fails", async () => {
    base.readAgentCommandOutput.mockResolvedValueOnce({ ok: false, stdout: "", stderr: "boom" });
    expect(
      await readFxConnectedProviders({ kind: "posix", path: "/repo" }, "fx", { timeoutMs: 1000 }),
    ).toBeUndefined();
  });
});

describe("manageFxCredentials", () => {
  beforeEach(() => {
    base.readAgentCommandOutput.mockReset();
  });

  it("lists the connected providers", async () => {
    base.readAgentCommandOutput.mockResolvedValueOnce({
      ok: true,
      stdout: statusJson(["codex", "grok"]),
      stderr: "",
    });

    await expect(manageFxCredentials({ env: { kind: "native" }, action: "list" })).resolves.toEqual(
      {
        providers: [
          { id: "codex", label: "Codex" },
          { id: "grok", label: "Grok" },
        ],
      },
    );
    expect(base.readAgentCommandOutput).toHaveBeenCalledOnce();
    expect(base.readAgentCommandOutput.mock.calls[0]?.[2]).toEqual(["status", "--json"]);
    expect(base.readAgentCommandOutput.mock.calls[0]?.[3]).toMatchObject({
      env: expect.objectContaining({
        FX_PROVIDER: "codex",
        FX_MODEL: "poracode-status-probe",
      }),
    });
  });

  it("runs the status call inside the requested WSL distro", async () => {
    base.readAgentCommandOutput.mockResolvedValueOnce({
      ok: true,
      stdout: statusJson([]),
      stderr: "",
    });

    await expect(
      manageFxCredentials({ env: { kind: "wsl", distro: "Ubuntu" }, action: "list" }),
    ).resolves.toEqual({ providers: [] });
    expect(base.readAgentCommandOutput.mock.calls[0]?.[0]).toMatchObject({
      kind: "wsl",
      distro: "Ubuntu",
    });
  });

  it("logs out of the requested backend, then re-lists the rest", async () => {
    base.readAgentCommandOutput
      .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ ok: true, stdout: statusJson(["codex"]), stderr: "" });

    await expect(
      manageFxCredentials({ env: { kind: "native" }, action: "remove", credentialId: "grok" }),
    ).resolves.toEqual({ providers: [{ id: "codex", label: "Codex" }] });

    expect(base.readAgentCommandOutput).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "fx",
      ["logout", "grok"],
      { timeoutMs: 30_000, env: { FX_AUTO_UPGRADE: "0" } },
    );
    expect(base.readAgentCommandOutput).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "fx",
      ["status", "--json"],
      expect.objectContaining({
        timeoutMs: 15_000,
        env: expect.objectContaining({ FX_AUTO_UPGRADE: "0" }),
      }),
    );
  });

  it("rejects an unknown backend without running anything", async () => {
    await expect(
      manageFxCredentials({ env: { kind: "native" }, action: "remove", credentialId: "nope" }),
    ).rejects.toThrow("Unknown fx sign-in backend: nope");
    expect(base.readAgentCommandOutput).not.toHaveBeenCalled();
  });

  it("surfaces the first non-empty stderr line from a failed logout", async () => {
    base.readAgentCommandOutput.mockResolvedValueOnce({
      ok: false,
      stdout: "",
      stderr: "\n  fx: not signed in  \nmore detail",
    });

    await expect(
      manageFxCredentials({ env: { kind: "native" }, action: "remove", credentialId: "grok" }),
    ).rejects.toThrow("fx: not signed in");
    expect(base.readAgentCommandOutput).toHaveBeenCalledOnce();
  });
});
