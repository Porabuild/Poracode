import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { localImageThumbUrl } from "@/shared/localImageThumb";
import { toLocalFileUrl } from "@/shared/promptContent";
import { AttachmentBar } from "./AttachmentBar";
import type { Attachment } from "./useAttachments";

const downsampleLoadedImage = vi.hoisted(() =>
  vi.fn<(img: HTMLImageElement) => Promise<string | null>>(),
);

vi.mock("@/renderer/components/thread/imageThumbDownsample", () => ({
  downsampleLoadedImage,
}));

afterEach(() => {
  downsampleLoadedImage.mockReset();
});

describe("AttachmentBar", () => {
  it("loads an own-host image as a host-resized thumbnail without page downsampling", () => {
    render(
      <AttachmentBar
        attachments={[{ id: "image", path: "/tmp/shot.png", name: "shot.png", isImage: true }]}
        imagesAsPreview
      />,
    );
    const img = screen.getByAltText("shot.png");
    expect(img).toHaveAttribute("src", localImageThumbUrl(toLocalFileUrl("/tmp/shot.png"), 32));
    fireEvent.load(img);
    expect(downsampleLoadedImage).not.toHaveBeenCalled();
  });

  it("paints a downsampled thumbnail on the same image node once the source loads", async () => {
    let url = "blob:full-1";
    let notify = () => {};
    const readiness = {
      resolvePath: () => url,
      subscribePath: (_path: string, listener: () => void) => {
        notify = listener;
        return () => {};
      },
      requestPath: vi.fn<(path: string) => void>(),
      resolveRef: () => "",
      subscribeRef: () => () => {},
      requestRef: () => {},
    };
    downsampleLoadedImage.mockResolvedValueOnce("blob:thumb-1");
    render(
      <AttachmentBar
        attachments={[{ id: "image", path: "/tmp/shot.png", name: "shot.png", isImage: true }]}
        imagesAsPreview
        remoteImageReadiness={readiness}
      />,
    );
    const img = screen.getByAltText("shot.png");
    expect(img).toHaveAttribute("src", "blob:full-1");

    fireEvent.load(img);
    await waitFor(() => expect(img).toHaveAttribute("src", "blob:thumb-1"));
    // The thumbnail's own load must not downsample again.
    fireEvent.load(img);
    expect(downsampleLoadedImage).toHaveBeenCalledOnce();

    act(() => {
      url = "blob:full-2";
      notify();
    });
    expect(screen.getByAltText("shot.png")).toBe(img);
    expect(img).toHaveAttribute("src", "blob:full-2");
  });

  it("keeps a pending host thumbnail out of the broken-image state and updates on readiness", () => {
    let url = "";
    let notify = () => {};
    const readiness = {
      resolvePath: () => url,
      subscribePath: (_path: string, listener: () => void) => {
        notify = listener;
        return () => {};
      },
      requestPath: vi.fn<(path: string) => void>(),
      resolveRef: () => "",
      subscribeRef: () => () => {},
      requestRef: () => {},
    };
    const { container } = render(
      <AttachmentBar
        attachments={[{ id: "image", path: "/tmp/image.png", name: "image.png", isImage: true }]}
        imagesAsPreview
        remoteImageReadiness={readiness}
      />,
    );
    const pending = container.querySelector("img");
    expect(pending).not.toBeNull();
    expect(pending).toHaveAttribute("aria-hidden", "true");
    expect(pending?.getAttribute("src")).toBeNull();
    expect(screen.getByRole("img", { name: "image.png" })).toBeInTheDocument();
    act(() => {
      url = "blob:ready";
      notify();
    });
    const ready = screen.getByAltText("image.png");
    expect(ready).toBe(pending);
    expect(ready).toHaveAttribute("src", "blob:ready");
  });

  it.each([true, false])(
    "decodes image thumbnails synchronously so repaints do not swap raster quality (preview: %s)",
    (imagesAsPreview) => {
      render(
        <AttachmentBar
          attachments={[{ id: "image", path: "/tmp/shot.png", name: "shot.png", isImage: true }]}
          imagesAsPreview={imagesAsPreview}
        />,
      );
      expect(screen.getByAltText("shot.png")).toHaveAttribute("decoding", "sync");
    },
  );

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

  it("prefers the local pasted-bytes preview over the remote URL", () => {
    const imageUrlForPath = vi.fn<(path: string) => string>(() => "https://mac.test/remote.png");
    render(
      <AttachmentBar
        attachments={[
          {
            id: "image-1",
            path: "C:\\Users\\host\\.poracode\\attachments\\shot.png",
            name: "shot.png",
            mimeType: "image/png",
            isImage: true,
            previewUrl: "blob:app/pasted-1",
          },
        ]}
        imagesAsPreview
        imageUrlForPath={imageUrlForPath}
      />,
    );

    expect(screen.getByAltText("shot.png")).toHaveAttribute("src", "blob:app/pasted-1");
    expect(imageUrlForPath).not.toHaveBeenCalled();
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
