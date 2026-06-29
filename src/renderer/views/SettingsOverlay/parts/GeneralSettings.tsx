import { startTransition } from "react";
import { Switch } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { NewThreadMode } from "@/shared/contracts";
import { isRemoteSession } from "@/renderer/bridge";
import type { AiContentLanguage, LocaleSetting } from "@/shared/locale";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { aiLanguageOptions, localeOptions } from "@/renderer/i18n/locales";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { newThreadModeOptions, useLocalizedOptions } from "./settingsOptions";

export function GeneralSettings() {
  const { t } = useLingui();
  const locale = useSharedSettings((state) => state.locale);
  const setLocale = useSharedSettings((state) => state.setLocale);
  const gitTextLanguage = useSharedSettings((state) => state.gitTextLanguage);
  const setGitTextLanguage = useSharedSettings((state) => state.setGitTextLanguage);
  const preventSleepWhileWorking = useSharedSettings((state) => state.preventSleepWhileWorking);
  const setPreventSleepWhileWorking = useSharedSettings(
    (state) => state.setPreventSleepWhileWorking,
  );
  const closeToTray = useSharedSettings((state) => state.closeToTray);
  const setCloseToTray = useSharedSettings((state) => state.setCloseToTray);
  const newThreadMode = useSharedSettings((state) => state.newThreadMode);
  const setNewThreadMode = useSharedSettings((state) => state.setNewThreadMode);
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const setHomeScopeEnabled = useSharedSettings((state) => state.setHomeScopeEnabled);
  const editorLspEnabled = useSharedSettings((state) => state.editorLspEnabled);
  const setEditorLspEnabled = useSharedSettings((state) => state.setEditorLspEnabled);
  // System sleep and tray behavior belong to the desktop OS; a remote session
  // can't affect them, so hide the rows there.
  const remote = isRemoteSession();

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
        description={<Trans>Choose the display language for Lightcode's interface.</Trans>}
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

      {!remote && (
        <SettingRow
          anchorId="general.homeScope"
          title={t`Home scope`}
          description={<Trans>Show a projectless Home scope for OS-level agent sessions.</Trans>}
        >
          <Switch
            isSelected={homeScopeEnabled}
            onChange={(selected) => {
              startTransition(() => {
                setHomeScopeEnabled(selected);
              });
            }}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="general.preventSleepWhileWorking"
          title={t`Prevent sleep while working`}
          description={<Trans>Keep the system awake while any thread is actively working.</Trans>}
        >
          <Switch
            isSelected={preventSleepWhileWorking}
            onChange={(selected) => {
              startTransition(() => {
                setPreventSleepWhileWorking(selected);
              });
            }}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="general.closeToTray"
          title={t`Close to tray`}
          description={
            <Trans>
              When you close the window, keep Lightcode running in the system tray. Disable to quit
              on close.
            </Trans>
          }
        >
          <Switch
            isSelected={closeToTray}
            onChange={(selected) => {
              startTransition(() => {
                setCloseToTray(selected);
              });
            }}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
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
          <Switch
            isSelected={editorLspEnabled}
            onChange={(selected) => {
              startTransition(() => {
                setEditorLspEnabled(selected);
              });
            }}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </SettingRow>
      )}
    </SettingsPage>
  );
}
