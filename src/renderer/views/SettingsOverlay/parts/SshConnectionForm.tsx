import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { FolderOpen, Loader2, Network, X } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { Input } from "@/renderer/components/common";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

export function SshConnectionForm({
  onConnected,
  onCancel,
}: {
  readonly onConnected: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLingui();
  const pairSshServer = useRemoteServersStore((state) => state.pairSshServer);
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("");
  const [authMode, setAuthMode] = useState<"default" | "identity">("default");
  const [identityFile, setIdentityFile] = useState("");
  const [discoveredHosts, setDiscoveredHosts] = useState<string[]>([]);
  const { busy, error, run } = useAsyncOperation();

  useEffect(() => {
    void readBridge()
      .sshDiscoverHosts()
      .then((hosts) => setDiscoveredHosts(hosts.map((host) => host.alias)))
      .catch(() => undefined);
  }, []);

  const parsedPort = port.trim() ? Number.parseInt(port.trim(), 10) : undefined;
  const validPort = parsedPort === undefined || (parsedPort >= 1 && parsedPort <= 65_535);
  const canConnect =
    !busy &&
    target.trim().length > 0 &&
    validPort &&
    (authMode === "default" || !!identityFile.trim());

  const connect = () => {
    if (!canConnect) return;
    run(async () => {
      const trimmedTarget = target.trim();
      await pairSshServer({
        id: crypto.randomUUID(),
        label: label.trim() || trimmedTarget,
        target: trimmedTarget,
        ...(parsedPort ? { port: parsedPort } : {}),
        ...(authMode === "identity" ? { identityFile: identityFile.trim() } : {}),
      });
      onConnected();
    });
  };

  const chooseIdentity = () => {
    void readBridge()
      .pickFiles({ title: t`Choose SSH identity file` })
      .then((paths) => {
        const path = paths?.[0];
        if (path) setIdentityFile(path);
      });
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--hairline)] p-3">
      <Input
        value={label}
        aria-label={t`Display name`}
        placeholder={t`Display name (optional)`}
        onChange={(event) => setLabel(event.currentTarget.value)}
      />
      <Input
        className="font-mono text-xs"
        value={target}
        list="lightcode-ssh-hosts"
        aria-label={t`SSH hostname`}
        placeholder={t`host.com, alias, or user@host.com`}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(event) => setTarget(event.currentTarget.value)}
      />
      <datalist id="lightcode-ssh-hosts">
        {discoveredHosts.map((host) => (
          <option key={host} value={host}>
            {host}
          </option>
        ))}
      </datalist>
      <Input
        value={port}
        aria-label={t`SSH port`}
        placeholder={t`SSH port (optional)`}
        inputMode="numeric"
        onChange={(event) => setPort(event.currentTarget.value.replace(/\D/g, ""))}
      />
      {!validPort ? (
        <p className="text-xs text-danger">
          <Trans>Enter a port from 1 to 65535.</Trans>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-default-100 p-1">
        <Button
          size="sm"
          variant={authMode === "default" ? "secondary" : "ghost"}
          onPress={() => setAuthMode("default")}
        >
          <Trans>SSH config / agent</Trans>
        </Button>
        <Button
          size="sm"
          variant={authMode === "identity" ? "secondary" : "ghost"}
          onPress={() => setAuthMode("identity")}
        >
          <Trans>Identity file</Trans>
        </Button>
      </div>

      {authMode === "identity" ? (
        <div className="flex gap-1.5">
          <Input
            className="min-w-0 flex-1 font-mono text-xs"
            value={identityFile}
            aria-label={t`Identity file path`}
            placeholder={t`Identity file path`}
            spellCheck={false}
            onChange={(event) => setIdentityFile(event.currentTarget.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label={t`Browse`}
            onPress={chooseIdentity}
          >
            <FolderOpen className="size-4" />
          </Button>
        </div>
      ) : null}

      <p className="text-xs leading-5 text-muted">
        <Trans>
          Lightcode and your agents run on the remote machine. SSH is used only to start the remote
          environment and secure its local tunnel.
        </Trans>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" isDisabled={!canConnect} onPress={connect}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
          {busy ? <Trans>Preparing remote environment…</Trans> : <Trans>Connect</Trans>}
        </Button>
        <Button variant="ghost" size="sm" isDisabled={busy} onPress={onCancel}>
          <X className="size-4" />
          <Trans>Cancel</Trans>
        </Button>
      </div>
      {error ? <p className="text-xs whitespace-pre-wrap text-danger">{error}</p> : null}
    </div>
  );
}
