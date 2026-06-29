// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { GitActionSheet } from "./GitActionSheet";

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());

const bridge = vi.hoisted(() => ({
  gitRevert: vi.fn<() => Promise<void>>(),
  gitStage: vi.fn<() => Promise<void>>(),
  gitStageAll: vi.fn<() => Promise<void>>(),
  gitUnstage: vi.fn<() => Promise<void>>(),
  gitUnstageAll: vi.fn<() => Promise<void>>(),
  gitRevertAll: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@heroui/react")>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      danger: toastDanger,
    },
  };
});

describe("GitActionSheet", () => {
  beforeEach(() => {
    toastDanger.mockClear();
    bridge.gitRevert.mockReset();
    bridge.gitStage.mockReset();
    bridge.gitStageAll.mockReset();
    bridge.gitUnstage.mockReset();
    bridge.gitUnstageAll.mockReset();
    bridge.gitRevertAll.mockReset();
    bridge.gitRevert.mockResolvedValue(undefined);
    bridge.gitStage.mockResolvedValue(undefined);
    bridge.gitStageAll.mockResolvedValue(undefined);
    bridge.gitUnstage.mockResolvedValue(undefined);
    bridge.gitUnstageAll.mockResolvedValue(undefined);
    bridge.gitRevertAll.mockResolvedValue(undefined);
  });

  it("opens a changed file in the mobile editor when requested", () => {
    const onOpenFile = vi.fn<(path: string) => void>();
    const onClose = vi.fn<() => void>();

    render(
      <GitActionSheet
        target={{
          kind: "file",
          file: {
            path: "src/app.ts",
            staged: false,
            status: "M",
            insertions: 4,
            deletions: 1,
          },
        }}
        effectiveLocation={{ kind: "posix", path: "/repo" }}
        storeKey="project-1"
        isWorktree={false}
        onViewDiff={() => undefined}
        onOpenFile={onOpenFile}
        onRefetch={() => Promise.resolve()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));

    expect(onOpenFile).toHaveBeenCalledWith("src/app.ts");
    expect(onClose).toHaveBeenCalled();
  });

  it("reports failed destructive git actions before closing the sheet", async () => {
    bridge.gitRevert.mockRejectedValue(new Error("Discard failed"));
    const onRefetch = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const onClose = vi.fn<() => void>();

    render(
      <GitActionSheet
        target={{
          kind: "file",
          file: {
            path: "src/app.ts",
            staged: false,
            status: "M",
            insertions: 4,
            deletions: 1,
          },
        }}
        effectiveLocation={{ kind: "posix", path: "/repo" }}
        storeKey="project-1"
        isWorktree={false}
        onViewDiff={() => undefined}
        onRefetch={onRefetch}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => {
      expect(toastDanger).toHaveBeenCalledWith("Discard failed");
    });
    expect(onRefetch).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
