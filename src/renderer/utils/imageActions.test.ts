import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImageBytes, toClipboardPngBytes } from "./imageActions";
import { isRemoteSession } from "@/renderer/bridge";
import type {
  RemoteHttpRequestPayload,
  RemoteHttpRequestResult,
} from "@/shared/ipc/procedures/app";

const readLocalImageFile = vi.fn<(payload: { url: string }) => Promise<Uint8Array>>();
const remoteHttpRequest =
  vi.fn<(payload: RemoteHttpRequestPayload) => Promise<RemoteHttpRequestResult>>();
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ readLocalImageFile, remoteHttpRequest }),
  isRemoteSession: vi.fn<() => boolean>(() => false),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(isRemoteSession).mockReturnValue(false);
});

describe("image action bytes", () => {
  it.each(["poracode", "lightcode"])(
    "reads %s-local originals through the bridge",
    async (scheme) => {
      const bytes = new Uint8Array([1, 2, 3]);
      readLocalImageFile.mockResolvedValue(bytes);
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);
      expect(await fetchImageBytes(`${scheme}-local:///sample.webp`)).toEqual(bytes);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("passes PNG through even without MIME metadata", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    readLocalImageFile.mockResolvedValue(bytes);
    expect(await toClipboardPngBytes({ src: "poracode-local:///sample" })).toEqual(bytes);
  });

  it.each([
    { mime: "image/webp", original: new Uint8Array([82, 73, 70, 70]) },
    { mime: "image/jpeg", original: new Uint8Array([0xff, 0xd8, 0xff]) },
  ])("converts $mime to PNG for desktop and browser clipboards", async ({ mime, original }) => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    readLocalImageFile.mockResolvedValue(original);
    const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue("blob:test");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        naturalWidth = 640;
        naturalHeight = 480;
        decode = async () => {};
      },
    );
    const drawImage = vi.fn<(image: CanvasImageSource, x: number, y: number) => void>();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback({ arrayBuffer: async () => png.buffer } as Blob);
    });
    expect(await toClipboardPngBytes({ src: "poracode-local:///sample", mime })).toEqual(png);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(await fetchImageBytes("poracode-local:///sample.webp")).toEqual(original);
  });

  it("does not silently copy undecodable data", async () => {
    readLocalImageFile.mockResolvedValue(new Uint8Array([1]));
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:bad", revokeObjectURL });
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode = async () => {
          throw new Error("decode failed");
        };
      },
    );
    await expect(toClipboardPngBytes({ src: "poracode-local:///bad.gif" })).rejects.toThrow(
      "decode failed",
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:bad");
  });

  it("rejects failed remote responses", async () => {
    vi.mocked(isRemoteSession).mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<{ ok: boolean; status: number }>>()
        .mockResolvedValue({ ok: false, status: 404 }),
    );
    await expect(fetchImageBytes("https://example.test/image.png")).rejects.toThrow("404");
  });

  it("reads desktop HTTP image bytes through main without renderer CORS", async () => {
    const bytes = new Uint8Array([0, 0xff, 0x80, 42]);
    remoteHttpRequest.mockResolvedValue({
      status: 200,
      headers: {},
      body: btoa(String.fromCharCode(...bytes)),
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://desktop.test/api/files/image?path=original.webp&token=fixture";
    expect(await fetchImageBytes(url)).toEqual(bytes);
    expect(remoteHttpRequest).toHaveBeenCalledWith({ url, responseEncoding: "base64" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsuccessful main-process HTTP responses", async () => {
    remoteHttpRequest.mockResolvedValue({ status: 403, headers: {}, body: "" });
    await expect(fetchImageBytes("https://desktop.test/image")).rejects.toThrow("403");
  });

  it("uses browser fetch for PWA image bytes", async () => {
    vi.mocked(isRemoteSession).mockReturnValue(true);
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchImageBytes("https://desktop.test/image")).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith("https://desktop.test/image");
  });
});
