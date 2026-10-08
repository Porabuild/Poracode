import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Select } from "@/renderer/components/common";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  listInstalledFontFamilies,
  supportsInstalledFonts,
} from "@/renderer/components/terminal/terminalFonts";
import { SettingRow } from "./SettingsForm";

export function TerminalFontSetting() {
  const { t } = useLingui();
  const family = useSharedSettings((state) => state.terminalFontFamily);
  const setFamily = useSharedSettings((state) => state.setTerminalFontFamily);
  const supported = supportsInstalledFonts();
  // Desktop permission is app-owned. Browsers must request access from a gesture.
  const native = hasClientCapability("nativeShell");
  const [families, setFamilies] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">(() =>
    supported && native ? "loading" : "idle",
  );

  useEffect(() => {
    if (!supported || !native) return;
    let cancelled = false;
    void listInstalledFontFamilies().then(
      (fonts) => {
        if (cancelled) return;
        setFamilies(fonts);
        setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [supported, native]);

  const loadFonts = async () => {
    setStatus("loading");
    try {
      setFamilies(await listInstalledFontFamilies());
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  };
  const savedMissing = family && !families.includes(family);
  const options = [
    { id: "default", label: t`Default` },
    ...families.map((name) => ({ id: `font:${name}`, label: name })),
    ...(savedMissing
      ? [
          {
            id: `font:${family}`,
            label: family,
            detail: status === "ready" ? t`Unavailable — using default` : t`Saved font`,
          },
        ]
      : []),
  ];

  return (
    <SettingRow
      anchorId="terminal.terminalFontFamily"
      title={t`Terminal font face`}
      description={
        <Trans>
          Font for agent terminals and the terminal panel. Missing fonts use the default.
        </Trans>
      }
    >
      <div className="flex flex-col items-end gap-2">
        <Select
          aria-label={t`Terminal font face`}
          className="w-[200px] shrink-0"
          options={options}
          value={family ? `font:${family}` : "default"}
          onChange={(value) => setFamily(value === "default" ? "" : value.slice(5))}
        />
        {supported && status !== "ready" && (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={status === "loading"}
            onPress={() => void loadFonts()}
          >
            {status === "loading" ? (
              <Trans>Loading fonts…</Trans>
            ) : (
              <Trans>Load installed fonts</Trans>
            )}
          </Button>
        )}
        {!supported && (
          <span className="text-xs text-muted">
            <Trans>Installed-font selection is unavailable in this client.</Trans>
          </span>
        )}
        {status === "failed" && (
          <span role="status" className="text-xs text-muted">
            <Trans>
              Could not access installed fonts. You can keep the saved font or use Default.
            </Trans>
          </span>
        )}
      </div>
    </SettingRow>
  );
}
