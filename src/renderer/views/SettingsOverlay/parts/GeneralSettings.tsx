import { startTransition } from "react";
import { NumberField, Switch } from "@heroui/react";
import type {
  GitReviewMode,
  NewThreadMode,
  TerminalPosition,
  ThemeMode,
  ThreadRemoveAction,
} from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select } from "@/renderer/components/common";

const themeOptions = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

const terminalPositionOptions = [
  { id: "right", label: "Right" },
  { id: "bottom", label: "Bottom" },
] as const;

const threadRemoveActionOptions = [
  { id: "archive", label: "Archive" },
  { id: "delete", label: "Delete" },
] as const;

const newThreadModeOptions = [
  { id: "page", label: "Page" },
  { id: "panel", label: "Panel" },
] as const;

const gitReviewModeOptions = [
  { id: "panel", label: "Panel" },
  { id: "page", label: "Page" },
] as const;

const scrollSpeedOptions = Array.from({ length: 10 }, (_, i) => ({
  id: String(i + 1),
  label: `${i + 1}x`,
})) as readonly { id: string; label: string }[];

const fontSizeOptions = Array.from({ length: 13 }, (_, i) => ({
  id: String(i + 8),
  label: `${i + 8}px`,
})) as readonly { id: string; label: string }[];

export function GeneralSettings() {
  const themeMode = useSharedSettings((state) => state.themeMode);
  const setThemeMode = useSharedSettings((state) => state.setThemeMode);
  const terminalPosition = useSharedSettings((state) => state.terminalPosition);
  const setTerminalPosition = useSharedSettings((state) => state.setTerminalPosition);
  const collapseTerminalComposer = useSharedSettings((state) => state.collapseTerminalComposer);
  const setCollapseTerminalComposer = useSharedSettings(
    (state) => state.setCollapseTerminalComposer,
  );
  const autoShowTerminalPanel = useSharedSettings((state) => state.autoShowTerminalPanel);
  const setAutoShowTerminalPanel = useSharedSettings((state) => state.setAutoShowTerminalPanel);
  const staleThreadUnloadMinutes = useSharedSettings((state) => state.staleThreadUnloadMinutes);
  const setStaleThreadUnloadMinutes = useSharedSettings(
    (state) => state.setStaleThreadUnloadMinutes,
  );
  const autoArchiveDoneAfterDays = useSharedSettings((state) => state.autoArchiveDoneAfterDays);
  const setAutoArchiveDoneAfterDays = useSharedSettings(
    (state) => state.setAutoArchiveDoneAfterDays,
  );
  const scrollSpeed = useSharedSettings((state) => state.scrollSpeed);
  const setScrollSpeed = useSharedSettings((state) => state.setScrollSpeed);
  const agentTerminalFontSize = useSharedSettings((state) => state.agentTerminalFontSize);
  const setAgentTerminalFontSize = useSharedSettings((state) => state.setAgentTerminalFontSize);
  const guiChatFontSize = useSharedSettings((state) => state.guiChatFontSize);
  const setGuiChatFontSize = useSharedSettings((state) => state.setGuiChatFontSize);
  const terminalPanelFontSize = useSharedSettings((state) => state.terminalPanelFontSize);
  const setTerminalPanelFontSize = useSharedSettings((state) => state.setTerminalPanelFontSize);
  const preventSleepWhileWorking = useSharedSettings((state) => state.preventSleepWhileWorking);
  const setPreventSleepWhileWorking = useSharedSettings(
    (state) => state.setPreventSleepWhileWorking,
  );
  const closeToTray = useSharedSettings((state) => state.closeToTray);
  const setCloseToTray = useSharedSettings((state) => state.setCloseToTray);
  const threadRemoveAction = useSharedSettings((state) => state.threadRemoveAction);
  const setThreadRemoveAction = useSharedSettings((state) => state.setThreadRemoveAction);
  const newThreadMode = useSharedSettings((state) => state.newThreadMode);
  const setNewThreadMode = useSharedSettings((state) => state.setNewThreadMode);
  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const setHomeScopeEnabled = useSharedSettings((state) => state.setHomeScopeEnabled);
  const gitReviewMode = useSharedSettings((state) => state.gitReviewMode);
  const setGitReviewMode = useSharedSettings((state) => state.setGitReviewMode);
  const editorLspEnabled = useSharedSettings((state) => state.editorLspEnabled);
  const setEditorLspEnabled = useSharedSettings((state) => state.setEditorLspEnabled);

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
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

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Terminal position</p>
              <p className="text-xs text-muted">Where the terminal panel appears.</p>
            </div>
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
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Auto-show terminal panel</p>
              <p className="text-xs text-muted">
                Automatically show the terminal panel when running commands or creating worktrees.
              </p>
            </div>
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
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Collapse terminal composer</p>
              <p className="text-xs text-muted">
                Hide the composer by default in terminal-native threads.
              </p>
            </div>
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
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Unload idle threads after</p>
              <p className="text-xs text-muted">
                Hidden resumable threads are swept every 5 minutes and unloaded after this idle age.
              </p>
            </div>
            <NumberField
              aria-label="Unload idle threads after (minutes)"
              className="w-[160px] shrink-0"
              minValue={0}
              step={10}
              value={staleThreadUnloadMinutes}
              onChange={(value) => {
                if (value === undefined || Number.isNaN(value)) return;
                startTransition(() => {
                  setStaleThreadUnloadMinutes(Math.max(0, Math.floor(value)));
                });
              }}
            >
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Auto-archive done threads after</p>
              <p className="text-xs text-muted">
                Threads marked done that haven&apos;t been touched for this many days are archived
                automatically on app launch. Set to 0 to disable.
              </p>
            </div>
            <NumberField
              aria-label="Auto-archive done threads after (days)"
              className="w-[160px] shrink-0"
              minValue={0}
              maxValue={3650}
              step={1}
              value={autoArchiveDoneAfterDays}
              onChange={(value) => {
                if (Number.isNaN(value)) return;
                startTransition(() => {
                  setAutoArchiveDoneAfterDays(Math.max(0, Math.floor(value)));
                });
              }}
            >
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Agent terminal font size</p>
              <p className="text-xs text-muted">
                Base font size for agent terminals. Auto-shrinks in narrow or short panes.
              </p>
            </div>
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
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">GUI chat font size</p>
              <p className="text-xs text-muted">
                Agent chat (ACP / markdown). Command rows use this size minus 1&nbsp;px; tool and
                plan lines minus 2&nbsp;px.
              </p>
            </div>
            <Select
              aria-label="GUI chat font size"
              className="w-[160px] shrink-0"
              options={fontSizeOptions}
              value={String(guiChatFontSize)}
              onChange={(value) => {
                startTransition(() => {
                  setGuiChatFontSize(Number.parseInt(value, 10) || 13);
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Terminal panel font size</p>
              <p className="text-xs text-muted">
                Base font size for the terminal panel. Auto-shrinks in narrow or short panes.
              </p>
            </div>
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
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Terminal scroll speed</p>
              <p className="text-xs text-muted">
                Scroll speed multiplier for the terminal scrollback buffer.
              </p>
            </div>
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
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Prevent sleep while working</p>
              <p className="text-xs text-muted">
                Keep the system awake while any thread is actively working.
              </p>
            </div>
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
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Close to tray</p>
              <p className="text-xs text-muted">
                When you close the window, keep Lightcode running in the system tray. Disable to
                quit on close.
              </p>
            </div>
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
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Default thread removal</p>
              <p className="text-xs text-muted">
                Action for the quick-remove button on sidebar threads.
              </p>
            </div>
            <Select
              aria-label="Default thread removal"
              className="w-[160px] shrink-0"
              options={threadRemoveActionOptions}
              value={threadRemoveAction}
              onChange={(value) => {
                startTransition(() => {
                  setThreadRemoveAction(value as ThreadRemoveAction);
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Default new thread</p>
              <p className="text-xs text-muted">
                Open new threads as a full page or a side-by-side panel.
              </p>
            </div>
            <Select
              aria-label="Default new thread"
              className="w-[160px] shrink-0"
              options={newThreadModeOptions}
              value={newThreadMode}
              onChange={(value) => {
                startTransition(() => {
                  setNewThreadMode(value as NewThreadMode);
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Home scope</p>
              <p className="text-xs text-muted">
                Show a projectless Home scope for OS-level agent sessions.
              </p>
            </div>
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
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Git review mode</p>
              <p className="text-xs text-muted">
                Open git review as a right-side panel or a full page.
              </p>
            </div>
            <Select
              aria-label="Git review mode"
              className="w-[160px] shrink-0"
              options={gitReviewModeOptions}
              value={gitReviewMode}
              onChange={(value) => {
                startTransition(() => {
                  setGitReviewMode(value as GitReviewMode);
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Editor LSP</p>
              <p className="text-xs text-muted">
                Enable language server support for type checking, completions, and diagnostics.
                Requires a language server installed (e.g. typescript-language-server).
              </p>
            </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
