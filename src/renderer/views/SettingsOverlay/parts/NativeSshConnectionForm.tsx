import { useState } from "react";
import { Button, Input, Tabs, TextArea } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { SshBridgeAuthentication } from "@poracode/ssh-bridge";
import { KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { probeNativeSshHost } from "@/renderer/native/nativeSsh";
import { deleteSshCredential, setSshCredential } from "@/renderer/native/sshVault";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

interface PendingConnection {
  readonly target: string;
  readonly port: number;
  readonly fingerprint: string;
  readonly algorithm: string;
  readonly authentication: SshBridgeAuthentication;
}

export function NativeSshConnectionForm({
  onConnected,
  onCancel,
}: {
  readonly onConnected: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLingui();
  const pairSshServer = useRemoteServersStore((state) => state.pairSshServer);
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("22");
  const [authKind, setAuthKind] = useState<"password" | "private-key">("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState<PendingConnection | null>(null);
  const probe = useAsyncOperation();
  const connect = useAsyncOperation();

  const authentication = (): SshBridgeAuthentication | null => {
    if (authKind === "password") return password ? { kind: "password", password } : null;
    return privateKey
      ? {
          kind: "private-key",
          privateKey,
          ...(passphrase ? { passphrase } : {}),
        }
      : null;
  };

  const verifyHost = () =>
    probe.run(async () => {
      const parsedPort = Number(port);
      const credential = authentication();
      if (
        !target.trim() ||
        !Number.isInteger(parsedPort) ||
        parsedPort < 1 ||
        parsedPort > 65_535
      ) {
        throw new Error(t`Enter a valid SSH target and port.`);
      }
      if (!credential) {
        throw new Error(
          authKind === "password" ? t`Enter the SSH password.` : t`Paste the SSH private key.`,
        );
      }
      const hostKey = await probeNativeSshHost(target.trim(), parsedPort);
      setPending({
        target: target.trim(),
        port: parsedPort,
        fingerprint: hostKey.fingerprint,
        algorithm: hostKey.algorithm,
        authentication: credential,
      });
    });

  const trustAndConnect = () =>
    connect.run(async () => {
      if (!pending) return;
      const connectionId = crypto.randomUUID();
      await setSshCredential(connectionId, pending.authentication);
      try {
        await pairSshServer({
          id: connectionId,
          label: pending.target,
          target: pending.target,
          port: pending.port,
          authentication: pending.authentication.kind,
          hostKeyFingerprint: pending.fingerprint,
        });
      } catch (error) {
        await deleteSshCredential(connectionId).catch(() => undefined);
        throw error;
      }
      onConnected();
    });

  if (pending) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--hairline)] p-3">
        <div className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="font-medium">
              <Trans>Verify SSH host key</Trans>
            </p>
            <p className="text-xs text-muted">
              <Trans>Compare this fingerprint with the one shown by your server.</Trans>
            </p>
            <code className="mt-2 block break-all text-xs">{pending.fingerprint}</code>
            <p className="text-xs text-muted">{pending.algorithm}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" isDisabled={connect.busy} onPress={trustAndConnect}>
            {connect.busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {connect.busy ? <Trans>Connecting…</Trans> : <Trans>Trust and connect</Trans>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isDisabled={connect.busy}
            onPress={() => setPending(null)}
          >
            <X className="size-4" />
            <Trans>Cancel</Trans>
          </Button>
        </div>
        {connect.error ? (
          <p role="alert" className="text-xs whitespace-pre-wrap text-danger">
            {connect.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--hairline)] p-3">
      <p className="text-xs text-muted">
        <Trans>
          Poracode will install or reuse its server on the SSH host and keep credentials in this
          device's secure storage.
        </Trans>
      </p>
      <Input
        value={target}
        aria-label={t`SSH target`}
        placeholder={t`user@example.com`}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setTarget(event.currentTarget.value)}
      />
      <Input
        value={port}
        aria-label={t`Port`}
        placeholder={t`22`}
        inputMode="numeric"
        onChange={(event) => setPort(event.currentTarget.value.replace(/\D/g, ""))}
      />
      <Tabs
        variant="secondary"
        selectedKey={authKind}
        onSelectionChange={(key) => setAuthKind(key === "private-key" ? "private-key" : "password")}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label={t`SSH authentication`}>
            <Tabs.Tab id="password">
              <Trans>Password</Trans>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="private-key">
              <Trans>Private key</Trans>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="password">
          <Input
            type="password"
            value={password}
            aria-label={t`Password`}
            autoComplete="off"
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        </Tabs.Panel>
        <Tabs.Panel id="private-key">
          <div className="flex flex-col gap-2">
            <TextArea
              rows={7}
              value={privateKey}
              aria-label={t`OpenSSH private key`}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setPrivateKey(event.currentTarget.value)}
            />
            <Input
              type="password"
              value={passphrase}
              aria-label={t`Passphrase (optional)`}
              autoComplete="off"
              onChange={(event) => setPassphrase(event.currentTarget.value)}
            />
          </div>
        </Tabs.Panel>
      </Tabs>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" isDisabled={probe.busy} onPress={verifyHost}>
          {probe.busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          {probe.busy ? <Trans>Checking host…</Trans> : <Trans>Verify host key</Trans>}
        </Button>
        <Button variant="ghost" size="sm" isDisabled={probe.busy} onPress={onCancel}>
          <X className="size-4" />
          <Trans>Cancel</Trans>
        </Button>
      </div>
      {probe.error ? (
        <p role="alert" className="text-xs whitespace-pre-wrap text-danger">
          {probe.error}
        </p>
      ) : null}
    </div>
  );
}
