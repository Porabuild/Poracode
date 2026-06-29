import { Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { getFolderIconUrl } from "@/renderer/components/common/fileIcons";
import { getBasename } from "@/shared/pathUtils";

type FolderAction = "tree" | "explorer";

interface InlineFolderPathChipProps {
  path: string;
  onRevealInTree?: ((path: string) => void) | undefined;
  onShowInExplorer?: ((path: string) => void) | undefined;
}

/**
 * Inline chip rendered inside chat markdown for project folder references.
 * Shows the raw path with a folder icon and offers a dropdown with two
 * actions: reveal in the in-app file tree, and show in the OS file explorer.
 */
export function InlineFolderPathChip({
  path,
  onRevealInTree,
  onShowInExplorer,
}: InlineFolderPathChipProps) {
  const { t } = useLingui();
  const basename = getBasename(path);
  const iconUrl = getFolderIconUrl(basename);

  function handleAction(key: FolderAction) {
    if (key === "tree") onRevealInTree?.(path);
    else if (key === "explorer") onShowInExplorer?.(path);
  }

  if (!onRevealInTree && !onShowInExplorer) {
    return (
      <span className="lightcode-inline-path-chip" title={path}>
        <img className="lightcode-inline-path-chip__icon" src={iconUrl} alt="" draggable={false} />
        <span className="lightcode-inline-path-chip__name">{path}</span>
      </span>
    );
  }

  return (
    <Dropdown>
      <button type="button" className="lightcode-inline-path-chip" title={path}>
        <img className="lightcode-inline-path-chip__icon" src={iconUrl} alt="" draggable={false} />
        <span className="lightcode-inline-path-chip__name">{path}</span>
      </button>
      <Dropdown.Popover className="min-w-[220px]">
        <Dropdown.Menu onAction={(key) => handleAction(key as FolderAction)}>
          {onRevealInTree ? (
            <Dropdown.Item id="tree" textValue={t`Reveal in file tree`}>
              <Label>
                <Trans>Reveal in file tree</Trans>
              </Label>
            </Dropdown.Item>
          ) : null}
          {onShowInExplorer ? (
            <Dropdown.Item id="explorer" textValue={t`Show in file explorer`}>
              <Label>
                <Trans>Show in file explorer</Trans>
              </Label>
            </Dropdown.Item>
          ) : null}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
