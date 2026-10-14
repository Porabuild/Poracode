import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImageBytes, toClipboardPngBytes } from "./imageActions";

const readLocalImageFile = vi.fn<(payload: { url: string }) => Promise<Uint8Array>>();
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ readLocalImageFile }),
}));

const mainProcessFetch = vi.hoisted(() => vi.fn<(url: string) => Promise<Response>>());
vi.mock("@/renderer/state/remoteServers/mainProcessFetch", () => ({
  mainProcessFetch: (url: string) => mainProcessFetch(url),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mainProcessFetch.mockReset();
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

  it("reads desktop HTTP image bytes through the shared remote transport", async () => {
    const bytes = new Uint8Array([0, 0xff, 0x80, 42]);
    mainProcessFetch.mockResolvedValue(new Response(bytes, { status: 200 }));
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://desktop.test/api/files/image?path=original.webp&token=fixture";
    expect(await fetchImageBytes(url)).toEqual(bytes);
    expect(mainProcessFetch).toHaveBeenCalledWith(url);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsuccessful remote HTTP image responses", async () => {
    mainProcessFetch.mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(fetchImageBytes("https://desktop.test/image")).rejects.toThrow("403");
  });

  it("uses browser fetch for other sources", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchImageBytes("data:image/png;base64,AAAA")).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith("data:image/png;base64,AAAA");
    expect(mainProcessFetch).not.toHaveBeenCalled();
  });
});
