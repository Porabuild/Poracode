import { useState, type ReactNode } from "react";
import { Switch } from "@heroui/react";
import { Pencil, Plus, Store, Trash2, ScanSearch, Server } from "lucide-react";
import type { DetectedMcpServer, McpServer } from "@/shared/contracts";
import { detectedToManagedServer } from "@/shared/contracts";
import { catalogEntryToServer, type McpCatalogEntry } from "@/shared/mcpCatalog";
import { Button, LightballTabs } from "@/renderer/components/common";
import { McpServerEditorDialog } from "./McpServerEditorDialog";
import { McpMarketplace } from "./McpMarketplace";
import { DetectedMcpPanel } from "./DetectedMcpPanel";
import { transportBadge, transportSummary } from "./mcpFormUtils";

type Tab = "servers" | "marketplace" | "detected";

export function McpManager(props: {
  servers: McpServer[];
  onChange: (servers: McpServer[]) => void;
  /** Absolute project path enabling project-scope detection. Omit for global. */
  projectPath?: string;
  /** Optional banner shown above the server list (e.g. inherited-globals note). */
  banner?: ReactNode;
}) {
  const { servers, onChange, projectPath, banner } = props;
  const [tab, setTab] = useState<Tab>("servers");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<McpServer | undefined>(undefined);
  const [setupHint, setSetupHint] = useState<string | undefined>(undefined);

  const managedNames = new Set(servers.map((s) => s.name.toLowerCase()));
  const installedCatalogIds = new Set(
    servers.map((s) => s.catalogId).filter((id): id is string => Boolean(id)),
  );

  const upsert = (server: McpServer) => {
    const idx = servers.findIndex((s) => s.id === server.id);
    if (idx === -1) onChange([...servers, server]);
    else onChange(servers.map((s) => (s.id === server.id ? server : s)));
  };

  const openEditor = (server: McpServer | undefined, hint?: string) => {
    setEditing(server);
    setSetupHint(hint);
    setEditorOpen(true);
  };
  const remove = (id: string) => onChange(servers.filter((s) => s.id !== id));
  const toggle = (id: string, enabled: boolean) =>
    onChange(servers.map((s) => (s.id === id ? { ...s, enabled } : s)));

  const addFromCatalog = (entry: McpCatalogEntry) => {
    const server = catalogEntryToServer(entry, crypto.randomUUID());
    upsert(server);
    openEditor(server, entry.setupHint);
    setTab("servers");
  };

  const importDetected = (detected: DetectedMcpServer) => {
    const server = detectedToManagedServer(detected, crypto.randomUUID());
    if (!server) return;
    // Avoid clobbering an existing managed server with the same name.
    if (managedNames.has(server.name.toLowerCase())) return;
    upsert(server);
    setTab("servers");
  };

  return (
    <div className="space-y-4">
      <LightballTabs
        ariaLabel="MCP server views"
        className="w-full"
        equalWidth
        shape="rounded"
        active={tab}
        onChange={setTab}
        tabs={[
          {
            id: "servers",
            icon: <Server className="size-3.5" />,
            label: `Servers${servers.length > 0 ? ` (${servers.length})` : ""}`,
          },
          { id: "marketplace", icon: <Store className="size-3.5" />, label: "Marketplace" },
          { id: "detected", icon: <ScanSearch className="size-3.5" />, label: "Detected" },
        ]}
      />

      {tab === "servers" ? (
        <div className="space-y-3">
          {banner}
          {servers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--hairline-strong)] px-4 py-8 text-center">
              <p className="text-sm text-foreground">No MCP servers yet</p>
              <p className="mt-1 text-xs text-muted">
                Add one manually, browse the Marketplace, or import a detected server.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className="group flex items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--row-hover)] px-3 py-2.5"
                >
                  <Switch
                    isSelected={server.enabled !== false}
                    onChange={(selected) => toggle(server.id, selected)}
                    aria-label={`Enable ${server.name}`}
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {server.label?.trim() || server.name}
                      </span>
                      <span className="shrink-0 rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        {transportBadge(server.transport)}
                      </span>
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted">
                      {transportSummary(server.transport)}
                    </div>
                  </div>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    aria-label={`Edit ${server.name}`}
                    onPress={() => openEditor(server)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    aria-label={`Remove ${server.name}`}
                    onPress={() => remove(server.id)}
                  >
                    <Trash2 className="size-3.5 text-danger" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button variant="secondary" onPress={() => openEditor(undefined)}>
            <Plus className="size-4" />
            Add MCP server
          </Button>
        </div>
      ) : null}

      {tab === "marketplace" ? (
        <McpMarketplace installedCatalogIds={installedCatalogIds} onAdd={addFromCatalog} />
      ) : null}

      {tab === "detected" ? (
        <DetectedMcpPanel
          {...(projectPath ? { projectPath } : {})}
          managedNames={managedNames}
          onImport={importDetected}
        />
      ) : null}

      <McpServerEditorDialog
        isOpen={editorOpen}
        server={editing}
        existingNames={managedNames}
        setupHint={setupHint}
        onSave={upsert}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}
