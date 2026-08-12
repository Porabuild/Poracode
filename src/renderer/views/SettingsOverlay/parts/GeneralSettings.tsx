import { startTransition } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { NewThreadMode } from "@/shared/contracts";
import { isRemoteSession, isWindows } from "@/renderer/bridge";
import type { AiContentLanguage, LocaleSetting } from "@/shared/locale";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { aiLanguageOptions, localeOptions } from "@/renderer/i18n/locales";
import { Button } from "@heroui/react";
import { LightballTabs, Select, ToggleSwitch } from "@/renderer/components/common";
import { isIosInstallBrowser, promptInstall, useCanInstall } from "@/renderer/pwa/install";
import type { PreventSleep } from "@/shared/settings";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { newThreadModeOptions, useLocalizedOptions } from "./settingsOptions";
import { SidebarShortcutsSelector } from "./SidebarShortcutsSelector";

export function GeneralSettings() {
  const { t } = useLingui();
  const locale = useSharedSettings((state) => state.locale);
  const setLocale = useSharedSettings((state) => state.setLocale);
  const gitTextLanguage = useSharedSettings((state) => state.gitTextLanguage);
  const setGitTextLanguage = useSharedSettings((state) => state.setGitTextLanguage);
  const preventSleep = useSharedSettings((state) => state.preventSleep);
  const setPreventSleep = useSharedSettings((state) => state.setPreventSleep);
  const closeToTray = useSharedSettings((state) => state.closeToTray);
  const setCloseToTray = useSharedSettings((state) => state.setCloseToTray);
  const launchAtStartup = useSharedSettings((state) => state.launchAtStartup);
  const setLaunchAtStartup = useSharedSettings((state) => state.setLaunchAtStartup);
  const startMinimized = useSharedSettings((state) => state.startMinimized);
  const setStartMinimized = useSharedSettings((state) => state.setStartMinimized);
  const newThreadMode = useSharedSettings((state) => state.newThreadMode);
  const setNewThreadMode = useSharedSettings((state) => state.setNewThreadMode);
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const setHomeScopeEnabled = useSharedSettings((state) => state.setHomeScopeEnabled);
  const editorLspEnabled = useSharedSettings((state) => state.editorLspEnabled);
  const setEditorLspEnabled = useSharedSettings((state) => state.setEditorLspEnabled);
  // System sleep and tray behavior belong to the desktop OS; a remote session
  // can't affect them, so hide the rows there.
  const remote = isRemoteSession();
  const windows = !remote && isWindows();
  const canInstallApp = useCanInstall();
  const showIosInstallHelp = remote && isIosInstallBrowser();

  const newThreadOptions = useLocalizedOptions(newThreadModeOptions);
  const resolvedLocaleOptions = localeOptions.map((option) => ({
    id: option.id,
    label: typeof option.label === "string" ? option.label : t(option.label),
  }));
  const resolvedAiLanguageOptions = aiLanguageOptions.map((option) => ({
    id: option.id,
    label: typeof option.label === "string" ? option.label : t(option.label),
  }));
  return (
    <SettingsPage title={t`General`}>
      <SettingRow
        anchorId="general.language"
        title={t`Language`}
        description={<Trans>Choose the display language for Poracode's interface.</Trans>}
      >
        <Select
          aria-label={t`Language`}
          className="w-[160px] shrink-0"
          options={resolvedLocaleOptions}
          value={locale}
          onChange={(value) => {
            startTransition(() => {
              setLocale(value as LocaleSetting);
            });
          }}
        />
      </SettingRow>

      {remote && (canInstallApp || showIosInstallHelp) ? (
        <SettingRow
          title={t`Install app`}
          description={
            showIosInstallHelp ? (
              <Trans>In Safari, tap Share, then Add to Home Screen.</Trans>
            ) : (
              <Trans>Install Poracode for faster access and offline launch.</Trans>
            )
          }
        >
          {canInstallApp ? (
            <Button variant="tertiary" size="sm" onPress={() => void promptInstall()}>
              <Trans>Install</Trans>
            </Button>
          ) : (
            <span />
          )}
        </SettingRow>
      ) : null}

      <SettingRow
        anchorId="general.commitPrLanguage"
        title={t`Commit & PR language`}
        description={
          <Trans>
            Language for AI-generated commit messages and pull request summaries. Thread titles
            always follow the app language.
          </Trans>
        }
      >
        <Select
          aria-label={t`Commit & PR language`}
          className="w-[160px] shrink-0"
          options={resolvedAiLanguageOptions}
          value={gitTextLanguage}
          onChange={(value) => setGitTextLanguage(value as AiContentLanguage)}
        />
      </SettingRow>

      {!remote && (
        <SettingRow
          anchorId="general.defaultNewThread"
          title={t`Default new thread`}
          description={<Trans>Open new threads as a full page or a side-by-side panel.</Trans>}
        >
          <Select
            aria-label={t`Default new thread`}
            className="w-[160px] shrink-0"
            options={newThreadOptions}
            value={newThreadMode}
            onChange={(value) => {
              startTransition(() => {
                setNewThreadMode(value as NewThreadMode);
              });
            }}
          />
        </SettingRow>
      )}

      {windows && (
        <SettingRow
          anchorId="general.launchAtStartup"
          title={t`Launch at startup`}
          description={<Trans>Launch Poracode automatically when you sign in to Windows.</Trans>}
        >
          <ToggleSwitch
            aria-label={t`Launch at startup`}
            isSelected={launchAtStartup}
            onChange={(selected) => {
              startTransition(() => {
                setLaunchAtStartup(selected);
              });
            }}
          />
        </SettingRow>
      )}

      {windows && (
        <SettingRow
          anchorId="general.startMinimized"
          title={t`Start minimized`}
          description={<Trans>Keep Poracode in the system tray when it launches at startup.</Trans>}
        >
          <ToggleSwitch
            aria-label={t`Start minimized`}
            isSelected={startMinimized}
            onChange={(selected) => {
              startTransition(() => {
                setStartMinimized(selected);
              });
            }}
          />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="general.homeScope"
          title={t`Home scope`}
          description={<Trans>Show a projectless Home scope for OS-level agent sessions.</Trans>}
        >
          <ToggleSwitch
            aria-label={t`Home scope`}
            isSelected={homeScopeEnabled}
            onChange={(selected) => {
              startTransition(() => {
                setHomeScopeEnabled(selected);
              });
            }}
          />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="general.sidebarShortcuts"
          title={t`Sidebar shortcuts`}
          description={<Trans>Choose which shortcuts appear in the sidebar footer.</Trans>}
        >
          <SidebarShortcutsSelector />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="general.preventSleep"
          title={t`Prevent sleep`}
          description={<Trans>Choose when this machine stays awake.</Trans>}
        >
          <LightballTabs
            tabs={[
              { id: "while-working", label: t`While working` },
              { id: "while-remote-access", label: t`Remote access` },
              { id: "always", label: t`Always` },
            ]}
            active={preventSleep}
            onChange={(value: PreventSleep) => {
              startTransition(() => {
                setPreventSleep(value);
              });
            }}
            ariaLabel={t`Prevent sleep`}
          />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="general.closeToTray"
          title={t`Close to tray`}
          description={
            <Trans>
              When you close the window, keep Poracode running in the system tray. Disable to quit
              on close.
            </Trans>
          }
        >
          <ToggleSwitch
            aria-label={t`Close to tray`}
            isSelected={closeToTray}
            onChange={(selected) => {
              startTransition(() => {
                setCloseToTray(selected);
              });
            }}
          />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="general.editorLsp"
          title={t`Editor LSP`}
          description={
            <Trans>
              Enable language server support for type checking, completions, and diagnostics.
              Requires a language server installed.
            </Trans>
          }
        >
          <ToggleSwitch
            aria-label={t`Editor LSP`}
            isSelected={editorLspEnabled}
            onChange={(selected) => {
              startTransition(() => {
                setEditorLspEnabled(selected);
              });
            }}
          />
        </SettingRow>
      )}
    </SettingsPage>
  );
}
