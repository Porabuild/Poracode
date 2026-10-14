import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAcpCanonicalHostFsPath } from "./sessionPaths";
import { makeConfigSyncSession } from "./sessionTestFixture";

vi.mock("./sessionPaths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sessionPaths")>()),
  assertAcpCanonicalHostFsPath: vi.fn<typeof import("./sessionPaths").assertAcpCanonicalHostFsPath>(
    async () => {},
  ),
}));

const cleanup: string[] = [];
afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.mocked(assertAcpCanonicalHostFsPath).mockReset();
});

describe("ACP text file request custody across canonical validation", () => {
  it.each(
    ["disposed", "closed", "reopened"].flatMap((retirement) =>
      ["read", "write"].map((access) => ({ retirement, access })),
    ),
  )(
    "does not serve $access after the owning session is $retirement while validation awaits",
    async ({ retirement, access }) => {
      const root = mkdtempSync(join(tmpdir(), "acp-fs-owner-"));
      cleanup.push(root);
      const primary = join(root, "primary");
      mkdirSync(primary);
      const file = join(primary, "marker.txt");
      writeFileSync(file, "unchanged");
      const { session } = makeConfigSyncSession();
      const internal = session as unknown as Record<string, unknown>;
      internal.projectLocation = {
        kind: process.platform === "win32" ? "windows" : "posix",
        path: primary,
      };
      internal.sessionGeneration = 1;
      let release!: () => void;
      vi.mocked(assertAcpCanonicalHostFsPath).mockReturnValueOnce(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );
      const handlers = session as unknown as {
        handleWriteTextFile(params: {
          sessionId: string;
          path: string;
          content: string;
        }): Promise<unknown>;
        handleReadTextFile(params: { sessionId: string; path: string }): Promise<unknown>;
      };
      const request =
        access === "write"
          ? handlers.handleWriteTextFile({
              sessionId: "session-1",
              path: file,
              content: "stale write",
            })
          : handlers.handleReadTextFile({ sessionId: "session-1", path: file });
      if (retirement === "disposed") internal.isDisposed = true;
      if (retirement === "closed") internal.transportClosed = true;
      if (retirement === "reopened") internal.sessionGeneration = 2;
      release();
      await expect(request).rejects.toMatchObject({ code: -32602 });
      expect(readFileSync(file, "utf8")).toBe("unchanged");
    },
  );
});
