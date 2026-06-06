import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { Input, LightballTabs, type LightballTab } from "@/renderer/components/common";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import {
  buildShortcutRows,
  countRowsForContext,
  labelForContext,
  SHORTCUT_CONTEXTS,
  type ShortcutContext,
  type ShortcutRow,
} from "@/renderer/commands/shortcutCatalog";
import { buildCommandRegistry } from "@/renderer/commands/registry";
import { SettingsPage } from "./SettingsForm";

export function ShortcutsSettings() {
  const [query, setQuery] = useState("");
  const [activeContext, setActiveContext] = useState<ShortcutContext>("all");
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const loaded = useKeybindingStore((state) => state.loaded);
  const loadKeybindings = useKeybindingStore((state) => state.load);
  const platform = readBridge().platform;

  useEffect(() => {
    if (loaded) return;
    void loadKeybindings().catch((error) => {
      console.error("[renderer] failed to load keybindings:", error);
    });
  }, [loadKeybindings, loaded]);

  const rows = buildShortcutRows(buildCommandRegistry(), keybindings, platform);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (activeContext !== "all" && !row.contexts.includes(activeContext)) return false;
    if (!normalizedQuery) return true;
    return row.searchText.includes(normalizedQuery);
  });
  const tabs: LightballTab<ShortcutContext>[] = SHORTCUT_CONTEXTS.map((context) => ({
    id: context.id,
    label: context.label,
    trailing: context.id === "all" ? rows.length : countRowsForContext(rows, context.id),
  }));

  return (
    <SettingsPage title="Shortcuts" bodyClassName="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
        <Input
          aria-label="Search shortcuts"
          className="w-full pl-9"
          placeholder="Search shortcuts"
          value={query}
          variant="secondary"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <LightballTabs
        ariaLabel="Shortcut contexts"
        active={activeContext}
        className="max-w-full overflow-x-auto"
        tabs={tabs}
        onChange={setActiveContext}
        shape="rounded"
      />

      <div className="overflow-hidden rounded-md border border-[color:var(--border)]">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(128px,190px)] gap-3 border-b border-[color:var(--border)] bg-foreground/[0.03] px-4 py-2 text-[11px] font-semibold uppercase text-muted">
          <span>Command</span>
          <span>Keybinding</span>
        </div>
        {visibleRows.length > 0 ? (
          visibleRows.map((row) => <ShortcutRowView key={row.id} row={row} />)
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted">No shortcuts found</div>
        )}
      </div>
    </SettingsPage>
  );
}

function ShortcutRowView(props: { row: ShortcutRow }) {
  const { row } = props;
  const contexts = row.contexts.filter((context) => context !== "all");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(128px,190px)] gap-3 border-b border-[color:var(--border)] px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{row.title}</div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="truncate">{row.description}</span>
          {contexts.map((context) => (
            <span
              key={context}
              className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] uppercase text-muted/80"
            >
              {labelForContext(context)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 self-center">
        {row.keys.length > 0 ? (
          row.keys.map((key) => (
            <span
              key={key}
              className="rounded-md bg-foreground/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-foreground/90"
            >
              {key}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted">Unassigned</span>
        )}
      </div>
    </div>
  );
}
