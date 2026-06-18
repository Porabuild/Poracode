import { useRef, useState } from "react";
import { Modal } from "@heroui/react";
import { Check, Copy } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import type { ProfileCoreStats, ProfileStatsWindow, ProfileTokenStats } from "@/shared/contracts";
import { ShareCard } from "./ShareCard";
import type { ActivityMetric } from "./ActivitySection";

export function ShareDialog(props: {
  open: boolean;
  core: ProfileCoreStats;
  tokens: ProfileTokenStats | null;
  metric: ActivityMetric;
  window: ProfileStatsWindow;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { open, core, tokens, metric, window, onClose } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  async function copyImage() {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    try {
      await readBridge().copyShareImage({ x: r.left, y: r.top, width: r.width, height: r.height });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[680px]">
          <div className="flex flex-col gap-6 p-6">
            <h2 className="text-center text-lg font-semibold text-foreground">
              <Trans>Share your activity</Trans>
            </h2>

            <div className="flex justify-center">
              <ShareCard
                ref={cardRef}
                core={core}
                tokens={tokens}
                metric={metric}
                window={window}
              />
            </div>

            <div className="flex justify-center">
              <Button variant="tertiary" onPress={() => void copyImage()} className="gap-1.5">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? t`Copied to clipboard` : t`Copy image`}
              </Button>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
