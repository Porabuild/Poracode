import { useEffect, useState } from "react";
import { Button, Input, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { RotateCw, X } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { Select } from "@/renderer/components/common";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import type { BrowserDeviceEmulation, BrowserTabInfo } from "@/shared/ipc";

interface DevicePreset extends Omit<BrowserDeviceEmulation, "preset" | "scale"> {
  id: string;
  label: string;
}

const scaleValues = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function BrowserDeviceToolbar() {
  const activeTab = useBrowserPanelStore((state) =>
    state.activeTabId ? state.tabs.find((tab) => tab.tabId === state.activeTabId) : undefined,
  );
  if (!activeTab?.deviceEmulation || activeTab.internalPage) return null;
  return <ActiveBrowserDeviceToolbar key={activeTab.tabId} tab={activeTab} />;
}

function ActiveBrowserDeviceToolbar({ tab }: { tab: BrowserTabInfo }) {
  const { t } = useLingui();
  const emulation = tab.deviceEmulation!;
  const [widthDraft, setWidthDraft] = useState(String(emulation.width));
  const [heightDraft, setHeightDraft] = useState(String(emulation.height));

  useEffect(() => setWidthDraft(String(emulation.width)), [emulation.width]);
  useEffect(() => setHeightDraft(String(emulation.height)), [emulation.height]);

  const presets: DevicePreset[] = [
    {
      id: "Responsive",
      label: t`Responsive`,
      width: emulation.width,
      height: emulation.height,
      deviceScaleFactor: 1,
      mobile: false,
      touch: false,
    },
    {
      id: "4K",
      label: t`4K`,
      width: 3840,
      height: 2160,
      deviceScaleFactor: 1,
      mobile: false,
      touch: false,
    },
    {
      id: "Laptop L",
      label: t`Laptop L`,
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
      touch: false,
    },
    {
      id: "Laptop",
      label: t`Laptop`,
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
      touch: false,
    },
    {
      id: "Surface Pro 7",
      label: t`Surface Pro 7`,
      width: 912,
      height: 1368,
      deviceScaleFactor: 2,
      mobile: true,
      touch: true,
    },
    {
      id: "iPad Air",
      label: t`iPad Air`,
      width: 820,
      height: 1180,
      deviceScaleFactor: 2,
      mobile: true,
      touch: true,
    },
    {
      id: "iPad Mini",
      label: t`iPad Mini`,
      width: 768,
      height: 1024,
      deviceScaleFactor: 2,
      mobile: true,
      touch: true,
    },
    {
      id: "Surface Duo",
      label: t`Surface Duo`,
      width: 540,
      height: 720,
      deviceScaleFactor: 2.5,
      mobile: true,
      touch: true,
    },
    {
      id: "iPhone 15 Pro Max",
      label: t`iPhone 15 Pro Max`,
      width: 430,
      height: 932,
      deviceScaleFactor: 3,
      mobile: true,
      touch: true,
    },
    {
      id: "Pixel 8",
      label: t`Pixel 8`,
      width: 412,
      height: 915,
      deviceScaleFactor: 2.625,
      mobile: true,
      touch: true,
    },
    {
      id: "iPhone 15 Pro",
      label: t`iPhone 15 Pro`,
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      mobile: true,
      touch: true,
    },
    {
      id: "Samsung Galaxy S24 Ultra",
      label: t`Samsung Galaxy S24 Ultra`,
      width: 412,
      height: 915,
      deviceScaleFactor: 3.5,
      mobile: true,
      touch: true,
    },
    {
      id: "iPhone SE",
      label: t`iPhone SE`,
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true,
      touch: true,
    },
  ];
  const scaleOptions = scaleValues.map((scale) => ({
    id: String(scale),
    label: `${Math.round(scale * 100)}%`,
  }));

  function update(nextEmulation: BrowserDeviceEmulation | null) {
    readBridge()
      .browserSetDeviceEmulation({ tabId: tab.tabId, emulation: nextEmulation })
      .catch(() => {});
  }

  function selectPreset(id: string) {
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    update({
      width: preset.width,
      height: preset.height,
      deviceScaleFactor: preset.deviceScaleFactor,
      scale: emulation.scale,
      mobile: preset.mobile,
      touch: preset.touch,
      preset: preset.id,
    });
  }

  function commitDimension(dimension: "width" | "height", draft: string) {
    const value = Number.parseInt(draft, 10);
    if (!Number.isInteger(value) || value < 240 || value > 7680) {
      if (dimension === "width") setWidthDraft(String(emulation.width));
      else setHeightDraft(String(emulation.height));
      return;
    }
    update({ ...emulation, [dimension]: value, preset: "Responsive" });
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-[var(--content-background)] px-2">
      <span className="shrink-0 text-xs text-muted">
        <Trans>Dimensions:</Trans>
      </span>
      <Select
        aria-label={t`Device preset`}
        className="w-40 shrink-0"
        options={presets}
        value={emulation.preset ?? "Responsive"}
        onChange={selectPreset}
      />
      <TextField
        aria-label={t`Viewport width`}
        className="w-16 shrink-0"
        value={widthDraft}
        onChange={setWidthDraft}
        onBlur={() => commitDimension("width", widthDraft)}
      >
        <Input
          type="number"
          min={240}
          max={7680}
          className="h-6 px-1.5 text-center text-xs tabular-nums"
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </TextField>
      <span className="shrink-0 text-xs text-muted" aria-hidden>
        ×
      </span>
      <TextField
        aria-label={t`Viewport height`}
        className="w-16 shrink-0"
        value={heightDraft}
        onChange={setHeightDraft}
        onBlur={() => commitDimension("height", heightDraft)}
      >
        <Input
          type="number"
          min={240}
          max={7680}
          className="h-6 px-1.5 text-center text-xs tabular-nums"
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </TextField>
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        className="size-6 min-w-0 shrink-0 p-0"
        aria-label={t`Rotate viewport`}
        onPress={() => update({ ...emulation, width: emulation.height, height: emulation.width })}
      >
        <RotateCw className="size-3.5" />
      </Button>
      <Select
        aria-label={t`Viewport scale`}
        className="w-20 shrink-0"
        options={scaleOptions}
        value={String(emulation.scale)}
        onChange={(value) => update({ ...emulation, scale: Number(value) })}
      />
      <div className="min-w-0 flex-1" />
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        className="size-6 min-w-0 shrink-0 p-0"
        aria-label={t`Close device toolbar`}
        onPress={() => update(null)}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
