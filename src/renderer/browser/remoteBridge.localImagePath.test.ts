import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { toLocalFileUrl } from "@/shared/promptContent";
import { resolveRemoteBridgeLocalImagePath, setRemoteBridgeClient } from "./remoteBridge";

afterEach(() => {
  setRemoteBridgeClient(null);
  vi.restoreAllMocks();
});

describe("paired-host local image path decoder", () => {
  it.each([
    ["win32", "C:\\shots\\image%25.png", "C:/shots/image%25.png"],
    ["linux", "/C:/shots/image.png", "/C:/shots/image.png"],
    ["darwin", "/tmp/image%25.png", "/tmp/image%25.png"],
    [null, "C:\\shots\\image.png", "C:/shots/image.png"],
    [null, "\\\\server\\share\\image.png", "//server/share/image.png"],
  ] as const)(
    "keeps the existing %s decode without requesting bytes",
    (platform, path, expected) => {
      const client = new RemoteDesktopClient("https://decoder.test/", "access");
      const fetch = vi.spyOn(client, "fetchTicketedImageBytes");
      setRemoteBridgeClient(client, platform);
      expect(resolveRemoteBridgeLocalImagePath(toLocalFileUrl(path))).toBe(expected);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
