import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownsampledThumb } from "./DownsampledThumb";

const downsampleLoadedImage = vi.hoisted(() =>
  vi.fn<(img: HTMLImageElement) => Promise<string | null>>(),
);

vi.mock("./imageThumbDownsample", () => ({
  downsampleLoadedImage,
}));

afterEach(() => {
  cleanup();
  downsampleLoadedImage.mockReset();
});

describe("DownsampledThumb", () => {
  it("paints the source immediately and keeps the original when downsampling is skipped", async () => {
    downsampleLoadedImage.mockResolvedValue(null);
    const { container } = render(
      <DownsampledThumb
        src="https://x.test/shot.png"
        alt="shot"
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
    const { container } = render(<DownsampledThumb src="https://x.test/shot.png" alt="shot" />);
    fireEvent.load(container.querySelector("img")!);
    await waitFor(() => {
      expect(container.querySelector("img")).toHaveAttribute("src", "blob:thumb");
    });
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
      <DownsampledThumb src="https://x.test/shot.png" alt="shot" />,
    );
    fireEvent.load(container.querySelector("img")!);
    unmount();
    finish("blob:late");
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:late"));
  });
});
