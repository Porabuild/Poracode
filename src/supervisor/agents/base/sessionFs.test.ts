import { afterEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { WslBridgeClient } from "../../wsl/bridge/client";
import { findSessionFiles, setSessionFsBridgeClient } from "./sessionFs";

const LOCATION: Extract<ProjectLocation, { kind: "wsl" }> = {
  kind: "wsl",
  distro: "Distro",
  linuxPath: "/home/u",
  uncPath: "\\\\wsl.localhost\\Distro\\home\\u",
};

const ROOT = "/home/u/.local/share/muse/sessions";

function locationFor(linuxPath: string): ProjectLocation {
  return { ...LOCATION, linuxPath };
}

describe("findSessionFiles (WSL bridge find/mtime contract)", () => {
  afterEach(() => {
    setSessionFsBridgeClient(undefined);
  });

  it("backfills mtime via stat for old-bridge entries without mtimeMs", async () => {
    const statCalls: string[][] = [];
    const client = {
      home: async () => ({ home: "/home/u" }),
      find: async (_loc: unknown, opts: Record<string, unknown>) => {
        expect(opts).toMatchObject({
          root: ROOT,
          maxEntries: 100,
          fileName: "session.jsonl",
          newestFirst: true,
        });
        return {
          entries: [
            { path: "2026/09/03/id/session.jsonl", name: "session.jsonl", type: "file" },
            { path: "2026/09/02/id/session.jsonl", name: "session.jsonl", type: "directory" },
          ],
          truncated: false,
        };
      },
      stat: async (_loc: unknown, paths: string[]) => {
        statCalls.push([...paths]);
        return { stats: paths.map((p) => ({ path: p, exists: true, mtimeMs: 1234 })) };
      },
    } as unknown as WslBridgeClient;
    setSessionFsBridgeClient(client);

    const files = await findSessionFiles(locationFor(ROOT), {
      root: ROOT,
      acceptFile: (name) => name === "session.jsonl",
      fileName: "session.jsonl",
      maxEntries: 100,
      newestFirst: true,
      includeMtime: true,
    });

    expect(statCalls).toEqual([[`${ROOT}/2026/09/03/id/session.jsonl`]]);
    expect(files).toEqual([
      { path: `${ROOT}/2026/09/03/id/session.jsonl`, name: "session.jsonl", mtimeMs: 1234 },
    ]);
  });

  it("skips the stat round-trip when the bridge returns mtimeMs", async () => {
    let statCalls = 0;
    const client = {
      home: async () => ({ home: "/home/u" }),
      find: async () => ({
        entries: [
          {
            path: "2026/09/03/id/session.jsonl",
            name: "session.jsonl",
            type: "file",
            mtimeMs: 888,
          },
        ],
        truncated: false,
      }),
      stat: async () => {
        statCalls += 1;
        return { stats: [] };
      },
    } as unknown as WslBridgeClient;
    setSessionFsBridgeClient(client);

    const files = await findSessionFiles(locationFor(ROOT), {
      root: ROOT,
      maxEntries: 100,
      includeMtime: true,
    });

    expect(statCalls).toBe(0);
    expect(files).toEqual([
      { path: `${ROOT}/2026/09/03/id/session.jsonl`, name: "session.jsonl", mtimeMs: 888 },
    ]);
  });
});
