import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserDownloadsStore } from "@/renderer/state/browserDownloadsStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { BrowserDownloadInfo } from "@/shared/ipc";
import { BrowserDownloadsPage } from "./BrowserDownloadsPage";

type DownloadActionPayload = {
  id: string;
  action: "pause" | "resume" | "cancel" | "remove" | "open" | "show-in-folder";
};

const bridge = vi.hoisted(() => ({
  browserGetDownloads: vi.fn<() => Promise<BrowserDownloadInfo[]>>(),
  browserDownloadAction: vi.fn<(payload: DownloadActionPayload) => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const download: BrowserDownloadInfo = {
  id: "download-1",
  filename: "archive.zip",
  url: "https://example.com/archive.zip",
  mimeType: "application/zip",
  state: "progressing",
  receivedBytes: 50,
  totalBytes: 100,
  startTime: 1,
  canResume: true,
};

describe("BrowserDownloadsPage", () => {
  beforeEach(() => {
    bridge.browserGetDownloads.mockReset().mockResolvedValue([]);
    bridge.browserDownloadAction.mockReset().mockResolvedValue(undefined);
    useBrowserDownloadsStore.setState({ downloads: [] });
  });

  it("shows the empty download history", async () => {
    render(<BrowserDownloadsPage />);

    expect(screen.getByText("Files you download appear here")).toBeInTheDocument();
    await waitFor(() => expect(bridge.browserGetDownloads).toHaveBeenCalledOnce());
  });

  it("renders an active download and pauses it", async () => {
    bridge.browserGetDownloads.mockResolvedValueOnce([download]);
    render(<BrowserDownloadsPage />);

    expect(await screen.findByText("archive.zip")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause download" }));

    await waitFor(() =>
      expect(bridge.browserDownloadAction).toHaveBeenCalledWith({
        id: "download-1",
        action: "pause",
      }),
    );
    act(() => useBrowserDownloadsStore.getState().setDownloads([{ ...download, state: "paused" }]));
    expect(await screen.findByText("Paused")).toBeInTheDocument();
  });

  it("does not animate an unknown-size download after it is paused", async () => {
    bridge.browserGetDownloads.mockResolvedValue([
      { ...download, state: "paused", receivedBytes: 10, totalBytes: 0 },
    ]);
    render(<BrowserDownloadsPage />);

    const progress = await screen.findByRole("progressbar", { name: "Download progress" });

    expect(progress.firstElementChild).not.toHaveClass("animate-pulse");
    expect(progress.firstElementChild).toHaveClass("w-0");
  });
});
