import { createRef } from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { DiffBuildResult } from "../../diffBuildClient";
import { SingleFileDiff } from "./SingleFileDiff";

const mocks = vi.hoisted(() => ({
  getGitDiff: vi.fn<() => Promise<{ diff: string }>>(),
  build: vi.fn<() => Promise<DiffBuildResult[]>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ getGitDiff: mocks.getGitDiff }) }));
vi.mock("../../diffBuildClient", () => ({
  buildInWorker: mocks.build,
  extractDiffNames: () => ({ oldName: "file.ts", newName: "file.ts" }),
  getLang: () => "typescript",
  useDiffTheme: () => "dark",
}));
vi.mock("../../DiffAnnotationView", () => ({ DiffAnnotationView: () => null }));

describe("the selected file's first diff", () => {
  it("shows the first hunk while the full diff model is still building", async () => {
    const worker = Promise.withResolvers<DiffBuildResult[]>();
    mocks.build.mockReturnValueOnce(worker.promise);
    mocks.getGitDiff.mockResolvedValueOnce({
      diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old value\n+new value\n",
    });
    render(
      <SingleFileDiff
        project={{
          id: "project",
          name: "project",
          location: { kind: "posix", path: "/project" },
          createdAt: "2026-01-01T00:00:00.000Z",
        }}
        filePath="file.ts"
        staged={false}
        diffMode={1}
        refreshKey={0}
        containerRef={createRef<HTMLDivElement>()}
      />,
    );
    expect(await screen.findByLabelText("Preview")).toHaveTextContent("+new value");
    expect(mocks.build).toHaveBeenCalledOnce();
    worker.resolve([]);
    await screen.findByText("No changes to display");
    expect(screen.queryByLabelText("Preview")).toBeNull();
  });
});
