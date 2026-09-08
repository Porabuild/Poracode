import { Button, Tooltip, toast } from "@heroui/react";
import { Copy, Download } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { fetchImageBytes, toClipboardPngBytes } from "@/renderer/utils/imageActions";
import { imageUrlMetadata } from "@/renderer/utils/imageUrlMetadata";
import type { LightboxImage } from "./ImageLightbox";

export function ImageLightboxActions({ image }: { image: LightboxImage }) {
  const { t } = useLingui();

  async function runAction(action: "copy" | "save") {
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
    <>
      <Tooltip>
        <Button
          isIconOnly
          variant="ghost"
          className="poracode-image-lightbox__zoom-button"
          aria-label={t`Copy image`}
          onPress={() => void runAction("copy")}
        >
          <Copy className="size-4" />
        </Button>
        <Tooltip.Content>{t`Copy image`}</Tooltip.Content>
      </Tooltip>
      <Tooltip>
        <Button
          isIconOnly
          variant="ghost"
          className="poracode-image-lightbox__zoom-button"
          aria-label={t`Save image`}
          onPress={() => void runAction("save")}
        >
          <Download className="size-4" />
        </Button>
        <Tooltip.Content>{t`Save image`}</Tooltip.Content>
      </Tooltip>
    </>
  );
}
