import { startTransition, useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { TerminalPosition } from "@/shared/contracts";
import {
  WINDOWS_SHELL_AUTO,
  type AvailableWindowsShell,
  type CliPickerTarget,
} from "@/shared/settings";
import { isRemoteSession, isWindows, readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  ToggleSwitch,
} from "@/renderer/components/common";
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
  const windowsShellPath = useSharedSettings((state) => state.windowsShellPath);
  const setWindowsShellPath = useSharedSettings((state) => state.setWindowsShellPath);
  const windowsInternalShellPath = useSharedSettings((state) => state.windowsInternalShellPath);
  const setWindowsInternalShellPath = useSharedSettings(
    (state) => state.setWindowsInternalShellPath,
  );
  const windowsShellArguments = useSharedSettings((state) => state.windowsShellArguments);
  const setWindowsShellArguments = useSharedSettings((state) => state.setWindowsShellArguments);
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
  const windows = !remote && isWindows();
  const [availableWindowsShells, setAvailableWindowsShells] = useState<
    AvailableWindowsShell[] | null
  >(null);

  useEffect(() => {
    if (!windows) return;
    let cancelled = false;
    void readBridge()
      .getAvailableWindowsShells()
      .then((shells) => {
        if (!cancelled) setAvailableWindowsShells(shells);
      })
      .catch(() => {
        if (!cancelled) setAvailableWindowsShells([]);
      });
    return () => {
      cancelled = true;
    };
  }, [windows]);

  const shellOptionLabel = (shell: AvailableWindowsShell, recommended: boolean) => {
    switch (shell.kind) {
      case "pwsh": {
        const version = shell.version ?? "7";
        return recommended ? t`PowerShell ${version} (recommended)` : t`PowerShell ${version}`;
      }
      case "powershell":
        return t`Windows PowerShell 5.1`;
      case "cmd":
        return t`Command Prompt`;
    }
  };
  const detectedWindowsShells = availableWindowsShells ?? [];
  const shellsReady = availableWindowsShells !== null;
  const buildShellControl = (configuredPath: string, shells: AvailableWindowsShell[]) => {
    const selectedShell = shells.find(
      (shell) => shell.path.toLowerCase() === configuredPath.toLowerCase(),
    );
    const savedOption =
      shellsReady && configuredPath !== WINDOWS_SHELL_AUTO && !selectedShell
        ? { id: configuredPath, label: t`Saved shell`, detail: configuredPath }
        : undefined;
    return {
      options: [
        ...shells.map((shell, index) => ({
          id: shell.path,
          label: shellOptionLabel(shell, index === 0 && shell.kind === "pwsh"),
          detail: shell.path,
        })),
        ...(savedOption ? [savedOption] : []),
      ],
      value:
        selectedShell?.path ??
        (configuredPath === WINDOWS_SHELL_AUTO ? shells[0]?.path : configuredPath) ??
        null,
    };
  };
  const terminalShellControl = buildShellControl(windowsShellPath, detectedWindowsShells);
  const internalShellControl = buildShellControl(
    windowsInternalShellPath,
    detectedWindowsShells.filter((shell) => shell.kind !== "cmd"),
  );

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

      {windows && (
        <Card
          variant="transparent"
          className="items-stretch gap-4 rounded-none border-y border-[var(--hairline)] px-0 py-4"
        >
          <CardHeader className="gap-1 px-0">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t`Windows shells`}
            </CardTitle>
            <CardDescription className="text-xs">
              <Trans>Choose shells for the Terminal panel and Poracode's internal commands.</Trans>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <SettingRow
              anchorId="terminal.windowsShell"
              title={t`Terminal panel shell`}
              description={<Trans>Used for new interactive Terminal-panel sessions.</Trans>}
            >
              <Select
                aria-label={t`Terminal panel shell`}
                className="w-[320px] shrink-0"
                isDisabled={!shellsReady || terminalShellControl.options.length === 0}
                options={terminalShellControl.options}
                value={terminalShellControl.value}
                onChange={setWindowsShellPath}
              />
            </SettingRow>

            <SettingRow
              anchorId="terminal.windowsInternalShell"
              title={t`Internal commands and agents`}
              description={
                <Trans>
                  Used for agents, authentication, installs, and Poracode's internal commands.
                </Trans>
              }
            >
              <Select
                aria-label={t`Internal commands and agents`}
                className="w-[320px] shrink-0"
                isDisabled={!shellsReady || internalShellControl.options.length === 0}
                options={internalShellControl.options}
                value={internalShellControl.value}
                onChange={setWindowsInternalShellPath}
              />
            </SettingRow>

            <SettingRow
              anchorId="terminal.windowsShellArguments"
              title={t`Terminal shell arguments`}
              description={
                <Trans>
                  Additional arguments passed to each new Terminal-panel shell. Quote values
                  containing spaces.
                </Trans>
              }
            >
              <Input
                aria-label={t`Terminal shell arguments`}
                className="w-[320px] shrink-0 font-mono text-xs"
                placeholder={t`e.g. -NoProfile`}
                value={windowsShellArguments}
                onChange={(event) => setWindowsShellArguments(event.currentTarget.value)}
              />
            </SettingRow>
          </CardContent>
        </Card>
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
