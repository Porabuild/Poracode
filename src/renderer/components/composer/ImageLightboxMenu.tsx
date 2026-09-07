import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { ContextMenuSurface } from "@/renderer/components/common/ContextMenu";
import { fetchImageBytes, toClipboardPngBytes } from "@/renderer/utils/imageActions";
import { imageUrlMetadata } from "@/renderer/utils/imageUrlMetadata";
import type { LightboxImage } from "./ImageLightbox";

export function ImageLightboxMenu({
  image,
  position,
  onClose,
}: {
  image: LightboxImage;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const { t } = useLingui();

  async function runAction(action: string) {
    const metadata = imageUrlMetadata(image.src, image.alt);
    const mime = image.mime ?? metadata.mime;
    const fileName = image.fileName ?? metadata.fileName;
    try {
      if (action === "copy") {
        const data = await toClipboardPngBytes({ src: image.src, mime });
        if (!(await readBridge().copyImageToClipboard({ data }))) {
          toast.danger(t`Unable to copy image.`);
        }
      } else if (action === "save") {
        const data = await fetchImageBytes(image.src);
        await readBridge().saveImageFile({ data, suggestedName: fileName });
      }
    } catch {
      toast.danger(action === "copy" ? t`Unable to copy image.` : t`Unable to save image.`);
    }
  }

  return (
    <ContextMenuSurface
      position={position}
      items={[
        { id: "copy", label: t`Copy image` },
        { id: "save", label: t`Save image` },
      ]}
      onAction={(action) => void runAction(action)}
      onClose={onClose}
      withBackdrop
    />
  );
}
