import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { ChangelogView } from "@/renderer/components/changelog/ChangelogView";
import { useChangelogStore } from "@/renderer/state/changelogStore";
import { SettingsPage } from "./SettingsForm";

const RELEASES_URL = "https://github.com/SDSLeon/lightcode/releases";

export function ChangelogSettings() {
  const { t } = useLingui();
  const releases = useChangelogStore((s) => s.releases);
  const markCurrentSeen = useChangelogStore((s) => s.markCurrentSeen);
  const loadChangelog = useChangelogStore((s) => s.loadChangelog);

  // Opening the changelog counts as reading it — clear the unseen badge — and
  // refresh from the source in case the launch fetch hadn't landed yet.
  useEffect(() => {
    markCurrentSeen();
    void loadChangelog();
  }, [markCurrentSeen, loadChangelog]);

  const releasesLink = (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      onClick={() => void readBridge().openExternal(RELEASES_URL)}
    >
      <Trans>View all releases on GitHub</Trans>
      <ExternalLink className="size-3" />
    </button>
  );

  return (
    <SettingsPage
      title={t`Changelog`}
      description={<Trans>What's new in Lightcode, newest first.</Trans>}
      bodyClassName=""
    >
      {releases.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-muted">
            <Trans>Couldn't load the changelog. Check your connection, or view it on GitHub.</Trans>
          </p>
          <div className="mt-3 flex justify-center">{releasesLink}</div>
        </div>
      ) : (
        <ChangelogView releases={releases} footer={releasesLink} />
      )}
    </SettingsPage>
  );
}
