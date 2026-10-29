import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { FX_BASE_SPAWN_ENV } from "./detection";
import {
  discoverFxSessionRef,
  listFxSessions,
  parseFxSessionsJson,
  pickFxDiscoveredSessionId,
  resolveFxSessionsWatchPaths,
  snapshotFxPreSpawnSessions,
} from "./sessions";

const base = vi.hoisted(() => ({
  getCachedWslHomeDirectory: vi.fn<(distro: string) => string | undefined>(),
  readAgentCommandOutput: vi.fn<typeof import("../base").readAgentCommandOutput>(),
}));

vi.mock("../base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../base")>()),
  ...base,
}));

vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => undefined }));

describe("parseFxSessionsJson", () => {
  it("parses the sessions payload", () => {
    const stdout = JSON.stringify({
      kind: "sessions",
      count: 2,
      sessions: [
        {
          id: "iHHa9odhGUbU",
          title: "Untitled session",
          workspace_root: "/private/tmp/p",
          created_at_ms: 1793228043107,
          updated_at_ms: 1793228049118,
        },
        { id: "other", created_at_ms: 1793228040000 },
      ],
    });
    expect(parseFxSessionsJson(stdout)).toEqual([
      { id: "iHHa9odhGUbU", createdAtMs: 1793228043107 },
      { id: "other", createdAtMs: 1793228040000 },
    ]);
  });

  it("skips entries without a string id and defaults a missing timestamp", () => {
    const stdout = JSON.stringify({
      kind: "sessions",
      sessions: [{ id: 42 }, { title: "no id" }, { id: "ok" }],
    });
    expect(parseFxSessionsJson(stdout)).toEqual([{ id: "ok", createdAtMs: 0 }]);
  });

  it("returns undefined for invalid or unexpected payloads", () => {
    expect(parseFxSessionsJson("not json")).toBeUndefined();
    expect(parseFxSessionsJson(JSON.stringify({ kind: "sessions" }))).toBeUndefined();
    expect(parseFxSessionsJson(JSON.stringify({ kind: "status", sessions: [] }))).toBeUndefined();
  });
});

describe("pickFxDiscoveredSessionId", () => {
  const takenAtMs = 1_793_228_043_000;

  it("picks the newest session absent from the snapshot", () => {
    expect(
      pickFxDiscoveredSessionId(
        [
          { id: "old", createdAtMs: takenAtMs - 60_000 },
          { id: "new", createdAtMs: takenAtMs + 500 },
          { id: "newer", createdAtMs: takenAtMs + 1_000 },
        ],
        new Set(["old"]),
        takenAtMs,
      ),
    ).toBe("newer");
  });

  it("ignores sessions in the snapshot and stale timestamps", () => {
    expect(
      pickFxDiscoveredSessionId(
        [
          { id: "snapshot", createdAtMs: takenAtMs + 5_000 },
          { id: "stale", createdAtMs: takenAtMs - 5_001 },
        ],
        new Set(["snapshot"]),
        takenAtMs,
      ),
    ).toBeUndefined();
  });

  it("accepts a session created up to 5s before the snapshot", () => {
    expect(
      pickFxDiscoveredSessionId(
        [{ id: "edge", createdAtMs: takenAtMs - 5_000 }],
        new Set(),
        takenAtMs,
      ),
    ).toBe("edge");
  });
});

describe("fx sessions under WSL", () => {
  const wsl: ProjectLocation = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/home/dev/app",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\dev\\app",
  };
  const sessionsOutput = (ids: string[]) => ({
    ok: true,
    stdout: JSON.stringify({
      kind: "sessions",
      sessions: ids.map((id) => ({ id, created_at_ms: Date.now() })),
    }),
    stderr: "",
  });

  beforeEach(() => {
    base.getCachedWslHomeDirectory.mockReset();
    base.readAgentCommandOutput.mockReset();
  });

  it("watches the distro's fx store, or nothing while its home is unknown", () => {
    base.getCachedWslHomeDirectory.mockReturnValue("/home/dev");
    expect(resolveFxSessionsWatchPaths(wsl)).toEqual([
      "/home/dev/.fx/sessions/v2",
      "/home/dev/.fx",
    ]);
    expect(base.getCachedWslHomeDirectory).toHaveBeenCalledWith("Ubuntu");

    base.getCachedWslHomeDirectory.mockReturnValue(undefined);
    expect(resolveFxSessionsWatchPaths(wsl)).toBeUndefined();
  });

  it("lists sessions inside the distro without a host working directory", async () => {
    base.readAgentCommandOutput.mockResolvedValue(sessionsOutput(["a"]));
    await expect(listFxSessions(wsl)).resolves.toEqual([
      { id: "a", createdAtMs: expect.any(Number) },
    ]);
    const [location, binary, args, options] = base.readAgentCommandOutput.mock.calls[0]!;
    expect(location).toBe(wsl);
    expect(binary).toBe("fx");
    expect(args).toEqual(["sessions", "--json", "--limit", "100"]);
    expect(options).toEqual({ timeoutMs: 5_000, env: FX_BASE_SPAWN_ENV });
    expect(options).not.toHaveProperty("posixCwd");
  });

  it("keys pre-spawn snapshots by distro and Linux path", async () => {
    base.readAgentCommandOutput.mockResolvedValueOnce(sessionsOutput(["before"]));
    await snapshotFxPreSpawnSessions(wsl);

    base.readAgentCommandOutput.mockResolvedValue(sessionsOutput(["before", "created"]));
    await expect(discoverFxSessionRef(wsl)).resolves.toMatchObject({
      providerSessionId: "created",
    });
    await expect(discoverFxSessionRef({ ...wsl, distro: "Debian" })).resolves.toBeUndefined();
  });
});
