import { ArrowLeft, Settings2 } from "lucide-react";
import { startTransition, useState } from "react";
import type { ThemeMode } from "../../../shared/contracts";
import { useAppStore } from "../../state/appStore";
import { Select } from "../common";
import { AppShell } from "../layout/AppShell";

const themeOptions = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

type SettingsSection = "general";

function SettingsSidebar(props: {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
}) {
  const { activeSection, onSectionChange, onClose } = props;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 pb-3 pt-0">
      <div className="space-y-1">
        <button
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1 text-left transition-colors hover:bg-white/[0.04]"
          onClick={onClose}
          type="button"
        >
          <div className="flex size-6 items-center justify-center rounded-full border border-white/8 bg-white/[0.03]">
            <ArrowLeft className="size-3 text-muted" />
          </div>
          <p className="truncate text-sm font-medium text-foreground">Return to app</p>
        </button>
      </div>

      <div className="flex items-center justify-between px-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Settings</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pr-0.5">
        <div className="space-y-0.5">
          <button
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
              activeSection === "general"
                ? "bg-white/[0.08] text-foreground"
                : "text-muted hover:bg-white/[0.04] hover:text-foreground"
            }`}
            onClick={() => onSectionChange("general")}
            type="button"
          >
            <Settings2 className="size-4" />
            <span>General</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);

  return (
    <div className="h-full min-h-0 overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">General</h1>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Theme</p>
              <p className="text-xs text-muted">Choose how Lightcode looks.</p>
            </div>
            <Select
              aria-label="Theme"
              className="w-[160px] shrink-0"
              options={themeOptions}
              value={themeMode}
              onChange={(value) => {
                startTransition(() => {
                  setThemeMode(value as ThemeMode);
                });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <AppShell
        sidebar={
          <SettingsSidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            onClose={onClose}
          />
        }
        content={activeSection === "general" ? <GeneralSettings /> : null}
      />
    </div>
  );
}
