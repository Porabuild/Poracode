import { startTransition } from "react";
import { Switch } from "@heroui/react";
import type { TerminalPosition } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { fontSizeOptions, scrollSpeedOptions, terminalPositionOptions } from "./settingsOptions";

export function TerminalSettings() {
  const terminalPosition = useSharedSettings((state) => state.terminalPosition);
  const setTerminalPosition = useSharedSettings((state) => state.setTerminalPosition);
  const collapseTerminalComposer = useSharedSettings((state) => state.collapseTerminalComposer);
  const setCollapseTerminalComposer = useSharedSettings(
    (state) => state.setCollapseTerminalComposer,
  );
  const autoShowTerminalPanel = useSharedSettings((state) => state.autoShowTerminalPanel);
  const setAutoShowTerminalPanel = useSharedSettings((state) => state.setAutoShowTerminalPanel);
  const scrollSpeed = useSharedSettings((state) => state.scrollSpeed);
  const setScrollSpeed = useSharedSettings((state) => state.setScrollSpeed);
  const agentTerminalFontSize = useSharedSettings((state) => state.agentTerminalFontSize);
  const setAgentTerminalFontSize = useSharedSettings((state) => state.setAgentTerminalFontSize);
  const terminalPanelFontSize = useSharedSettings((state) => state.terminalPanelFontSize);
  const setTerminalPanelFontSize = useSharedSettings((state) => state.setTerminalPanelFontSize);

  return (
    <SettingsPage title="Terminal">
      <SettingRow title="Terminal position" description="Where the terminal panel appears.">
        <Select
          aria-label="Terminal position"
          className="w-[160px] shrink-0"
          options={terminalPositionOptions}
          value={terminalPosition}
          onChange={(value) => {
            startTransition(() => {
              setTerminalPosition(value as TerminalPosition);
            });
          }}
        />
      </SettingRow>

      <SettingRow
        title="Auto-show terminal panel"
        description="Automatically show the terminal panel when running commands or creating worktrees."
      >
        <Switch
          isSelected={autoShowTerminalPanel}
          onChange={(selected) => {
            startTransition(() => {
              setAutoShowTerminalPanel(selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <SettingRow
        title="Collapse terminal composer"
        description="Hide the composer by default in terminal-native threads."
      >
        <Switch
          isSelected={collapseTerminalComposer}
          onChange={(selected) => {
            startTransition(() => {
              setCollapseTerminalComposer(selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <SettingRow
        title="Agent terminal font size"
        description="Base font size for agent terminals. Auto-shrinks in narrow or short panes."
      >
        <Select
          aria-label="Agent terminal font size"
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
        title="Terminal panel font size"
        description="Base font size for the terminal panel. Auto-shrinks in narrow or short panes."
      >
        <Select
          aria-label="Terminal panel font size"
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
        title="Terminal scroll speed"
        description="Scroll speed multiplier for the terminal scrollback buffer."
      >
        <Select
          aria-label="Terminal scroll speed"
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
