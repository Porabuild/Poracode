import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImageBytes, toClipboardPngBytes } from "./imageActions";

const readLocalImageFile = vi.fn<(payload: { url: string }) => Promise<Uint8Array>>();
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ readLocalImageFile }) }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it.each([new Uint8Array([0x89, 0x50, 0x4e, 0x47]), new Uint8Array([0xff, 0xd8, 0xff])])(
    "passes native clipboard formats through even without MIME metadata",
    async (bytes) => {
      readLocalImageFile.mockResolvedValue(bytes);
      expect(await toClipboardPngBytes({ src: "poracode-local:///sample" })).toEqual(bytes);
    },
  );

  it("converts local non-native formats and releases the temporary URL", async () => {
    const original = new Uint8Array([82, 73, 70, 70]);
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
    expect(
      await toClipboardPngBytes({ src: "poracode-local:///sample.webp", mime: "image/webp" }),
    ).toEqual(png);
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
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<{ ok: boolean; status: number }>>()
        .mockResolvedValue({ ok: false, status: 404 }),
    );
    await expect(fetchImageBytes("https://example.test/image.png")).rejects.toThrow("404");
  });
});
