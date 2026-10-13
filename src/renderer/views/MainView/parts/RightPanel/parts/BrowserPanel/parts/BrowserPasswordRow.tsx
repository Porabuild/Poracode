import { useState } from "react";
import { Button, Dropdown, Label, Tooltip, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Copy, Eye, EyeOff, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import {
  browserCredentialById,
  useBrowserCredentialsStore,
} from "@/renderer/state/browserCredentialsStore";

export function BrowserPasswordRow(props: {
  credentialId: string;
  onEdit: (credentialId: string) => Promise<void>;
  onDelete: (credentialId: string) => void;
}) {
  const { t } = useLingui();
  const credential = useBrowserCredentialsStore((state) =>
    browserCredentialById(state.credentials, props.credentialId),
  );
  const revision = useBrowserCredentialsStore((state) => state.revision);
  const deleting = useBrowserCredentialsStore((state) => state.deletingId === props.credentialId);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<{ revision: number; password: string } | null>(null);
  const revealedPassword = revealed?.revision === revision ? revealed.password : undefined;
  const isBusy = busy || deleting;

  async function revealPassword() {
    if (revealedPassword !== undefined) {
      setRevealed(null);
      return;
    }
    setBusy(true);
    try {
      const result = await readBridge().browserGetCredentialPassword({ id: props.credentialId });
      if (useBrowserCredentialsStore.getState().revision === revision) {
        setRevealed({ revision, password: result.password });
      }
    } catch {
      toast.danger(t`Unable to reveal the password.`);
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    setBusy(true);
    try {
      const result = await readBridge().browserGetCredentialPassword({ id: props.credentialId });
      await navigator.clipboard.writeText(result.password);
      toast.success(t`Password copied.`);
    } catch {
      toast.danger(t`Unable to copy the password.`);
    } finally {
      setBusy(false);
    }
  }

  async function editCredential() {
    setBusy(true);
    try {
      await props.onEdit(props.credentialId);
    } finally {
      setBusy(false);
    }
  }

  if (!credential) return null;
  const revealLabel = revealedPassword === undefined ? t`Reveal password` : t`Hide password`;

  return (
    <article className="py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={credential.origin}>
            {credential.origin}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted" title={credential.username}>
            {credential.username}
          </p>
          {credential.source ? (
            <p className="mt-1 truncate text-[10px] text-muted/70">
              <Trans>Imported from {credential.source}</Trans>
            </p>
          ) : null}
        </div>
        <Dropdown>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className="size-7 min-w-7 shrink-0 rounded-full text-muted"
            isDisabled={isBusy}
            aria-label={t`Saved password actions`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
          <Dropdown.Popover placement="bottom end" className="z-[1000] min-w-44">
            <Dropdown.Menu
              aria-label={t`Saved password actions`}
              onAction={(key) => {
                if (key === "edit") void editCredential();
                else if (key === "delete") props.onDelete(props.credentialId);
              }}
            >
              <Dropdown.Item id="edit" textValue={t`Edit saved password`}>
                <Pencil className="size-3.5 text-muted" />
                <Label>
                  <Trans>Edit saved password</Trans>
                </Label>
              </Dropdown.Item>
              <Dropdown.Item id="delete" textValue={t`Delete saved password`} variant="danger">
                <Trash2 className="size-3.5" />
                <Label>
                  <Trans>Delete saved password</Trans>
                </Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span
          className={`min-w-0 flex-1 break-all font-mono text-xs ${revealedPassword === undefined ? "text-muted" : "text-foreground"}`}
        >
          {revealedPassword ?? "••••••••"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="size-7 min-w-7 rounded-full text-muted"
              isDisabled={isBusy}
              aria-label={revealLabel}
              onPress={() => void revealPassword()}
            >
              {revealedPassword === undefined ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
            </Button>
            <Tooltip.Content placement="top" className="pointer-events-none z-[1000]">
              {revealLabel}
            </Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="size-7 min-w-7 rounded-full text-muted"
              isDisabled={isBusy}
              aria-label={t`Copy password`}
              onPress={() => void copyPassword()}
            >
              <Copy className="size-3.5" />
            </Button>
            <Tooltip.Content placement="top" className="pointer-events-none z-[1000]">
              <Trans>Copy password</Trans>
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>
    </article>
  );
}
