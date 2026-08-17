import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Plus, RotateCcw, X } from "lucide-react";
import {
  CODEX_CONTEXT_WINDOWS_SETTING_KEY,
  contextWindowsEqual,
  DEFAULT_CODEX_CONTEXT_WINDOWS,
  parseContextWindowInput,
  resolveCodexContextWindows,
  serializeContextWindows,
  type CodexContextWindow,
} from "@/shared/agents/codexContextWindows";
import { Input } from "@/renderer/components/common";
import { readBridge } from "@/renderer/bridge";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { friendlyError } from "@/shared/messages";

export function CodexProviderSettings(props: { agentKind: string; wslDistros: string[] }) {
  const { t } = useLingui();
  const { agentKind, wslDistros } = props;
  const stored = useSharedSettings((state) => state.agentSettings[agentKind]);
  const setAgentSetting = useSharedSettings((state) => state.setAgentSetting);
  const windows = resolveCodexContextWindows(stored);
  const [draft, setDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<string | undefined>();
  const isBusy = pendingAction !== undefined;
  const isDefaultList = contextWindowsEqual(windows, DEFAULT_CODEX_CONTEXT_WINDOWS);

  const persist = async (next: CodexContextWindow[], action: string) => {
    setPendingAction(action);
    const previous = stored?.[CODEX_CONTEXT_WINDOWS_SETTING_KEY];
    setAgentSetting(agentKind, CODEX_CONTEXT_WINDOWS_SETTING_KEY, serializeContextWindows(next));
    try {
      await flushSharedSettings();
      await readBridge().refreshAgentStatuses(wslDistros, { agentKinds: [agentKind] });
    } catch (error) {
      if (typeof previous === "string") {
        setAgentSetting(agentKind, CODEX_CONTEXT_WINDOWS_SETTING_KEY, previous);
      } else {
        setAgentSetting(
          agentKind,
          CODEX_CONTEXT_WINDOWS_SETTING_KEY,
          serializeContextWindows(DEFAULT_CODEX_CONTEXT_WINDOWS),
        );
      }
      toast.danger(friendlyError(error));
    } finally {
      setPendingAction(undefined);
    }
  };

  const addWindow = () => {
    if (!draft.trim()) return;
    const parsed = parseContextWindowInput(draft);
    if (!parsed) {
      toast.warning(t`Enter a size like 512k or 1m.`);
      return;
    }
    if (windows.some((window) => window.tokens === parsed.tokens)) {
      toast.warning(t`${parsed.label} is already in the list.`);
      return;
    }
    const next = [...windows, parsed].sort((left, right) => left.tokens - right.tokens);
    setDraft("");
    void persist(next, "add");
  };

  const removeWindow = (id: string) => {
    if (windows.length <= 1) return;
    void persist(
      windows.filter((window) => window.id !== id),
      `remove:${id}`,
    );
  };

  return (
    <div className="border-t border-border/10 pt-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Context windows</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>
              Sizes shown in the Codex composer. Compaction starts automatically at 95% of the
              selected window. New chats default to 400k when that size is in the list.
            </Trans>
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 min-h-7 shrink-0 gap-1 px-2 text-[11px]"
          aria-label={t`Reset context windows`}
          isDisabled={isDefaultList || isBusy}
          isPending={pendingAction === "reset"}
          onPress={() => void persist([...DEFAULT_CODEX_CONTEXT_WINDOWS], "reset")}
        >
          <RotateCcw className="size-3" />
          <Trans>Reset</Trans>
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {windows.map((window) => (
          <span
            key={window.id}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-secondary px-2 py-0.5 text-xs text-foreground"
          >
            {window.label}
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              className="h-6 w-6 min-h-6 min-w-6 text-muted"
              aria-label={t`Remove ${window.label}`}
              isDisabled={windows.length <= 1 || isBusy}
              isPending={pendingAction === `remove:${window.id}`}
              onPress={() => removeWindow(window.id)}
            >
              <X className="size-3" />
            </Button>
          </span>
        ))}
      </div>

      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          addWindow();
        }}
      >
        <Input
          aria-label={t`Custom context window`}
          className="h-8 min-h-8 max-w-[180px]"
          placeholder={t`e.g. 512k or 1m`}
          value={draft}
          disabled={isBusy}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <Button
          size="sm"
          variant="tertiary"
          className="h-8 min-h-8 gap-1 px-2.5 text-[11px]"
          type="submit"
          aria-label={t`Add context window`}
          isDisabled={isBusy || draft.trim().length === 0}
          isPending={pendingAction === "add"}
        >
          <Plus className="size-3" />
          <Trans>Add</Trans>
        </Button>
      </form>
    </div>
  );
}
