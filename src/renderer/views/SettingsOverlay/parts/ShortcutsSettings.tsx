import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@heroui/react";
import { Check, Lock, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import {
  QUICK_COMPOSER_COMMAND_ID,
  QUICK_COMPOSER_SHORTCUT_UNAVAILABLE_CODE,
  type KeybindingEntry,
} from "@/shared/keybindings";
import { readBridge } from "@/renderer/bridge";
import { Input } from "@/renderer/components/common";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import { setCapturingKeybinding } from "@/renderer/commands/keybindingCapture";
import {
  bindingForPlatform,
  canonicalizeKeybinding,
  eventToKeybinding,
  formatKeybinding,
  type PlatformName,
} from "@/renderer/commands/keybindingMatcher";
import {
  buildShortcutRows,
  groupRowsBySection,
  isProjectScriptCommandId,
  type ResolveLabel,
  type ShortcutRow,
  type ShortcutSection,
  type ShortcutSectionGroup,
} from "@/renderer/commands/shortcutCatalog";
import { buildCommandRegistry } from "@/renderer/commands/registry";
import { SettingsPage } from "./SettingsForm";

interface RecordingTarget {
  rowId: string;
  commandId: string;
  whenTemplate: string | null;
  /** The existing entry being re-recorded, or null when adding a new binding. */
  replace: KeybindingEntry | null;
}

interface EditorApi {
  platform: PlatformName;
  recording: RecordingTarget | null;
  startAdd: (row: ShortcutRow) => void;
  startReplace: (row: ShortcutRow, entry: KeybindingEntry) => void;
  remove: (entry: KeybindingEntry) => void;
  reset: (row: ShortcutRow) => void;
  commit: (key: string) => void;
  cancel: () => void;
  conflictName: (canonicalKey: string, excludeCommand: string) => string | null;
}

export function ShortcutsSettings() {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const loaded = useKeybindingStore((state) => state.loaded);
  const loadKeybindings = useKeybindingStore((state) => state.load);
  const saveKeybindings = useKeybindingStore((state) => state.save);
  const platform = readBridge().platform;
  const [recording, setRecording] = useState<RecordingTarget | null>(null);

  useEffect(() => {
    if (loaded) return;
    void loadKeybindings().catch((error) => {
      console.error("[renderer] failed to load keybindings:", error);
    });
  }, [loadKeybindings, loaded]);

  const resolveLabel: ResolveLabel = (value) => (typeof value === "string" ? value : t(value));
  const rows = buildShortcutRows(buildCommandRegistry(), keybindings, platform, resolveLabel);
  const titleByCommand = new Map<string, string>();
  for (const row of rows) if (row.commandId) titleByCommand.set(row.commandId, row.title);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = rows.filter(
    (row) => !normalizedQuery || row.searchText.includes(normalizedQuery),
  );
  const sections = groupRowsBySection(visibleRows);

  const sectionRefs = useRef(new Map<ShortcutSection, HTMLElement>());
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionKey = sections.map((section) => section.id).join(",");
  const activeSection = useActiveSection(sections, containerRef, sectionKey);

  const registerSection = useCallback(
    (id: ShortcutSection) => (element: HTMLElement | null) => {
      if (element) sectionRefs.current.set(id, element);
      else sectionRefs.current.delete(id);
    },
    [],
  );

  const jumpToSection = useCallback((id: ShortcutSection) => {
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const persist = useCallback(
    (next: KeybindingEntry[]) => {
      void saveKeybindings(next).catch((error) => {
        console.error("[renderer] failed to save keybindings:", error);
        toast.danger(
          error instanceof Error && error.message.includes(QUICK_COMPOSER_SHORTCUT_UNAVAILABLE_CODE)
            ? t`This system-wide shortcut is unavailable. Choose another key combination.`
            : t`Couldn't save the shortcut.`,
        );
      });
    },
    [saveKeybindings, t],
  );

  const current = () => useKeybindingStore.getState().keybindings;

  const editor: EditorApi = {
    platform,
    recording,
    startAdd: (row) => {
      if (!row.commandId) return;
      setRecording({
        rowId: row.id,
        commandId: row.commandId,
        whenTemplate: row.whenTemplate,
        replace: null,
      });
    },
    startReplace: (row, entry) => {
      if (!row.commandId) return;
      setRecording({
        rowId: row.id,
        commandId: row.commandId,
        whenTemplate: entry.when ?? row.whenTemplate,
        replace: entry,
      });
    },
    remove: (entry) => persist(current().filter((binding) => binding !== entry)),
    reset: (row) =>
      persist([
        ...current().filter((binding) => binding.command !== row.commandId),
        ...row.defaultBindings,
      ]),
    commit: (key) => {
      if (!recording) return;
      const base = recording.replace
        ? current().filter((binding) => binding !== recording.replace)
        : current();
      const entry: KeybindingEntry = {
        command: recording.commandId,
        key,
        ...(recording.whenTemplate ? { when: recording.whenTemplate } : {}),
      };
      persist([...base, entry]);
      setRecording(null);
    },
    cancel: () => setRecording(null),
    conflictName: (canonicalKey, excludeCommand) => {
      for (const binding of current()) {
        if (binding.command === excludeCommand) continue;
        if (isProjectScriptCommandId(binding.command) && !titleByCommand.has(binding.command)) {
          continue;
        }
        const raw = bindingForPlatform(binding, platform);
        if (raw && canonicalizeKeybinding(raw, platform) === canonicalKey) {
          return titleByCommand.get(binding.command) ?? binding.command;
        }
      }
      return null;
    },
  };

  return (
    <SettingsPage
      title={t`Shortcuts`}
      description={<Trans>Click a shortcut to record a new key, or ＋ to add another.</Trans>}
      bodyClassName="space-y-3"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
        <Input
          aria-label={t`Search shortcuts`}
          className="w-full pl-9"
          placeholder={t`Search shortcuts`}
          value={query}
          variant="secondary"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {sections.length > 0 ? (
        <div ref={containerRef} className="flex items-start gap-5">
          <nav
            aria-label={t`Jump to section`}
            className="sticky top-0 hidden max-h-[calc(100vh-8rem)] w-32 shrink-0 self-start overflow-y-auto py-0.5 sm:block"
          >
            <ul className="space-y-px">
              {sections.map((section) => {
                const isActive = section.id === activeSection;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                        isActive
                          ? "bg-foreground/[0.08] text-foreground"
                          : "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
                      }`}
                      onClick={() => jumpToSection(section.id)}
                    >
                      <span className="truncate">{resolveLabel(section.label)}</span>
                      <span className="shrink-0 tabular-nums text-[10px] text-muted/70">
                        {section.rows.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-w-0 flex-1 space-y-4 pb-[33vh]">
            {sections.map((section) => (
              <ShortcutSectionView
                key={section.id}
                ref={registerSection(section.id)}
                editor={editor}
                resolveLabel={resolveLabel}
                section={section}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-[color:var(--border)] px-4 py-8 text-center text-sm text-muted">
          <Trans>No shortcuts found</Trans>
        </div>
      )}
    </SettingsPage>
  );
}

function ShortcutSectionView(props: {
  ref: (element: HTMLElement | null) => void;
  editor: EditorApi;
  resolveLabel: ResolveLabel;
  section: ShortcutSectionGroup;
}) {
  const { ref, editor, resolveLabel, section } = props;
  const sectionLabel = resolveLabel(section.label);
  return (
    <section ref={ref} data-section-id={section.id} className="scroll-mt-2">
      <h2 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {sectionLabel}
      </h2>
      <div className="overflow-hidden rounded-md border border-[color:var(--border)]">
        {section.rows.map((row) => (
          <ShortcutRowView key={row.id} editor={editor} row={row} sectionLabel={sectionLabel} />
        ))}
      </div>
    </section>
  );
}

function ShortcutRowView(props: { editor: EditorApi; row: ShortcutRow; sectionLabel: string }) {
  const { editor, row, sectionLabel } = props;
  // The section header already names the group, so only show the subtitle when
  // it adds something (e.g. "Composer controls", "Commit, PR, and review composers").
  const subtitle =
    row.description && row.description.toLowerCase() !== sectionLabel.toLowerCase()
      ? row.description
      : null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-3 py-1.5 last:border-b-0">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[13px] font-medium text-foreground">{row.title}</span>
        {subtitle ? <span className="truncate text-[11px] text-muted">{subtitle}</span> : null}
      </div>
      {row.editable ? (
        <RowKeybindingEditor editor={editor} row={row} />
      ) : (
        <ReadOnlyKeys keys={row.keys} />
      )}
    </div>
  );
}

function ReadOnlyKeys(props: { keys: string[] }) {
  const { t } = useLingui();
  if (props.keys.length === 0) {
    return (
      <span className="shrink-0 text-[11px] text-muted">
        <Trans>Unassigned</Trans>
      </span>
    );
  }
  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-end gap-1"
      title={t`Built-in shortcut — can't be changed`}
    >
      <Lock className="size-3 text-muted/60" aria-label={t`Built-in shortcut — can't be changed`} />
      {props.keys.map((key) => (
        <span
          key={key}
          className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-muted"
        >
          {key}
        </span>
      ))}
    </div>
  );
}

function RowKeybindingEditor(props: { editor: EditorApi; row: ShortcutRow }) {
  const { editor, row } = props;
  const { t } = useLingui();
  const isRecording = editor.recording?.rowId === row.id;
  const canReset = row.defaultBindings.length > 0 && bindingsDifferFromDefault(row);

  if (isRecording) {
    return (
      <ChordRecorder
        allowOverride={row.commandId === QUICK_COMPOSER_COMMAND_ID}
        excludeCommand={editor.recording!.commandId}
        platform={editor.platform}
        resolveConflict={editor.conflictName}
        onCancel={editor.cancel}
        onCommit={editor.commit}
      />
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {row.bindings.map((entry, index) => {
        const display = formatKeybinding(
          bindingForPlatform(entry, editor.platform) ?? "",
          editor.platform,
        );
        return (
          <span
            key={`${entry.command}:${display}:${index}`}
            className="group flex items-center overflow-hidden rounded bg-foreground/[0.08]"
          >
            <button
              type="button"
              className="px-1.5 py-0.5 font-mono text-[11px] text-foreground/90 hover:bg-foreground/[0.06]"
              title={t`Change shortcut`}
              onClick={() => editor.startReplace(row, entry)}
            >
              {display || t`Unknown`}
            </button>
            <button
              type="button"
              aria-label={t`Remove shortcut`}
              className="flex h-full items-center px-1 text-muted hover:bg-danger/20 hover:text-danger"
              onClick={() => editor.remove(entry)}
            >
              <Trash2 className="size-3" />
            </button>
          </span>
        );
      })}

      {row.bindings.length === 0 ? (
        <button
          type="button"
          className="rounded border border-dashed border-[color:var(--border)] px-1.5 py-0.5 text-[11px] text-muted/70 hover:border-foreground/30 hover:text-foreground"
          onClick={() => editor.startAdd(row)}
        >
          <Trans>Set shortcut</Trans>
        </button>
      ) : (
        <button
          type="button"
          aria-label={t`Add shortcut`}
          className="flex size-5 items-center justify-center rounded text-muted hover:bg-foreground/[0.08] hover:text-foreground"
          onClick={() => editor.startAdd(row)}
        >
          <Plus className="size-3.5" />
        </button>
      )}

      {canReset ? (
        <button
          type="button"
          aria-label={t`Reset to default`}
          className="flex size-5 items-center justify-center rounded text-muted hover:bg-foreground/[0.08] hover:text-foreground"
          onClick={() => editor.reset(row)}
        >
          <RotateCcw className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

function ChordRecorder(props: {
  allowOverride: boolean;
  excludeCommand: string;
  platform: PlatformName;
  resolveConflict: (canonicalKey: string, excludeCommand: string) => string | null;
  onCommit: (canonicalKey: string) => void;
  onCancel: () => void;
}) {
  const { allowOverride, excludeCommand, platform, resolveConflict, onCommit, onCancel } = props;
  const { t } = useLingui();
  const [captured, setCaptured] = useState<string | null>(null);
  const [captureReady, setCaptureReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const bridge = readBridge();
    const setSuspended = (suspended: boolean): Promise<void> =>
      typeof bridge.setGlobalShortcutsSuspended === "function"
        ? bridge.setGlobalShortcutsSuspended({ suspended }).catch((error) => {
            console.error(
              `[renderer] failed to ${suspended ? "suspend" : "resume"} global shortcuts:`,
              error,
            );
          })
        : Promise.resolve();
    void setSuspended(true).finally(() => {
      if (mounted) setCaptureReady(true);
    });
    return () => {
      mounted = false;
      void setSuspended(false);
    };
  }, []);

  useEffect(() => {
    if (captured !== null || !captureReady) return;
    setCapturingKeybinding(true);
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const bare = event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (bare && !event.shiftKey) {
        setCapturingKeybinding(false);
        onCancel();
        return;
      }
      const chord = eventToKeybinding(event, platform);
      if (!chord) return; // modifier-only — keep listening
      setCapturingKeybinding(false);
      setCaptured(chord);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => {
      window.removeEventListener("keydown", handler, { capture: true });
      setCapturingKeybinding(false);
    };
  }, [captureReady, captured, platform, onCancel]);

  if (captured === null) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="animate-pulse rounded bg-foreground/[0.08] px-2 py-0.5 text-[11px] text-foreground">
          <Trans>Press shortcut…</Trans>
        </span>
        <button
          type="button"
          className="text-[11px] text-muted hover:text-foreground"
          onClick={onCancel}
        >
          <Trans>Cancel</Trans>
        </button>
      </div>
    );
  }

  const conflict = resolveConflict(captured, excludeCommand);
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {conflict ? (
        <span
          className="text-[10px] text-warning"
          title={allowOverride ? t`Overrides ${conflict}` : t`Already used by ${conflict}`}
        >
          {allowOverride ? <Trans>Overrides {conflict}</Trans> : <Trans>Used by {conflict}</Trans>}
        </span>
      ) : null}
      <span className="rounded bg-foreground/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-foreground/90">
        {formatKeybinding(captured, platform)}
      </span>
      <button
        type="button"
        aria-label={t`Save shortcut`}
        className="flex size-5 items-center justify-center rounded text-success hover:bg-success/20"
        onClick={() => onCommit(captured)}
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={t`Discard`}
        className="flex size-5 items-center justify-center rounded text-muted hover:bg-foreground/[0.08] hover:text-foreground"
        onClick={onCancel}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function bindingsDifferFromDefault(row: ShortcutRow): boolean {
  const fingerprint = (list: readonly KeybindingEntry[]) =>
    list
      .map(
        (b) => `${b.key ?? ""}|${b.mac ?? ""}|${b.windows ?? ""}|${b.linux ?? ""}|${b.when ?? ""}`,
      )
      .sort()
      .join(";");
  return fingerprint(row.bindings) !== fingerprint(row.defaultBindings);
}

/**
 * Scrollspy: highlight the section nearest the top of the settings scroll area.
 * Observes each section against the top slice of the scroll viewport so the nav
 * tracks the user's position as they scroll. Returns the active section id.
 */
function useActiveSection(
  sections: ShortcutSectionGroup[],
  containerRef: React.RefObject<HTMLDivElement | null>,
  sectionKey: string,
): ShortcutSection | null {
  const [activeSection, setActiveSection] = useState<ShortcutSection | null>(null);

  useEffect(() => {
    setActiveSection(sections[0]?.id ?? null);
    if (typeof IntersectionObserver === "undefined") return;
    const root = containerRef.current?.closest("[data-settings-scroll-area]") ?? null;
    const targets = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>("[data-section-id]") ?? [],
    );
    if (targets.length === 0) return;

    const order = sections.map((section) => section.id);
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-section-id");
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const top = order.find((id) => visible.has(id));
        if (top) setActiveSection(top);
      },
      { root, rootMargin: "0px 0px -80% 0px", threshold: 0 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
    // sectionKey changes whenever the visible section set changes (e.g. search).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, containerRef]);

  return activeSection;
}
