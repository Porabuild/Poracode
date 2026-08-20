import { useEffect, useState } from "react";
import { Button, Modal, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Copy,
  Eye,
  EyeOff,
  Import as ImportIcon,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { ConfirmDialog, Input, LightballTabs } from "@/renderer/components/common";
import { useBrowserCredentialsStore } from "@/renderer/state/browserCredentialsStore";
import { useBrowserImportStore } from "@/renderer/state/browserImportStore";
import type { BrowserCredentialInfo } from "@/shared/ipc";

type PasswordsTab = "passwords" | "advanced";
type CredentialDraft = {
  id?: string;
  origin: string;
  username: string;
  password: string;
};

export function BrowserPasswordsPage() {
  const { t } = useLingui();
  const credentials = useBrowserCredentialsStore((state) => state.credentials);
  const revision = useBrowserCredentialsStore((state) => state.revision);
  const setCredentials = useBrowserCredentialsStore((state) => state.setCredentials);
  const setImportOpen = useBrowserImportStore((state) => state.setOpen);
  const [activeTab, setActiveTab] = useState<PasswordsTab>("passwords");
  const [query, setQuery] = useState("");
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [busyCredentialId, setBusyCredentialId] = useState<string | null>(null);
  const [editor, setEditor] = useState<CredentialDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BrowserCredentialInfo | null>(null);

  useEffect(() => setRevealedPasswords({}), [revision]);

  useEffect(() => {
    let cancelled = false;
    readBridge()
      .browserListCredentials()
      .then((items) => {
        if (!cancelled) setCredentials(items);
      })
      .catch(() => {
        if (!cancelled) toast.danger(t`Unable to load saved passwords.`);
      });
    return () => {
      cancelled = true;
    };
  }, [revision, setCredentials, t]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleCredentials = normalizedQuery
    ? credentials.filter((credential) =>
        [credential.origin, credential.username, credential.source ?? ""].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
    : credentials;

  async function revealPassword(credential: BrowserCredentialInfo) {
    if (revealedPasswords[credential.id] !== undefined) {
      setRevealedPasswords((current) => {
        const next = { ...current };
        delete next[credential.id];
        return next;
      });
      return;
    }
    setBusyCredentialId(credential.id);
    try {
      const result = await readBridge().browserGetCredentialPassword({ id: credential.id });
      setRevealedPasswords((current) => ({ ...current, [credential.id]: result.password }));
    } catch {
      toast.danger(t`Unable to reveal the password.`);
    } finally {
      setBusyCredentialId(null);
    }
  }

  async function copyPassword(credential: BrowserCredentialInfo) {
    setBusyCredentialId(credential.id);
    try {
      const result = await readBridge().browserGetCredentialPassword({ id: credential.id });
      await navigator.clipboard.writeText(result.password);
      toast.success(t`Password copied.`);
    } catch {
      toast.danger(t`Unable to copy the password.`);
    } finally {
      setBusyCredentialId(null);
    }
  }

  async function editCredential(credential: BrowserCredentialInfo) {
    setBusyCredentialId(credential.id);
    try {
      const result = await readBridge().browserGetCredentialPassword({ id: credential.id });
      setEditor({
        id: credential.id,
        origin: credential.origin,
        username: credential.username,
        password: result.password,
      });
    } catch {
      toast.danger(t`Unable to edit the saved password.`);
    } finally {
      setBusyCredentialId(null);
    }
  }

  async function deleteCredential() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setBusyCredentialId(id);
    try {
      await readBridge().browserDeleteCredential({ id });
      setRevealedPasswords((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch {
      toast.danger(t`Unable to delete the saved password.`);
    } finally {
      setBusyCredentialId(null);
    }
  }

  return (
    <div className="flex size-full min-h-0 flex-col overflow-hidden bg-[var(--content-background)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Trans>Manage passwords</Trans>
          </h1>
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
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted" />
                  <Input
                    aria-label={t`Search passwords`}
                    placeholder={t`Search passwords`}
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    className="pl-8 text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => setEditor({ origin: "", username: "", password: "" })}
                >
                  <Plus className="size-3.5" />
                  <Trans>Add password</Trans>
                </Button>
              </div>

              {visibleCredentials.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-surface-tertiary text-muted">
                    <KeyRound className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {credentials.length === 0 ? (
                        <Trans>No saved passwords</Trans>
                      ) : (
                        <Trans>No passwords match your search</Trans>
                      )}
                    </p>
                    {credentials.length === 0 ? (
                      <p className="mt-1 text-xs text-muted">
                        <Trans>Add a password or import one from another browser.</Trans>
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
                  {visibleCredentials.map((credential, index) => {
                    const revealedPassword = revealedPasswords[credential.id];
                    const busy = busyCredentialId === credential.id;
                    return (
                      <article
                        key={credential.id}
                        className={`flex items-center gap-3 px-3 py-3 ${index > 0 ? "border-t border-border" : ""}`}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary text-muted">
                          <KeyRound className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={credential.origin}>
                            {credential.origin}
                          </p>
                          <p className="truncate text-xs text-muted">{credential.username}</p>
                          {credential.source ? (
                            <p className="truncate text-[10px] text-muted/70">
                              <Trans>Imported from {credential.source}</Trans>
                            </p>
                          ) : null}
                        </div>
                        <span className="max-w-40 truncate font-mono text-xs text-muted">
                          {revealedPassword ?? "••••••••"}
                        </span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            isDisabled={busy}
                            aria-label={
                              revealedPassword === undefined ? t`Reveal password` : t`Hide password`
                            }
                            onPress={() => void revealPassword(credential)}
                          >
                            {revealedPassword === undefined ? (
                              <Eye className="size-3.5" />
                            ) : (
                              <EyeOff className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            isDisabled={busy}
                            aria-label={t`Copy password`}
                            onPress={() => void copyPassword(credential)}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            isDisabled={busy}
                            aria-label={t`Edit saved password`}
                            onPress={() => void editCredential(credential)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            isDisabled={busy}
                            aria-label={t`Delete saved password`}
                            onPress={() => setPendingDelete(credential)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <section className="mt-5 grid gap-3 sm:grid-cols-2">
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
          onClose={() => setEditor(null)}
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
            <Button variant="tertiary" isDisabled={saving} onPress={props.onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
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
