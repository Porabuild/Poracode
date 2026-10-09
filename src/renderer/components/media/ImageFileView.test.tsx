import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ImageFileView } from "./ImageFileView";
import { SvgFileView } from "./SvgFileView";

const openImageLightbox = vi.hoisted(() => vi.fn<(images: unknown[], index: number) => void>());

vi.mock("@/renderer/components/composer/ImageLightbox", () => ({ openImageLightbox }));

function loadImage(img: HTMLElement, width: number, height: number) {
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: width });
  Object.defineProperty(img, "naturalHeight", { configurable: true, value: height });
  fireEvent.load(img);
}

describe("ImageFileView", () => {
  it("shows the image with its dimensions and file size", () => {
    render(
      <ImageFileView
        src="poracode-local://local/repo/logo.png"
        fileName="logo.png"
        sizeBytes={2048}
        fallback={<p>fallback</p>}
      />,
    );

    expect(screen.getByText("2.0 KB")).toBeTruthy();
    loadImage(screen.getByAltText("logo.png"), 640, 480);
    expect(screen.getByText("640 × 480 · 2.0 KB")).toBeTruthy();
  });

  it("opens the image in the lightbox", () => {
    render(
      <ImageFileView
        src="poracode-local://local/repo/logo.png"
        fileName="logo.png"
        fallback={<p>fallback</p>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open image preview" }));

    expect(openImageLightbox).toHaveBeenCalledWith(
      [{ src: "poracode-local://local/repo/logo.png", alt: "logo.png", fileName: "logo.png" }],
      0,
    );
  });

  it("shows the fallback when the image fails to load", () => {
    render(
      <ImageFileView
        src="poracode-local://local/repo/movie.png"
        fileName="movie.png"
        fallback={<p>fallback</p>}
      />,
    );

    fireEvent.error(screen.getByAltText("movie.png"));

    expect(screen.getByText("fallback")).toBeTruthy();
    expect(screen.queryByAltText("movie.png")).toBeNull();
  });

  it("shows the fallback when there is no URL", () => {
    render(<ImageFileView src="" fileName="logo.png" fallback={<p>fallback</p>} />);

    expect(screen.getByText("fallback")).toBeTruthy();
  });
});

describe("SvgFileView", () => {
  it("renders the current SVG source as an image", () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>';
    render(<SvgFileView path="icons/dot.svg" content={source} />);

    expect(screen.getByAltText("dot.svg").getAttribute("src")).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`,
    );
    expect(screen.getByText(`${source.length} B`)).toBeTruthy();
  });

  it("explains when the SVG can't be rendered", () => {
    render(<SvgFileView path="broken.svg" content="<svg" />);

    fireEvent.error(screen.getByAltText("broken.svg"));

    expect(screen.getByText("This SVG can't be displayed.")).toBeTruthy();
  });
});
