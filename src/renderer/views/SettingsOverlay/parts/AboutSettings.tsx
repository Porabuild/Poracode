import { Button } from "@heroui/react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { PixelLoader } from "@/renderer/components/common";
import { useUpdateStore } from "@/renderer/state/updateStore";
import { productNameFor } from "@/shared/channel";
import { formatBytes } from "@/shared/formatBytes";
import appIconStableUrl from "../../../../../build/icon.png";
import appIconNightlyUrl from "../../../../../build/icon-nightly.png";

const GITHUB_REPO = "https://github.com/nicepkg/lightcode";
const WEBSITE_URL = "https://www.lightcodeapp.com/";

function AboutLink(props: { href: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      onClick={() => void readBridge().openExternal(props.href)}
    >
      {props.children}
      <ExternalLink className="size-3" />
    </button>
  );
}

function UpdateButton() {
  const phase = useUpdateStore((s) => s.phase);
  const version = useUpdateStore((s) => s.version);
  const downloadPercent = useUpdateStore((s) => s.downloadPercent);
  const transferred = useUpdateStore((s) => s.downloadTransferred);
  const total = useUpdateStore((s) => s.downloadTotal);
  const bytesPerSecond = useUpdateStore((s) => s.downloadBytesPerSecond);

  if (phase === "checking") {
    return (
      <Button size="sm" isDisabled variant="ghost">
        <PixelLoader size="sm" />
        Checking…
      </Button>
    );
  }

  if (phase === "downloading") {
    const v = version ? ` v${version}` : "";
    const byteLine =
      transferred != null && total != null && total > 0
        ? `${formatBytes(transferred)} / ${formatBytes(total)}`
        : null;
    const speedLine =
      bytesPerSecond != null && bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : null;

    return (
      <div className="flex min-w-0 max-w-[min(100%,280px)] flex-col items-stretch gap-2 text-left">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Download className="size-3.5 shrink-0 animate-pulse" />
          <span className="min-w-0 truncate">
            Downloading{v} — {Math.round(downloadPercent)}%{speedLine ? ` · ${speedLine}` : ""}
          </span>
        </div>
        {byteLine ? <p className="text-xs text-muted">{byteLine}</p> : null}
        <div className="h-1 w-full rounded-full bg-white/10">
          <div
            className="h-1 rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.round(downloadPercent)}%` }}
          />
        </div>
      </div>
    );
  }

  if (phase === "downloaded") {
    const label = version ? `Install v${version}` : "Install update";
    return (
      <Button size="sm" variant="primary" onPress={() => void readBridge().installUpdate()}>
        <RefreshCw className="size-3.5" />
        {label}
      </Button>
    );
  }

  return (
    <Button size="sm" variant="ghost" onPress={() => void readBridge().checkForUpdate()}>
      Check for updates
    </Button>
  );
}

export function AboutSettings() {
  const bridge = readBridge();
  const productName = productNameFor(bridge.channel);
  const appIconUrl = bridge.channel === "nightly" ? appIconNightlyUrl : appIconStableUrl;

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">About</h1>

        <div className="mb-8 flex items-center gap-4">
          <img src={appIconUrl} alt={productName} className="size-12 shrink-0 rounded-lg" />
          <div>
            <p className="text-lg font-semibold text-foreground">{productName}</p>
            <p className="text-xs text-muted">
              AI agent orchestrator — manage coding agents via Terminal and Native ACP.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Version</p>
              <p className="text-xs text-muted">{bridge.appVersion}</p>
            </div>
            <div className="shrink-0">
              <UpdateButton />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-foreground">Channel</p>
            <p className="text-sm text-muted capitalize">{bridge.channel}</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-foreground">Electron</p>
            <p className="text-sm text-muted">{bridge.electronVersion}</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-foreground">License</p>
            <p className="text-sm text-muted">Apache-2.0</p>
          </div>
        </div>

        <div className="mt-8 space-y-3 border-t border-white/6 pt-6">
          <AboutLink href={WEBSITE_URL}>Website</AboutLink>
          <br />
          <AboutLink href={GITHUB_REPO}>GitHub Repository</AboutLink>
          <br />
          <AboutLink href={`${GITHUB_REPO}/releases`}>Changelog</AboutLink>
          <br />
          <AboutLink href={`${GITHUB_REPO}/issues`}>Report an Issue</AboutLink>
          <br />
          <AboutLink href={`${GITHUB_REPO}/blob/master/LICENSE`}>License</AboutLink>
        </div>

        <p className="mt-8 text-xs text-muted">
          &copy; {new Date().getFullYear()} Serhii Vecherenko. All rights reserved.
        </p>
      </div>
    </div>
  );
}
