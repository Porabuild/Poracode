import { startTransition } from "react";
import { Switch } from "@heroui/react";
import { Select } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { BrowserLinkOpenTarget, BrowserLinkPresentationMode } from "@/shared/settings";

const linkOpenTargetOptions = [
  { id: "internal", label: "App Browser" },
  { id: "system", label: "System Browser" },
] as const;

const linkPresentationModeOptions = [
  { id: "panel", label: "Right panel" },
  { id: "overlay", label: "Fullscreen overlay" },
] as const;

export function BrowserSettings() {
  const allowEval = useSharedSettings((s) => s.browser.allowEval);
  const allowDataAccess = useSharedSettings((s) => s.browser.allowDataAccess);
  const linkOpenTarget = useSharedSettings((s) => s.browser.linkOpenTarget);
  const linkPresentationMode = useSharedSettings((s) => s.browser.linkPresentationMode);
  const setBrowserSetting = useSharedSettings((s) => s.setBrowserSetting);

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Browser</h1>

        <div className="space-y-4">
          <SettingRow
            title="Open links in"
            description="Choose whether links from Lightcode and browser popups stay in Lightcode or open externally."
          >
            <Select
              aria-label="Open links in"
              className="w-[180px] shrink-0"
              options={linkOpenTargetOptions}
              value={linkOpenTarget}
              onChange={(value) => {
                startTransition(() => {
                  setBrowserSetting("linkOpenTarget", value as BrowserLinkOpenTarget);
                });
              }}
            />
          </SettingRow>
          <SettingRow
            title="Show opened links in"
            description="When links open in a Lightcode browser tab, choose where the browser is revealed."
          >
            <Select
              aria-label="Show opened links in"
              className="w-[180px] shrink-0"
              options={linkPresentationModeOptions}
              value={linkPresentationMode}
              onChange={(value) => {
                startTransition(() => {
                  setBrowserSetting("linkPresentationMode", value as BrowserLinkPresentationMode);
                });
              }}
            />
          </SettingRow>
          <SettingRow
            title="Allow eval"
            description={
              <>
                Lets agents call <code>eval</code> to run arbitrary JavaScript inside the embedded
                page. Off by default — turn on only when you trust the loaded sites and the agent.
              </>
            }
          >
            <Switch
              isSelected={allowEval}
              onChange={(selected) => {
                startTransition(() => {
                  setBrowserSetting("allowEval", selected);
                });
              }}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </SettingRow>
          <SettingRow
            title="Allow agents to read/write cookies and storage"
            description={
              <>
                Enables <code>cookies</code> and <code>storage</code>. Cookies can contain session
                tokens and storage often holds auth state — only enable when you trust both the
                agent and the sites it visits.
              </>
            }
          >
            <Switch
              isSelected={allowDataAccess}
              onChange={(selected) => {
                startTransition(() => {
                  setBrowserSetting("allowDataAccess", selected);
                });
              }}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

function SettingRow(props: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <p className="text-xs text-muted">{props.description}</p>
      </div>
      {props.children}
    </div>
  );
}
