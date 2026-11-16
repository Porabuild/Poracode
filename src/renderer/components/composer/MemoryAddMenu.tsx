import { useEffect, useState } from "react";
import { Brain, ChevronLeft } from "lucide-react";
import { Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { MemoryStatus, MemoryThreadMode } from "@/shared/memory";
import { MenuSwitch, submenuCaptionClassName } from "./ComposerAddMenuParts";

function loadMemoryStatus(threadId: string | undefined): Promise<MemoryStatus | undefined> {
  try {
    return readBridge()
      .memoryCommand({
        action: "status",
        ...(threadId ? { threadId } : {}),
      })
      .then((next) => next as MemoryStatus);
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
  },
): string {
  if (!enabled) return labels.off;
  if (!status) return labels.on;
  if (status.pendingCandidates > 0) return labels.waiting(status.pendingCandidates);
  if (status.lastDreamSummary) return status.lastDreamSummary;
  return labels.saved(status.entryCount);
}

export function MemoryMenuButton(props: { threadId?: string; onOpen: () => void }) {
  const { t } = useLingui();
  const enabled = useSharedSettings((state) => state.memory.enabled);
  return (
    <button type="button" className="m-sheet-action" onClick={props.onOpen}>
      <Brain className="size-4 text-muted" />
      <span className="flex-1 truncate">
        <Trans>Memory</Trans>
      </span>
      <span className="shrink-0 text-xs text-muted">{enabled ? t`On` : t`Off`}</span>
    </button>
  );
}

export function MemoryMenuPanel(props: {
  threadId?: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const memory = useSharedSettings((state) => state.memory);
  const setMemorySettings = useSharedSettings((state) => state.setMemorySettings);
  const [status, setStatus] = useState<MemoryStatus | undefined>();
  const remote = isRemoteSession();

  useEffect(() => {
    if (remote) return;
    let active = true;
    void loadMemoryStatus(props.threadId).then((next) => {
      if (active && next) setStatus(next);
    });
    return () => {
      active = false;
    };
  }, [props.threadId, remote]);

  const statusText = remote
    ? t`Managed on this host`
    : memoryStatusLabel(status, memory.enabled, {
        off: t`Off`,
        on: t`On`,
        waiting: (count) => t`${count} waiting`,
        saved: (count) => t`${count} saved`,
      });

  return (
    <div className="m-sheet-list">
      <button type="button" className="m-sheet-action" onClick={props.onBack}>
        <ChevronLeft className="size-4 text-muted" />
        <span className="flex-1 truncate">
          <Trans>Memory</Trans>
        </span>
      </button>
      <button
        type="button"
        className="m-sheet-action"
        aria-pressed={memory.enabled}
        onClick={() => setMemorySettings({ enabled: !memory.enabled })}
      >
        <span className="flex-1 truncate">
          <Trans>Use memory</Trans>
        </span>
        <MenuSwitch checked={memory.enabled} />
      </button>
      <button
        type="button"
        className="m-sheet-action"
        aria-pressed={memory.learning}
        onClick={() => setMemorySettings({ learning: !memory.learning })}
      >
        <span className="flex-1 truncate">
          <Trans>Learn from chats</Trans>
        </span>
        <MenuSwitch checked={memory.learning} />
      </button>
      {props.threadId && !remote ? (
        <button
          type="button"
          className="m-sheet-action"
          aria-pressed={status?.threadMode !== "incognito" && status?.threadMode !== "recall"}
          onClick={() => {
            const mode: MemoryThreadMode = status?.threadMode === "learn" ? "recall" : "learn";
            void readBridge()
              .memoryCommand({ action: "thread-mode", threadId: props.threadId!, mode })
              .then(() =>
                setStatus((current) => (current ? { ...current, threadMode: mode } : current)),
              );
          }}
        >
          <span className="flex-1 truncate">
            <Trans>Learn from this thread</Trans>
          </span>
          <MenuSwitch
            checked={status?.threadMode !== "recall" && status?.threadMode !== "incognito"}
          />
        </button>
      ) : null}
      <p className="px-3 py-2 text-xs text-muted">{statusText}</p>
      <button
        type="button"
        className="m-sheet-action"
        aria-label={t`Memory settings`}
        onClick={() => {
          props.onClose();
          usePanelStore.getState().openSettingsSection("memory");
        }}
      >
        <span className="flex-1 truncate">
          <Trans>Memory settings</Trans>
        </span>
      </button>
    </div>
  );
}

export function MemoryDesktopSubmenu(props: {
  threadId?: string;
  stackClassName?: string;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const memory = useSharedSettings((state) => state.memory);
  const setMemorySettings = useSharedSettings((state) => state.setMemorySettings);
  const [status, setStatus] = useState<MemoryStatus | undefined>();
  const remote = isRemoteSession();
  const selected = new Set<string>([
    ...(memory.enabled ? ["memory-enabled"] : []),
    ...(memory.learning ? ["memory-learning"] : []),
    ...(status?.threadMode === "learn" ? ["memory-thread"] : []),
  ]);

  useEffect(() => {
    if (remote) return;
    let active = true;
    void loadMemoryStatus(props.threadId).then((next) => {
      if (active && next) setStatus(next);
    });
    return () => {
      active = false;
    };
  }, [props.threadId, remote]);

  return (
    <Dropdown.SubmenuTrigger>
      <Dropdown.Item id="memory" textValue={t`Memory`}>
        <Brain className="size-4 text-muted" />
        <Label className="flex-1 truncate">
          <Trans>Memory</Trans>
        </Label>
        <span className="text-xs text-muted">{memory.enabled ? t`On` : t`Off`}</span>
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
              const enabled = keys.has("memory-enabled");
              const learning = keys.has("memory-learning");
              if (enabled !== memory.enabled) setMemorySettings({ enabled });
              if (learning !== memory.learning) setMemorySettings({ learning });
              if (
                props.threadId &&
                !remote &&
                keys.has("memory-thread") !== (status?.threadMode === "learn")
              ) {
                const mode: MemoryThreadMode = keys.has("memory-thread") ? "learn" : "recall";
                void readBridge()
                  .memoryCommand({ action: "thread-mode", threadId: props.threadId, mode })
                  .then(() =>
                    setStatus((current) => (current ? { ...current, threadMode: mode } : current)),
                  );
              }
            }}
            className="poracode-menu min-w-56"
          >
            <Dropdown.Item id="memory-enabled" textValue={t`Use memory`}>
              <Label className="flex-1 truncate">
                <Trans>Use memory</Trans>
              </Label>
              <MenuSwitch checked={memory.enabled} />
            </Dropdown.Item>
            <Dropdown.Item id="memory-learning" textValue={t`Learn from chats`}>
              <Label className="flex-1 truncate">
                <Trans>Learn from chats</Trans>
              </Label>
              <MenuSwitch checked={memory.learning} />
            </Dropdown.Item>
            {props.threadId && !remote ? (
              <Dropdown.Item id="memory-thread" textValue={t`Learn from this thread`}>
                <Label className="flex-1 truncate">
                  <Trans>Learn from this thread</Trans>
                </Label>
                <MenuSwitch
                  checked={status?.threadMode !== "recall" && status?.threadMode !== "incognito"}
                />
              </Dropdown.Item>
            ) : null}
          </Dropdown.Menu>
          <button
            type="button"
            className="px-3 py-2 text-left text-xs text-foreground hover:bg-default-100/60"
            onClick={() => {
              props.onClose();
              usePanelStore.getState().openSettingsSection("memory");
            }}
          >
            <Trans>Memory settings</Trans>
          </button>
          <p className={submenuCaptionClassName}>
            {remote
              ? t`Managed on this host`
              : memoryStatusLabel(status, memory.enabled, {
                  off: t`Off`,
                  on: t`On`,
                  waiting: (count) => t`${count} waiting`,
                  saved: (count) => t`${count} saved`,
                })}
          </p>
        </div>
      </Dropdown.Popover>
    </Dropdown.SubmenuTrigger>
  );
}
