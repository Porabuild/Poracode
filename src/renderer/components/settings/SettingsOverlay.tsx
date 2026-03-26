import { ArrowLeft, PanelLeft, PanelLeftClose, Settings2 } from "lucide-react";
import { startTransition, useState } from "react";
import type { ThemeMode } from "../../../shared/contracts";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { Select, SidebarButton } from "../common";
import { AppShell, useSidebar } from "../layout/AppShell";

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
  const { isCollapsed, collapse, expand } = useSidebar();

  return (
    <div className="relative h-full">
      {/* Collapsed icon rail */}
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            <SidebarButton
              iconOnly
              icon={<Settings2 className="size-4" />}
              label="General"
              isActive={activeSection === "general"}
              onPress={() => onSectionChange("general")}
            />
          </div>

          <div className="space-y-1 border-t border-white/6 pt-2 pr-2">
            <SidebarButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label="Return to app"
              onPress={onClose}
            />
            <SidebarButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label="Show sidebar"
              onPress={expand}
            />
          </div>
        </div>
      )}

      {/* Expanded sidebar */}
      <div
        className={`flex h-full min-h-0 flex-col gap-3 px-3 pb-1 pt-0 transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
      >
        <div className="flex items-center justify-between px-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Settings</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1 pr-0.5">
          <div className="space-y-0.5">
            <SidebarButton
              icon={<Settings2 className="size-4" />}
              label="General"
              isActive={activeSection === "general"}
              onPress={() => onSectionChange("general")}
            />
          </div>
        </div>

        <div className="space-y-1 border-t border-white/6 pt-2">
          <SidebarButton
            icon={<ArrowLeft className="size-4" />}
            label="Return to app"
            onPress={onClose}
          />
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label="Hide sidebar"
            onPress={collapse}
          />
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const themeMode = useSharedSettings((state) => state.themeMode);
  const setThemeMode = useSharedSettings((state) => state.setThemeMode);

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
