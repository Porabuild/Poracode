import { useEffect, useRef, useState } from "react";
import { Button, Modal, Tooltip, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Import as ImportIcon, KeyRound, Plus, Search, ShieldCheck } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { ConfirmDialog, Input, LightballTabs } from "@/renderer/components/common";
import { useShallow } from "zustand/shallow";
import {
  browserCredentialById,
  useBrowserCredentialsStore,
} from "@/renderer/state/browserCredentialsStore";
import { useBrowserImportStore } from "@/renderer/state/browserImportStore";
import type { BrowserCredentialInfo } from "@/shared/ipc";
import { BrowserPasswordRow } from "./BrowserPasswordRow";

type PasswordsTab = "passwords" | "advanced";
type CredentialDraft = {
  id?: string;
  origin: string;
  username: string;
  password: string;
};

export function BrowserPasswordsPage() {
  const { t } = useLingui();
  const hasCredentials = useBrowserCredentialsStore((state) => state.credentials.length > 0);
  const revision = useBrowserCredentialsStore((state) => state.revision);
  const setCredentials = useBrowserCredentialsStore((state) => state.setCredentials);
  const setDeletingId = useBrowserCredentialsStore((state) => state.setDeletingId);
  const setImportOpen = useBrowserImportStore((state) => state.setOpen);
  const [activeTab, setActiveTab] = useState<PasswordsTab>("passwords");
  const [query, setQuery] = useState("");
  const editorRequest = useRef(0);
  const [editor, setEditor] = useState<CredentialDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BrowserCredentialInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const readRevision = revision;
    readBridge()
      .browserListCredentials()
      .then((items) => {
        if (!cancelled && useBrowserCredentialsStore.getState().revision === readRevision)
          setCredentials(items);
      })
      .catch(() => {
        if (!cancelled) toast.danger(t`Unable to load saved passwords.`);
      });
    return () => {
      cancelled = true;
    };
  }, [revision, setCredentials, t]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleIds = useBrowserCredentialsStore(
    useShallow((state) =>
      state.credentials
        .filter(
          (credential) =>
            !normalizedQuery ||
            [credential.origin, credential.username, credential.source ?? ""].some((value) =>
              value.toLowerCase().includes(normalizedQuery),
            ),
        )
        .map((credential) => credential.id),
    ),
  );

  async function editCredential(credentialId: string) {
    const request = ++editorRequest.current;
    const state = useBrowserCredentialsStore.getState();
    const credential = browserCredentialById(state.credentials, credentialId);
    if (!credential) return;
    try {
      const result = await readBridge().browserGetCredentialPassword({ id: credential.id });
      if (
        editorRequest.current !== request ||
        useBrowserCredentialsStore.getState().revision !== state.revision
      )
        return;
      setEditor({
        id: credential.id,
        origin: credential.origin,
        username: credential.username,
        password: result.password,
      });
    } catch {
      if (editorRequest.current === request) toast.danger(t`Unable to edit the saved password.`);
    }
  }

  async function deleteCredential() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setDeletingId(id);
    try {
      await readBridge().browserDeleteCredential({ id });
    } catch {
      toast.danger(t`Unable to delete the saved password.`);
    } finally {
      setDeletingId(null);
    }
  }

  function requestDelete(credentialId: string) {
    const state = useBrowserCredentialsStore.getState();
    setPendingDelete(browserCredentialById(state.credentials, credentialId) ?? null);
  }

  return (
    <div className="flex size-full min-h-0 flex-col overflow-hidden bg-[var(--content-background)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="@container mx-auto w-full max-w-3xl">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-tight">
              <Trans>Manage passwords</Trans>
            </h1>
            {activeTab === "passwords" ? (
              <Tooltip>
                <Button
                  isIconOnly
                  size="sm"
                  variant="secondary"
                  className="size-8 min-w-8 shrink-0 rounded-full"
                  aria-label={t`Add password`}
                  onPress={() => {
                    editorRequest.current += 1;
                    setEditor({ origin: "", username: "", password: "" });
                  }}
                >
                  <Plus className="size-4" />
                </Button>
                <Tooltip.Content placement="bottom" className="pointer-events-none z-[1000]">
                  <Trans>Add password</Trans>
                </Tooltip.Content>
              </Tooltip>
            ) : null}
          </div>
          <LightballTabs
            className="mt-3"
            active={activeTab}
            ariaLabel={t`Password manager section`}
            onChange={setActiveTab}
            tabs={[
              { id: "passwords", label: t`Passwords` },
              { id: "advanced", label: t`Advanced` },
            ]}
          />

          {activeTab === "passwords" ? (
            <section className="mt-5">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted" />
                <Input
                  aria-label={t`Search passwords`}
                  placeholder={t`Search passwords`}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  className="w-full pl-8 text-xs"
                />
              </div>

              {visibleIds.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-surface-tertiary text-muted">
                    <KeyRound className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {!hasCredentials ? (
                        <Trans>No saved passwords</Trans>
                      ) : (
                        <Trans>No passwords match your search</Trans>
                      )}
                    </p>
                    {!hasCredentials ? (
                      <p className="mt-1 text-xs text-muted">
                        <Trans>Add a password or import one from another browser.</Trans>
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-2 divide-y divide-border/60">
                  {visibleIds.map((credentialId) => (
                    <BrowserPasswordRow
                      key={credentialId}
                      credentialId={credentialId}
                      onEdit={editCredential}
                      onDelete={requestDelete}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="mt-5 grid gap-3 @xl:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-4">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface-tertiary text-muted">
                  <ImportIcon className="size-4" />
                </span>
                <h2 className="mt-3 text-sm font-semibold">
                  <Trans>Import browser data</Trans>
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  <Trans>Bring saved passwords and cookies over from an installed browser.</Trans>
                </p>
                <Button
                  className="mt-4"
                  size="sm"
                  variant="secondary"
                  onPress={() => setImportOpen(true)}
                >
                  <Trans>Import cookies and passwords</Trans>
                </Button>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface-tertiary text-muted">
                  <ShieldCheck className="size-4" />
                </span>
                <h2 className="mt-3 text-sm font-semibold">
                  <Trans>Local password protection</Trans>
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  <Trans>
                    Passwords are encrypted in Poracode's local credential store. Password values
                    are requested only when you reveal, copy, or edit them.
                  </Trans>
                </p>
              </div>
            </section>
          )}
        </div>
      </div>

      {editor ? (
        <CredentialEditorModal
          key={editor.id ?? "new"}
          initial={editor}
          onClose={() => {
            editorRequest.current += 1;
            setEditor(null);
          }}
          onSaved={() => {
            setEditor(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={t`Delete saved password?`}
        body={
          <Trans>
            This removes the saved password for <strong>{pendingDelete?.origin}</strong> from
            Poracode.
          </Trans>
        }
        confirmLabel={t`Delete`}
        onConfirm={() => void deleteCredential()}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

function CredentialEditorModal(props: {
  initial: CredentialDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLingui();
  const [origin, setOrigin] = useState(props.initial.origin);
  const [username, setUsername] = useState(props.initial.username);
  const [password, setPassword] = useState(props.initial.password);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await readBridge().browserUpsertCredential({
        ...(props.initial.id ? { id: props.initial.id } : {}),
        origin: origin.trim(),
        username,
        password,
      });
      props.onSaved();
    } catch {
      toast.danger(t`Unable to save the password.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal.Backdrop
      isOpen
      className="z-[1100]"
      onOpenChange={(open) => !open && !saving && props.onClose()}
    >
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog className="sm:max-w-[440px]">
          <Modal.CloseTrigger isDisabled={saving} />
          <Modal.Header>
            <Modal.Heading>
              {props.initial.id ? <Trans>Edit password</Trans> : <Trans>Add password</Trans>}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="gap-3 p-4">
            <label
              htmlFor="browser-credential-origin"
              className="flex flex-col gap-1.5 text-xs font-medium"
            >
              <Trans>Website</Trans>
              <Input
                id="browser-credential-origin"
                aria-label={t`Website origin`}
                inputMode="url"
                placeholder={t`https://example.com`}
                value={origin}
                onChange={(event) => setOrigin(event.currentTarget.value)}
              />
            </label>
            <label
              htmlFor="browser-credential-username"
              className="flex flex-col gap-1.5 text-xs font-medium"
            >
              <Trans>Username</Trans>
              <Input
                id="browser-credential-username"
                aria-label={t`Username`}
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.currentTarget.value)}
              />
            </label>
            <label
              htmlFor="browser-credential-password"
              className="flex flex-col gap-1.5 text-xs font-medium"
            >
              <Trans>Password</Trans>
              <Input
                id="browser-credential-password"
                aria-label={t`Password`}
                autoComplete="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
            </label>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="ghost"
              className="text-muted"
              isDisabled={saving}
              onPress={props.onClose}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="tertiary"
              isPending={saving}
              isDisabled={!origin.trim() || !password}
              onPress={() => void save()}
            >
              <Trans>Save</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
