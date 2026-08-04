import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { AttachmentBar } from "./AttachmentBar";
import type { Attachment } from "./useAttachments";

describe("AttachmentBar", () => {
  it("renders image attachments as labeled inset chips by default", () => {
    const onPreviewImage = vi.fn<(attachment: Attachment) => void>();
    const { container } = render(
      <AttachmentBar
        attachments={[
          {
            id: "image-1",
            path: "/tmp/screenshot.png",
            name: "screenshot.png",
            mimeType: "image/png",
            isImage: true,
          },
        ]}
        onPreviewImage={onPreviewImage}
      />,
    );

    expect(container.firstElementChild).toHaveClass(
      "poracode-attachment-bar",
      "poracode-attachment-bar--inset",
    );
    expect(screen.getByAltText("screenshot.png").getAttribute("loading")).toBeNull();
    expect(screen.getByText("screenshot.png")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(onPreviewImage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "image-1",
        path: "/tmp/screenshot.png",
      }),
    );
  });

  it("renders eager fixed-size image previews for inline message attachments", () => {
    render(
      <AttachmentBar
        attachments={[
          {
            id: "image-1",
            path: "/tmp/screenshot.png",
            name: "screenshot.png",
            mimeType: "image/png",
            isImage: true,
          },
        ]}
        imagesAsPreview
      />,
    );

    expect(screen.getByAltText("screenshot.png").getAttribute("loading")).toBeNull();
  });

  it("uses the owning remote machine URL for remote attachment previews", () => {
    const imageUrlForPath = vi.fn<(path: string) => string>(
      (path: string) => `https://mac.test/api/files/image?path=${encodeURIComponent(path)}`,
    );
    render(
      <AttachmentBar
        attachments={[
          {
            id: "image-1",
            path: "/Users/host/.poracode/attachments/shot.png",
            name: "shot.png",
            mimeType: "image/png",
            isImage: true,
          },
        ]}
        imagesAsPreview
        imageUrlForPath={imageUrlForPath}
      />,
    );

    expect(screen.getByAltText("shot.png")).toHaveAttribute(
      "src",
      "https://mac.test/api/files/image?path=%2FUsers%2Fhost%2F.poracode%2Fattachments%2Fshot.png",
    );
    expect(imageUrlForPath).toHaveBeenCalledWith("/Users/host/.poracode/attachments/shot.png");
  });

  it("renders flush attachment bars for inline message attachments", () => {
    const { container } = render(
      <AttachmentBar
        attachments={[
          {
            id: "file-1",
            path: "/tmp/notes.md",
            name: "notes.md",
            isImage: false,
          },
        ]}
        layout="flush"
      />,
    );

    expect(container.firstElementChild).toHaveClass("poracode-attachment-bar");
    expect(container.firstElementChild).not.toHaveClass("poracode-attachment-bar--inset");
  });

  it("opens PDF attachments in the preview", () => {
    const onPreviewPdf = vi.fn<(attachment: Attachment) => void>();
    render(
      <AttachmentBar
        attachments={[
          {
            id: "pdf-1",
            path: "C:\\tmp\\document.pdf",
            name: "document.pdf",
            mimeType: "application/pdf",
            isImage: false,
          },
        ]}
        onPreviewPdf={onPreviewPdf}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview document.pdf" }));
    expect(onPreviewPdf).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pdf-1", path: "C:\\tmp\\document.pdf" }),
    );
  });

  it("renders the CSS selector instead of the file name on picked attachments", () => {
    render(
      <AttachmentBar
        attachments={[
          {
            id: "image-1",
            path: "/tmp/selection.png",
            name: "selection.png",
            mimeType: "image/png",
            isImage: true,
            selector: "svg.lnXdpd > path",
            sourceUrl: "https://www.google.com/",
          },
        ]}
      />,
    );

    const label = screen.getByText("svg.lnXdpd > path");
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass("poracode-attachment-chip__selector");
    expect(label).toHaveAttribute("title", "svg.lnXdpd > path\nhttps://www.google.com/");
    expect(screen.queryByText("selection.png")).not.toBeInTheDocument();
  });
});
