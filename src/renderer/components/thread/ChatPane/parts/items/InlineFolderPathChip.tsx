import { useState } from "react";
import { Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { getFolderIconUrl } from "@/renderer/components/common/fileIcons";
import {
  ResponsiveMenuSurface,
  useResponsiveMenu,
} from "@/renderer/components/common/ResponsiveMenuSurface";
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
 * On the mobile PWA it opens a bottom drawer (or, when a single action is
 * available, fires it on tap) instead of a cramped desktop popover.
 */
export function InlineFolderPathChip({
  path,
  onRevealInTree,
  onShowInExplorer,
}: InlineFolderPathChipProps) {
  const { t } = useLingui();
  const { mobile } = useResponsiveMenu();
  const [isOpen, setIsOpen] = useState(false);
  const basename = getBasename(path);
  const iconUrl = getFolderIconUrl(basename);

  const chipInner = (
    <>
      <img className="poracode-inline-path-chip__icon" src={iconUrl} alt="" draggable={false} />
      <span className="poracode-inline-path-chip__name">{path}</span>
    </>
  );

  const actions = [
    onRevealInTree
      ? { id: "tree", label: t`Reveal in file tree`, run: () => onRevealInTree(path) }
      : null,
    onShowInExplorer
      ? { id: "explorer", label: t`Show in file explorer`, run: () => onShowInExplorer(path) }
      : null,
  ].filter(
    (action): action is { id: FolderAction; label: string; run: () => void } => action !== null,
  );

  if (actions.length === 0) {
    return (
      <span className="poracode-inline-path-chip" title={path}>
        {chipInner}
      </span>
    );
  }

  if (mobile) {
    // A single action (the common mobile case — "show in explorer" is stripped
    // on remote) fires directly on tap; multiple actions open a bottom drawer.
    if (actions.length === 1) {
      return (
        <button
          type="button"
          className="poracode-inline-path-chip"
          title={path}
          onClick={() => actions[0]!.run()}
        >
          {chipInner}
        </button>
      );
    }
    return (
      <ResponsiveMenuSurface
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label={basename || t`Folder`}
        trigger={
          <button
            type="button"
            className="poracode-inline-path-chip"
            title={path}
            aria-expanded={isOpen}
            onClick={() => setIsOpen(true)}
          >
            {chipInner}
          </button>
        }
      >
        <div className="m-sheet-list">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="m-sheet-action"
              onClick={() => {
                setIsOpen(false);
                action.run();
              }}
            >
              <span className="flex-1 truncate">{action.label}</span>
            </button>
          ))}
        </div>
      </ResponsiveMenuSurface>
    );
  }

  return (
    <Dropdown>
      <button type="button" className="poracode-inline-path-chip" title={path}>
        {chipInner}
      </button>
      <Dropdown.Popover className="min-w-[220px]">
        <Dropdown.Menu onAction={(key) => actions.find((a) => a.id === key)?.run()}>
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
