import { useState } from "react";
import { FolderOpen, RotateCcw } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { Button, Input, PathDisplay } from "@/renderer/components/common";

/** Friendly representation of the built-in default worktree root. */
export const DEFAULT_WORKTREE_PATH = "~/.lightcode/worktrees";

/**
 * Worktree base-folder control shared by the global and per-project settings: a
 * native folder picker (or a Linux-path input for WSL) plus a restore button
 * that clears back to the default. `value` is the persisted base path
 * (`""` = built-in default).
 */
export function WorktreeBaseFolderField(props: {
  isWsl: boolean;
  value: string;
  onChange: (value: string) => void;
  /** Path shown (and used as the input placeholder) when `value` is empty. */
  defaultPath?: string;
}) {
  const { t } = useLingui();
  const { isWsl, value, onChange } = props;
  const defaultPath = props.defaultPath ?? DEFAULT_WORKTREE_PATH;
  const [draft, setDraft] = useState(value);

  async function pick() {
    const picked = await readBridge().pickFolder(value || undefined);
    if (picked) onChange(picked);
  }

  function restore() {
    setDraft("");
    onChange("");
  }

  const canRestore = isWsl ? Boolean(draft) : Boolean(value);

  return (
    <div className="flex w-[320px] shrink-0 items-center gap-2">
      {isWsl ? (
        <Input
          aria-label={t`Worktree base folder`}
          className="min-w-0 flex-1 font-mono text-xs"
          placeholder={defaultPath}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onChange(draft.trim())}
        />
      ) : (
        <Button
          aria-label={t`Choose worktree base folder`}
          variant="tertiary"
          className="min-w-0 flex-1 justify-start gap-2 font-normal"
          onPress={() => void pick()}
        >
          <FolderOpen className="size-4 shrink-0 text-muted" />
          <PathDisplay path={value || defaultPath} className="min-w-0 flex-1 text-xs" />
        </Button>
      )}
      <Button
        isIconOnly
        aria-label={t`Restore default worktree base folder`}
        variant="tertiary"
        className="shrink-0"
        isDisabled={!canRestore}
        onPress={restore}
      >
        <RotateCcw className="size-3.5 text-muted" />
      </Button>
    </div>
  );
}
