import { startTransition } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { TerminalPosition } from "@/shared/contracts";
import type { CliPickerTarget } from "@/shared/settings";
import { isRemoteSession } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select, ToggleSwitch } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import {
  cliPickerTargetOptions,
  fontSizeOptions,
  scrollSpeedOptions,
  terminalPositionOptions,
  useLocalizedOptions,
} from "./settingsOptions";

export function TerminalSettings() {
  const { t } = useLingui();
  const terminalPosition = useSharedSettings((state) => state.terminalPosition);
  const setTerminalPosition = useSharedSettings((state) => state.setTerminalPosition);
  const collapseTerminalComposer = useSharedSettings((state) => state.collapseTerminalComposer);
  const setCollapseTerminalComposer = useSharedSettings(
    (state) => state.setCollapseTerminalComposer,
  );
  const cliPickerTarget = useSharedSettings((state) => state.cliPickerTarget);
  const setCliPickerTarget = useSharedSettings((state) => state.setCliPickerTarget);
  const autoShowTerminalPanel = useSharedSettings((state) => state.autoShowTerminalPanel);
  const setAutoShowTerminalPanel = useSharedSettings((state) => state.setAutoShowTerminalPanel);
  const scrollSpeed = useSharedSettings((state) => state.scrollSpeed);
  const setScrollSpeed = useSharedSettings((state) => state.setScrollSpeed);
  const agentTerminalFontSize = useSharedSettings((state) => state.agentTerminalFontSize);
  const setAgentTerminalFontSize = useSharedSettings((state) => state.setAgentTerminalFontSize);
  const terminalPanelFontSize = useSharedSettings((state) => state.terminalPanelFontSize);
  const setTerminalPanelFontSize = useSharedSettings((state) => state.setTerminalPanelFontSize);

  const terminalPositionOpts = useLocalizedOptions(terminalPositionOptions);
  const cliPickerTargetOpts = useLocalizedOptions(cliPickerTargetOptions);
  const remote = isRemoteSession();

  return (
    <SettingsPage title={t`Terminal`}>
      {!remote && (
        <SettingRow
          anchorId="terminal.terminalPosition"
          title={t`Terminal position`}
          description={<Trans>Where the terminal panel appears.</Trans>}
        >
          <Select
            aria-label={t`Terminal position`}
            className="w-[160px] shrink-0"
            options={terminalPositionOpts}
            value={terminalPosition}
            onChange={(value) => {
              startTransition(() => {
                setTerminalPosition(value as TerminalPosition);
              });
            }}
          />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="terminal.autoShowTerminalPanel"
          title={t`Auto-show terminal panel`}
          description={
            <Trans>
              Automatically show the terminal panel when running commands or creating worktrees.
            </Trans>
          }
        >
          <ToggleSwitch
            aria-label={t`Auto-show terminal panel`}
            isSelected={autoShowTerminalPanel}
            onChange={(selected) => {
              startTransition(() => {
                setAutoShowTerminalPanel(selected);
              });
            }}
          />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="terminal.collapseTerminalComposer"
          title={t`Collapse terminal composer`}
          description={
            <Trans>
              Start the composer collapsed in terminal-native threads. A collapsed composer routes
              browser element picks straight to the terminal.
            </Trans>
          }
        >
          <ToggleSwitch
            aria-label={t`Collapse terminal composer`}
            isSelected={collapseTerminalComposer}
            onChange={(selected) => {
              startTransition(() => {
                setCollapseTerminalComposer(selected);
              });
            }}
          />
        </SettingRow>
      )}

      {!remote && (
        <SettingRow
          anchorId="terminal.cliPickerTarget"
          title={t`Browser pick target (CLI threads)`}
          description={
            <Trans>
              Where a browser element-picker selection goes in terminal-native threads. A collapsed
              composer always routes to the terminal.
            </Trans>
          }
        >
          <Select
            aria-label={t`Browser pick target for CLI threads`}
            className="w-[160px] shrink-0"
            options={cliPickerTargetOpts}
            value={cliPickerTarget}
            onChange={(value) => {
              startTransition(() => {
                setCliPickerTarget(value as CliPickerTarget);
              });
            }}
          />
        </SettingRow>
      )}

      <SettingRow
        anchorId="terminal.agentTerminalFontSize"
        title={t`Agent terminal font size`}
        description={
          <Trans>Base font size for agent terminals. Auto-shrinks in narrow or short panes.</Trans>
        }
      >
        <Select
          aria-label={t`Agent terminal font size`}
          className="w-[160px] shrink-0"
          options={fontSizeOptions}
          value={String(agentTerminalFontSize)}
          onChange={(value) => {
            startTransition(() => {
              setAgentTerminalFontSize(Number.parseInt(value, 10) || 12);
            });
          }}
        />
      </SettingRow>

      <SettingRow
        anchorId="terminal.terminalPanelFontSize"
        title={t`Terminal panel font size`}
        description={
          <Trans>
            Base font size for the terminal panel. Auto-shrinks in narrow or short panes.
          </Trans>
        }
      >
        <Select
          aria-label={t`Terminal panel font size`}
          className="w-[160px] shrink-0"
          options={fontSizeOptions}
          value={String(terminalPanelFontSize)}
          onChange={(value) => {
            startTransition(() => {
              setTerminalPanelFontSize(Number.parseInt(value, 10) || 11);
            });
          }}
        />
      </SettingRow>

      <SettingRow
        anchorId="terminal.scrollSpeed"
        title={t`Terminal scroll speed`}
        description={<Trans>Scroll speed multiplier for the terminal scrollback buffer.</Trans>}
      >
        <Select
          aria-label={t`Terminal scroll speed`}
          className="w-[160px] shrink-0"
          options={scrollSpeedOptions}
          value={String(scrollSpeed)}
          onChange={(value) => {
            startTransition(() => {
              setScrollSpeed(Number.parseInt(value, 10) || 2);
            });
          }}
        />
      </SettingRow>
    </SettingsPage>
  );
}
