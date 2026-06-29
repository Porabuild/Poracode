import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button, Input } from "@/renderer/components/common";
import {
  MCP_CATALOG,
  MCP_CATALOG_CATEGORY_LABELS,
  type McpCatalogEntry,
} from "@/shared/mcpCatalog";
import { transportBadge } from "./mcpFormUtils";

export function McpMarketplace(props: {
  /** Catalog ids already installed in the current scope. */
  installedCatalogIds: ReadonlySet<string>;
  onAdd: (entry: McpCatalogEntry) => void;
}) {
  const { installedCatalogIds, onAdd } = props;
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? MCP_CATALOG.filter(
        (entry) =>
          entry.title.toLowerCase().includes(normalizedQuery) ||
          entry.name.toLowerCase().includes(normalizedQuery) ||
          entry.description.toLowerCase().includes(normalizedQuery),
      )
    : MCP_CATALOG;

  return (
    <div className="space-y-3">
      <Input
        aria-label="Search MCP marketplace"
        placeholder="Search servers…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((entry) => {
          const installed = installedCatalogIds.has(entry.id);
          return (
            <div
              key={entry.id}
              className="flex flex-col gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--row-hover)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {entry.title}
                    </span>
                    <span className="shrink-0 rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {transportBadge(entry.transport)}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted">
                    {MCP_CATALOG_CATEGORY_LABELS[entry.category]}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={installed ? "tertiary" : "secondary"}
                  isDisabled={installed}
                  onPress={() => onAdd(entry)}
                >
                  {installed ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                  {installed ? "Added" : "Add"}
                </Button>
              </div>
              <p className="text-xs text-muted">{entry.description}</p>
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <p className="col-span-full py-6 text-center text-xs text-muted">No matching servers.</p>
        ) : null}
      </div>
    </div>
  );
}
