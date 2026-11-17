import { useEffect, useState } from "react";
import { Brain, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Dropdown, Label, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { MemoryStatus, MemoryThreadMode } from "@/shared/memory";
import { MenuSwitch, submenuCaptionClassName } from "./ComposerAddMenuParts";

function threadLearns(mode: MemoryThreadMode | null | undefined): boolean {
  return mode === "learn";
}

function withThreadMode(current: MemoryStatus | undefined, mode: MemoryThreadMode): MemoryStatus {
  return {
    enabled: current?.enabled ?? false,
    learning: current?.learning ?? true,
    syncEnabled: current?.syncEnabled ?? true,
    captureTiming: current?.captureTiming ?? "settle-2m",
    pendingCandidates: current?.pendingCandidates ?? 0,
    entryCount: current?.entryCount ?? 0,
    suggestionCount: current?.suggestionCount ?? 0,
    lastDreamAt: current?.lastDreamAt ?? null,
    lastDreamSummary: current?.lastDreamSummary ?? null,
    lastDreamRunId: current?.lastDreamRunId ?? null,
    lastDreamCounts: current?.lastDreamCounts ?? null,
    threadMode: mode,
  };
}

function loadMemoryStatus(threadId: string | undefined): Promise<MemoryStatus | undefined> {
  try {
    return readBridge()
      .memoryCommand({
        action: "status",
        ...(threadId ? { threadId } : {}),
      })
      .then((next) => next as MemoryStatus)
      .catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

export function memoryStatusLabel(
  status: MemoryStatus | undefined,
  enabled: boolean,
  labels: {
    off: string;
    on: string;
    waiting: (count: number) => string;
    saved: (count: number) => string;
    dream?: (counts: { promoted: number; suggested: number; retired: number }) => string;
  },
): string {
  if (!enabled) return labels.off;
  if (!status) return labels.on;
  if (status.pendingCandidates > 0) return labels.waiting(status.pendingCandidates);
  if (status.lastDreamCounts) {
    const { promoted, suggested, retired } = status.lastDreamCounts;
    if (promoted > 0 || suggested > 0 || retired > 0 || status.entryCount === 0) {
      return (
        labels.dream?.(status.lastDreamCounts) ??
        status.lastDreamSummary ??
        labels.saved(status.entryCount)
      );
    }
    return labels.saved(status.entryCount);
  }
  if (
    status.lastDreamSummary &&
    (status.entryCount === 0 || !status.lastDreamSummary.startsWith("Promoted 0. Suggested 0"))
  ) {
    return status.lastDreamSummary;
  }
  return labels.saved(status.entryCount);
}

function useMemoryMenuState(threadId: string | undefined, isOpen: boolean | undefined) {
  const { t } = useLingui();
  const enabled = useSharedSettings((state) => state.memory.enabled);
  const learning = useSharedSettings((state) => state.memory.learning);
  const setMemorySettings = useSharedSettings((state) => state.setMemorySettings);
  const [statusState, setStatusState] = useState<{
    forThreadId: string | undefined;
    value: MemoryStatus | undefined;
  }>({ forThreadId: threadId, value: undefined });
  const remote = isRemoteSession();
  const status = statusState.forThreadId === threadId ? statusState.value : undefined;

  useEffect(() => {
    if (remote || isOpen === false) return;
    let active = true;
    void loadMemoryStatus(threadId).then((next) => {
      if (active) setStatusState({ forThreadId: threadId, value: next });
    });
    return () => {
      active = false;
    };
  }, [isOpen, threadId, remote]);

  const setThreadMode = (learns: boolean) => {
    if (!threadId || remote) return;
    const mode: MemoryThreadMode = learns ? "learn" : "recall";
    void readBridge()
      .memoryCommand({ action: "thread-mode", threadId, mode })
      .then(() =>
        setStatusState((current) => ({
          forThreadId: threadId,
          value: withThreadMode(current.forThreadId === threadId ? current.value : undefined, mode),
        })),
      )
      .catch(() => {
        toast.danger(t`Couldn't update memory mode for this thread.`);
      });
  };

  const statusText = remote
    ? t`Managed on this host`
    : memoryStatusLabel(status, enabled, {
        off: t`Off`,
        on: t`On`,
        waiting: (count) => t`${count} waiting`,
        saved: (count) => t`${count} saved`,
        dream: ({ promoted, suggested }) => t`Promoted ${promoted}. Suggested ${suggested} skills.`,
      });

  return {
    enabled,
    learning,
    setMemorySettings,
    status,
    remote,
    statusText,
    setThreadMode,
  };
}

export function MemoryMenuButton(props: { onOpen: () => void }) {
  const { t } = useLingui();
  const enabled = useSharedSettings((state) => state.memory.enabled);
  return (
    <button type="button" className="m-sheet-action" onClick={props.onOpen}>
      <Brain className="size-4 text-muted" />
      <span className="flex-1 truncate">
        <Trans>Memory</Trans>
      </span>
      <span className="shrink-0 text-xs text-muted">{enabled ? t`On` : t`Off`}</span>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </button>
  );
}

export function MemoryMenuPanel(props: {
  threadId?: string;
  isOpen?: boolean;
  onManage?: (() => void) | undefined;
  onBack: () => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { enabled, learning, setMemorySettings, status, remote, statusText, setThreadMode } =
    useMemoryMenuState(props.threadId, props.isOpen);

  return (
    <div className="m-sheet-list">
      <button type="button" className="m-sheet-action" aria-label={t`Back`} onClick={props.onBack}>
        <ChevronLeft className="size-4 text-muted" />
        <span className="flex-1 truncate font-medium">
          <Trans>Memory</Trans>
        </span>
      </button>
      <button
        type="button"
        className="m-sheet-action"
        aria-pressed={enabled}
        onClick={() => setMemorySettings({ enabled: !enabled })}
      >
        <span className="flex-1 truncate">
          <Trans>Use memory</Trans>
        </span>
        <MenuSwitch checked={enabled} />
      </button>
      <button
        type="button"
        className="m-sheet-action"
        aria-pressed={learning}
        disabled={!enabled}
        onClick={() => setMemorySettings({ learning: !learning })}
      >
        <span className="flex-1 truncate">
          <Trans>Learn from chats</Trans>
        </span>
        <MenuSwitch checked={learning} readOnly={!enabled} />
      </button>
      {props.threadId && !remote ? (
        <button
          type="button"
          className="m-sheet-action"
          aria-pressed={threadLearns(status?.threadMode)}
          disabled={!enabled || !status}
          onClick={() => setThreadMode(!threadLearns(status?.threadMode))}
        >
          <span className="flex-1 truncate">
            <Trans>Learn from this thread</Trans>
          </span>
          <MenuSwitch checked={threadLearns(status?.threadMode)} readOnly={!enabled || !status} />
        </button>
      ) : null}
      <p className="px-3 py-2 text-xs text-muted">{statusText}</p>
      {props.onManage ? (
        <button
          type="button"
          className="m-sheet-action"
          aria-label={t`Memory settings`}
          onClick={() => {
            props.onClose();
            props.onManage?.();
          }}
        >
          <SlidersHorizontal className="size-4 text-muted" />
          <span className="flex-1 truncate">
            <Trans>Memory settings</Trans>
          </span>
        </button>
      ) : null}
    </div>
  );
}

export function MemoryDesktopSubmenu(props: {
  threadId?: string;
  isOpen?: boolean;
  onManage?: (() => void) | undefined;
  stackClassName?: string;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { enabled, learning, setMemorySettings, status, remote, statusText, setThreadMode } =
    useMemoryMenuState(props.threadId, props.isOpen);
  const selected = new Set<string>([
    ...(enabled ? ["memory-enabled"] : []),
    ...(learning ? ["memory-learning"] : []),
    ...(threadLearns(status?.threadMode) ? ["memory-thread"] : []),
  ]);

  return (
    <Dropdown.SubmenuTrigger>
      <Dropdown.Item id="memory" textValue={t`Memory`}>
        <Brain className="size-4 text-muted" />
        <Label className="flex-1 truncate">
          <Trans>Memory</Trans>
        </Label>
        <span className="text-xs text-muted">{enabled ? t`On` : t`Off`}</span>
        <Dropdown.SubmenuIndicator />
      </Dropdown.Item>
      <Dropdown.Popover {...(props.stackClassName ? { className: props.stackClassName } : {})}>
        <div className="flex flex-col">
          <Dropdown.Menu
            aria-label={t`Memory`}
            selectionMode="multiple"
            selectedKeys={selected}
            onSelectionChange={(keys) => {
              if (keys === "all") return;
              const nextEnabled = keys.has("memory-enabled");
              const nextLearning = keys.has("memory-learning");
              if (nextEnabled !== enabled) setMemorySettings({ enabled: nextEnabled });
              if (nextLearning !== learning) setMemorySettings({ learning: nextLearning });
              if (
                props.threadId &&
                !remote &&
                status &&
                keys.has("memory-thread") !== threadLearns(status.threadMode)
              ) {
                setThreadMode(keys.has("memory-thread"));
              }
            }}
            className="poracode-menu min-w-56"
          >
            <Dropdown.Item id="memory-enabled" textValue={t`Use memory`}>
              <Label className="flex-1 truncate">
                <Trans>Use memory</Trans>
              </Label>
              <MenuSwitch checked={enabled} />
            </Dropdown.Item>
            <Dropdown.Item
              id="memory-learning"
              textValue={t`Learn from chats`}
              isDisabled={!enabled}
            >
              <Label className="flex-1 truncate">
                <Trans>Learn from chats</Trans>
              </Label>
              <MenuSwitch checked={learning} readOnly={!enabled} />
            </Dropdown.Item>
            {props.threadId && !remote ? (
              <Dropdown.Item
                id="memory-thread"
                textValue={t`Learn from this thread`}
                isDisabled={!enabled || !status}
              >
                <Label className="flex-1 truncate">
                  <Trans>Learn from this thread</Trans>
                </Label>
                <MenuSwitch
                  checked={threadLearns(status?.threadMode)}
                  readOnly={!enabled || !status}
                />
              </Dropdown.Item>
            ) : null}
          </Dropdown.Menu>
          {props.onManage ? (
            <Dropdown.Menu
              aria-label={t`Memory actions`}
              autoFocus={false}
              selectionMode="none"
              onAction={(key) => {
                if (key === "memory-settings") {
                  props.onClose();
                  props.onManage?.();
                }
              }}
              className="poracode-menu min-w-56 border-t border-border"
            >
              <Dropdown.Item id="memory-settings" textValue={t`Memory settings`}>
                <SlidersHorizontal className="size-4 text-muted" />
                <Label className="flex-1 truncate">
                  <Trans>Memory settings</Trans>
                </Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          ) : null}
          <p className={submenuCaptionClassName}>{statusText}</p>
        </div>
      </Dropdown.Popover>
    </Dropdown.SubmenuTrigger>
  );
}
