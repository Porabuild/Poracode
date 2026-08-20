import { create } from "zustand";
import type { BrowserDownloadInfo } from "@/shared/ipc";

interface BrowserDownloadsState {
  downloads: BrowserDownloadInfo[];
  setDownloads: (downloads: BrowserDownloadInfo[]) => void;
  upsertDownload: (download: BrowserDownloadInfo) => void;
  removeDownload: (downloadId: string) => void;
}

export const useBrowserDownloadsStore = create<BrowserDownloadsState>((set) => ({
  downloads: [],
  setDownloads: (downloads) => set({ downloads }),
  upsertDownload: (download) =>
    set((state) => {
      const index = state.downloads.findIndex((candidate) => candidate.id === download.id);
      if (index < 0) {
        return {
          downloads: [...state.downloads, download].sort((a, b) => b.startTime - a.startTime),
        };
      }
      const downloads = [...state.downloads];
      downloads[index] = download;
      return { downloads };
    }),
  removeDownload: (downloadId) =>
    set((state) => ({
      downloads: state.downloads.filter((download) => download.id !== downloadId),
    })),
}));
