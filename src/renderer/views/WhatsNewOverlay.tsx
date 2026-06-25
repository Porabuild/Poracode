import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Button, Modal } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { ChangelogView } from "@/renderer/components/changelog/ChangelogView";
import { openChangelogSettings } from "@/renderer/actions/panelActions";
import { useChangelogStore, useUnseenReleases } from "@/renderer/state/changelogStore";
import { productNameFor } from "@/shared/channel";

/**
 * The "What's New" dialog. It never opens automatically — an unread update only
 * surfaces as the sidebar "What's New" flag, and the user opens this on their
 * own terms. When opened after an update it lists every release the user hasn't
 * read; when opened while already caught up it shows the latest release.
 * Opening or closing the dialog marks the current version as read.
 */
export function WhatsNewOverlay() {
  const open = useChangelogStore((s) => s.whatsNewOpen);
  const bootstrapSeenState = useChangelogStore((s) => s.bootstrapSeenState);
  const loadChangelog = useChangelogStore((s) => s.loadChangelog);

  // Once per launch: initialize the seen marker (fresh profiles only) and fetch
  // the latest changelog from the marketing site.
  useEffect(() => {
    bootstrapSeenState();
    void loadChangelog();
  }, [bootstrapSeenState, loadChangelog]);

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) useChangelogStore.getState().dismissWhatsNew();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[560px]">{open ? <WhatsNewBody /> : null}</Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function WhatsNewBody() {
  const bridge = readBridge();
  const productName = productNameFor(bridge.channel);
  const allReleases = useChangelogStore((s) => s.releases);
  const unseen = useUnseenReleases();
  // After an update, show everything unread; when caught up (opened manually
  // from the sidebar), fall back to the most recent release so the dialog is
  // never empty.
  const isUpdate = unseen.length > 0;
  const latest = allReleases[0];
  const releases = isUpdate ? unseen : latest ? [latest] : [];

  function dismiss() {
    useChangelogStore.getState().dismissWhatsNew();
  }

  function viewFullChangelog() {
    dismiss();
    openChangelogSettings();
  }

  return (
    <>
      <Modal.CloseTrigger />
      <Modal.Header>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <Modal.Heading>
              <Trans>What's New</Trans>
            </Modal.Heading>
            {isUpdate ? (
              <p className="mt-0.5 text-xs text-muted">
                <Trans>
                  {productName} was updated to v{bridge.appVersion}.
                </Trans>
              </p>
            ) : null}
          </div>
        </div>
      </Modal.Header>
      <Modal.Body className="max-h-[60vh] overflow-y-auto p-4">
        <ChangelogView releases={releases} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" className="text-muted" onPress={viewFullChangelog}>
          <Trans>View full changelog</Trans>
        </Button>
        <Button variant="tertiary" className="!text-white" onPress={dismiss}>
          <Trans>Got it</Trans>
        </Button>
      </Modal.Footer>
    </>
  );
}
