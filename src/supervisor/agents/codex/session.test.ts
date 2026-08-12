import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionFs = vi.hoisted(() => ({
  findSessionFiles:
    vi.fn<
      (
        location: unknown,
        options: { includeMtime?: boolean },
      ) => Promise<Array<{ name: string; path: string; mtimeMs?: number }>>
    >(),
  resolveWslHomeDirectoryAsync: vi.fn<() => Promise<string>>(async () => "/home/tester"),
}));

vi.mock("../base", () => ({
  findSessionFiles: sessionFs.findSessionFiles,
  getCachedWslHomeDirectory: () => undefined,
  readSessionFilePrefixText: vi.fn<() => Promise<string | undefined>>(),
  readSessionFileText: vi.fn<() => Promise<string | undefined>>(),
  resolveWslHomeDirectoryAsync: sessionFs.resolveWslHomeDirectoryAsync,
}));

import { readCodexRolloutsForLocationAsync } from "./session";

describe("async Codex rollout discovery", () => {
  beforeEach(() => {
    sessionFs.findSessionFiles.mockReset();
  });

  it("retains WSL mtimes so post-spawn discovery can reject old rollouts", async () => {
    sessionFs.findSessionFiles
      .mockResolvedValueOnce([
        {
          name: "rollout-old.jsonl",
          path: "/home/tester/.codex/sessions/rollout-2026-01-01T00-00-00-019d6013-90cc-7c60-91d2-f435c03dfd76.jsonl",
          mtimeMs: 100,
        },
        {
          name: "rollout-new.jsonl",
          path: "/home/tester/.codex/sessions/rollout-2026-01-01T00-00-01-019d6099-45a3-7962-a595-2d7f59276118.jsonl",
          mtimeMs: 200,
        },
      ])
      .mockResolvedValueOnce([]);

    const rollouts = await readCodexRolloutsForLocationAsync({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/work/project",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\work\\project",
    });

    expect(sessionFs.findSessionFiles).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "wsl" }),
      expect.objectContaining({ includeMtime: true }),
    );
    expect(rollouts.map(({ id, updatedAt }) => ({ id, updatedAt }))).toEqual([
      { id: "019d6013-90cc-7c60-91d2-f435c03dfd76", updatedAt: 100 },
      { id: "019d6099-45a3-7962-a595-2d7f59276118", updatedAt: 200 },
    ]);
  });

  it("retains native mtimes so concurrent rollout discovery can select the newest session", async () => {
    sessionFs.findSessionFiles
      .mockResolvedValueOnce([
        {
          name: "rollout-old.jsonl",
          path: "C:\\Users\\tester\\.codex\\sessions\\rollout-2026-01-01T00-00-00-019d6013-90cc-7c60-91d2-f435c03dfd76.jsonl",
          mtimeMs: 100,
        },
      ])
      .mockResolvedValueOnce([
        {
          name: "rollout-new.jsonl",
          path: "C:\\private\\sessions\\rollout-2026-01-01T00-00-01-019d6099-45a3-7962-a595-2d7f59276118.jsonl",
          mtimeMs: 200,
        },
      ]);

    const rollouts = await readCodexRolloutsForLocationAsync({
      kind: "windows",
      path: "C:\\work\\project",
    });

    expect(sessionFs.findSessionFiles).toHaveBeenCalledTimes(2);
    for (const [, options] of sessionFs.findSessionFiles.mock.calls) {
      expect(options).toMatchObject({ includeMtime: true });
    }
    expect(rollouts.map(({ id, updatedAt }) => ({ id, updatedAt }))).toEqual([
      { id: "019d6013-90cc-7c60-91d2-f435c03dfd76", updatedAt: 100 },
      { id: "019d6099-45a3-7962-a595-2d7f59276118", updatedAt: 200 },
    ]);
  });
});
