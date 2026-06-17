import { useEffect, useRef, useState } from "react";
import { Input, Label, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Command, Search } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useCommandPaletteStore } from "./commandPaletteStore";
import { useKeybindingStore } from "./keybindingStore";
import { bindingForPlatform, formatKeybinding } from "./keybindingMatcher";
import {
  buildCommandRegistry,
  buildWhenContext,
  isCommandAvailable,
  type AppCommand,
} from "./registry";

const MAX_VISIBLE_COMMANDS = 80;

export function CommandPalette() {
  const { t } = useLingui();
  const isOpen = useCommandPaletteStore((state) => state.isOpen);
  const close = useCommandPaletteStore((state) => state.close);
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useAppStore((state) => state.projects);
  useAppStore((state) => state.threads);
  useAppStore((state) => state.view);
  useAppStore((state) => state.focusedPaneId);
  usePanelStore((state) => state.filesPanelContext);
  useFileEditorStore((state) => state.rootContext);
  useFileEditorStore((state) => state.activePath);

  const whenContext = buildWhenContext();
  const commands = buildCommandRegistry().filter((command) =>
    isCommandAvailable(command, whenContext),
  );
  const resolve = (value: string | MessageDescriptor): string =>
    typeof value === "string" ? value : t(value);
  const filteredCommands = filterCommands(commands, query, resolve).slice(0, MAX_VISIBLE_COMMANDS);
  const activeCommand = filteredCommands[activeIndex];

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  useEffect(() => {
    if (activeIndex >= filteredCommands.length) {
      setActiveIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [activeIndex, filteredCommands.length]);

  function runCommand(command: AppCommand | undefined) {
    if (!command) return;
    close();
    void command.run();
  }

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      variant="blur"
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Container className="items-start pt-[12vh]">
        <Modal.Dialog className="w-[min(720px,calc(100vw-24px))] overflow-hidden rounded-lg border border-[color:var(--border)] bg-[var(--background)] p-0 shadow-2xl">
          <div className="flex h-14 items-center gap-3 border-b border-[color:var(--border)] px-4">
            <Search className="size-4 shrink-0 text-muted" />
            <Input
              ref={inputRef}
              aria-label={t({
                message: "Command",
                comment: "Accessible label for the command palette search input",
              })}
              variant="secondary"
              placeholder={t`Type a command`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((idx) => Math.min(idx + 1, filteredCommands.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((idx) => Math.max(idx - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  runCommand(activeCommand);
                }
              }}
              className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none"
            />
          </div>
          <div className="max-h-[min(520px,70vh)] overflow-y-auto p-2">
            {filteredCommands.length > 0 ? (
              <div role="listbox" aria-label={t`Commands`} className="space-y-1">
                {filteredCommands.map((command, index) => {
                  const shortcut = shortcutForCommand(command.id, keybindings);
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`flex h-12 w-full min-w-0 items-center gap-3 rounded-md px-3 text-left outline-none ${
                        index === activeIndex ? "bg-foreground/10" : "hover:bg-foreground/5"
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runCommand(command)}
                    >
                      <Command className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <Label className="block truncate text-sm">{resolve(command.title)}</Label>
                        <span className="block truncate text-xs text-muted">
                          {resolve(command.subtitle ?? command.group)}
                        </span>
                      </span>
                      {shortcut ? (
                        <span className="shrink-0 rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[11px] text-muted">
                          {shortcut}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-sm text-muted">
                <Trans>No commands found</Trans>
              </div>
            )}
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function filterCommands(
  commands: AppCommand[],
  query: string,
  resolve: (value: string | MessageDescriptor) => string,
): AppCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;
  const terms = normalized.split(/\s+/);
  return commands.filter((command) => {
    const haystack = [
      command.id,
      resolve(command.title),
      resolve(command.group),
      command.subtitle ? resolve(command.subtitle) : "",
      ...(command.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function shortcutForCommand(
  commandId: string,
  keybindings: readonly { command: string }[],
): string {
  const platform = readBridge().platform;
  const binding = keybindings.find((item) => item.command === commandId);
  if (!binding) return "";
  return formatKeybinding(bindingForPlatform(binding, platform), platform);
}
