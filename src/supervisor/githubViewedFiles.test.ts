import { describe, expect, it, vi } from "vitest";
import { getGitHubViewedFiles, setGitHubFileViewed } from "./githubViewedFiles";

const page = (files: Record<string, string>) =>
  JSON.stringify({
    id: "PR_node",
    files: Object.entries(files).map(([path, viewerViewedState]) => ({ path, viewerViewedState })),
  });

describe("GitHub native viewed marks", () => {
  it("reads every page and keeps dismissed files distinct from unread files", async () => {
    const run = vi
      .fn<(args: string[]) => Promise<string>>()
      .mockResolvedValue(
        `${page({ "first.ts": "VIEWED" })}\n${page({ "last.ts": "DISMISSED", "new.ts": "UNVIEWED" })}\n`,
      );
    expect(await getGitHubViewedFiles(run, 7)).toEqual({
      "first.ts": "VIEWED",
      "last.ts": "DISMISSED",
      "new.ts": "UNVIEWED",
    });
    expect(run).toHaveBeenCalledWith(
      expect.arrayContaining(["--paginate", "owner={owner}", "name={repo}", "number=7"]),
    );
  });

  it.each([true, false])(
    "changes a mark only for a file in this review and reads the authoritative result (%s)",
    async (viewed) => {
      const path = "file with $shell and quotes'.ts";
      const run = vi
        .fn<(args: string[]) => Promise<string>>()
        .mockResolvedValueOnce(page({ [path]: "UNVIEWED" }))
        .mockResolvedValueOnce("{}")
        .mockResolvedValueOnce(page({ [path]: viewed ? "VIEWED" : "UNVIEWED" }));
      expect(await setGitHubFileViewed(run, 7, path, viewed)).toEqual({
        [path]: viewed ? "VIEWED" : "UNVIEWED",
      });
      const args = run.mock.calls[1]![0] as string[];
      expect(args).toContain(`path=${path}`);
      expect(args).toContain("id=PR_node");
      expect(args.find((arg) => arg.startsWith("query="))).toContain(
        viewed ? "markFileAsViewed(input:" : "unmarkFileAsViewed(input:",
      );
    },
  );

  it("refuses an unknown file or a failed read without a mutation or alternate-account retry", async () => {
    const run = vi
      .fn<(args: string[]) => Promise<string>>()
      .mockResolvedValue(page({ "known.ts": "VIEWED" }));
    await expect(setGitHubFileViewed(run, 7, "other.ts", true)).rejects.toThrow("invalid");
    expect(run).toHaveBeenCalledTimes(1);
    run.mockReset().mockRejectedValue(new Error("authentication failed"));
    await expect(setGitHubFileViewed(run, 7, "known.ts", true)).rejects.toThrow(
      "authentication failed",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
});
