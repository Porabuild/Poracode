import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownsampledThumb } from "./DownsampledThumb";

const downsampleLoadedImage = vi.hoisted(() =>
  vi.fn<(img: HTMLImageElement, options?: unknown) => Promise<string | null>>(),
);

vi.mock("./imageThumbDownsample", () => ({
  downsampleLoadedImage,
}));

const originalDpr = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");

afterEach(() => {
  cleanup();
  downsampleLoadedImage.mockReset();
  vi.restoreAllMocks();
  if (originalDpr) {
    Object.defineProperty(window, "devicePixelRatio", originalDpr);
  }
});

describe("DownsampledThumb", () => {
  it("paints the source immediately and keeps the original when downsampling is skipped", async () => {
    downsampleLoadedImage.mockResolvedValue(null);
    const { container } = render(
      <DownsampledThumb
        src="https://x.test/shot.png"
        alt="shot"
        cssPx={96}
        className="size-full object-cover [image-rendering:high-quality]"
      />,
    );
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://x.test/shot.png");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).toHaveClass("[image-rendering:high-quality]");

    fireEvent.load(img);
    await waitFor(() => expect(downsampleLoadedImage).toHaveBeenCalledOnce());
    expect(img).toHaveAttribute("src", "https://x.test/shot.png");
  });

  it("swaps to the downsampled blob URL after load", async () => {
    downsampleLoadedImage.mockResolvedValue("blob:thumb");
    const { container } = render(
      <DownsampledThumb src="https://x.test/shot.png" alt="shot" cssPx={96} />,
    );
    fireEvent.load(container.querySelector("img")!);
    await waitFor(() => {
      expect(container.querySelector("img")).toHaveAttribute("src", "blob:thumb");
    });
  });

  it("loads a desktop local file as a host-resized thumbnail without page downsampling", () => {
    const { container } = render(
      <DownsampledThumb src="poracode-local://local/tmp/shot.png" alt="shot" cssPx={96} />,
    );
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "poracode-local://local/tmp/shot.png?thumb=96");
    fireEvent.load(img);
    expect(downsampleLoadedImage).not.toHaveBeenCalled();
  });

  it.each([1, 2])("requests a 2x host thumbnail for local contain tiles at DPR %i", (dpr) => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: dpr });
    const { container } = render(
      <DownsampledThumb
        src="poracode-local://local/tmp/shot.png"
        alt="shot"
        cssPx={160}
        fit="contain"
        resolutionScale={2}
      />,
    );
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute(
      "src",
      `poracode-local://local/tmp/shot.png?thumb=${160 * dpr * 2}`,
    );
    fireEvent.load(img);
    expect(downsampleLoadedImage).not.toHaveBeenCalled();
  });

  it("passes the declared fit and resolution options to the downsampler", async () => {
    downsampleLoadedImage.mockResolvedValue("blob:thumb");
    const { container } = render(
      <DownsampledThumb
        src="https://x.test/shot.png"
        alt="shot"
        cssPx={160}
        fit="contain"
        resolutionScale={2}
      />,
    );
    const img = container.querySelector("img")!;
    fireEvent.load(img);
    await waitFor(() => {
      expect(downsampleLoadedImage).toHaveBeenCalledWith(img, {
        fit: "contain",
        resolutionScale: 2,
      });
    });
    await waitFor(() => expect(img).toHaveAttribute("src", "blob:thumb"));
  });

  it("drops a thumbnail keyed to an older request when options change", async () => {
    downsampleLoadedImage.mockResolvedValue("blob:thumb-1");
    const { container, rerender } = render(
      <DownsampledThumb src="https://x.test/shot.png" alt="shot" cssPx={96} />,
    );
    const img = container.querySelector("img")!;
    fireEvent.load(img);
    await waitFor(() => expect(img).toHaveAttribute("src", "blob:thumb-1"));

    downsampleLoadedImage.mockResolvedValue("blob:thumb-2");
    rerender(
      <DownsampledThumb
        src="https://x.test/shot.png"
        alt="shot"
        cssPx={96}
        fit="contain"
        resolutionScale={2}
      />,
    );
    expect(img).toHaveAttribute("src", "https://x.test/shot.png");
    fireEvent.load(img);
    await waitFor(() => expect(img).toHaveAttribute("src", "blob:thumb-2"));
  });

  it.each([
    {
      name: "source",
      nextProps: { src: "https://x.test/other.png", alt: "shot", cssPx: 96 },
    },
    {
      name: "fit and resolution",
      nextProps: {
        src: "https://x.test/shot.png",
        alt: "shot",
        cssPx: 96,
        fit: "contain" as const,
        resolutionScale: 2,
      },
    },
  ])("revokes a late thumbnail when the $name changes mid-downsample", async ({ nextProps }) => {
    let finishLate!: (url: string | null) => void;
    downsampleLoadedImage
      .mockReturnValueOnce(
        new Promise<string | null>((resolve) => {
          finishLate = resolve;
        }),
      )
      .mockResolvedValueOnce("blob:current");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { container, rerender } = render(
      <DownsampledThumb src="https://x.test/shot.png" alt="shot" cssPx={96} />,
    );
    const img = container.querySelector("img")!;
    fireEvent.load(img);
    await waitFor(() => expect(downsampleLoadedImage).toHaveBeenCalledOnce());

    rerender(<DownsampledThumb {...nextProps} />);
    fireEvent.load(img);
    await waitFor(() => expect(img).toHaveAttribute("src", "blob:current"));

    finishLate("blob:late");
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:late"));
    expect(img).toHaveAttribute("src", "blob:current");
  });

  it("revokes a late thumbnail when the tile unmounts before downsample finishes", async () => {
    let finish!: (url: string | null) => void;
    downsampleLoadedImage.mockReturnValue(
      new Promise<string | null>((resolve) => {
        finish = resolve;
      }),
    );
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { container, unmount } = render(
      <DownsampledThumb src="https://x.test/shot.png" alt="shot" cssPx={96} />,
    );
    fireEvent.load(container.querySelector("img")!);
    unmount();
    finish("blob:late");
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:late"));
  });
});
