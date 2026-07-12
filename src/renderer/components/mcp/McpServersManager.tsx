import { useState, type ReactNode } from "react";
import { Input, Switch, Tooltip } from "@heroui/react";
import {
  AppWindow,
  Download,
  Globe,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  BUILT_IN_MCP_SERVER_NAMES,
  BUILT_IN_MCP_SERVER_TOOL_COUNTS,
  type BuiltInMcpServerDisabled,
  type BuiltInMcpServerId,
  type McpServer,
  type ProjectLocation,
} from "@/shared/contracts";
import { Button } from "@/renderer/components/common";
import { McpExternalImportModal, type McpImportDestination } from "./McpExternalImportModal";
import {
  GLOBAL_MCP_DESTINATION_ID,
  mcpProjectDestinationId,
  type McpProjectDestination,
} from "./McpProjectDestinationDropdown";
import { McpServerEditor } from "./McpServerEditor";
import { mcpTransportSummary, serializeMcpServersJson } from "./mcpFormUtils";
import { type McpServerProbeState, useMcpServerProbes } from "./useMcpServerProbes";
import { useMcpServerOauth } from "./useMcpServerOauth";

const EMPTY_MCP_SERVERS: McpServer[] = [];
type McpServerScope = "user" | "workspace";

interface EditorState {
  key: string;
  server?: McpServer;
  sourceDestinationId?: string;
  selectedDestinationId: string;
}

interface McpServerSource {
  servers: McpServer[];
  projectId?: string;
  projectLocation?: ProjectLocation;
  projectName?: string;
  onChange: (servers: McpServer[]) => void;
}

interface McpEditorDestination {
  id: string;
  project?: McpProjectDestination;
  source: McpServerSource;
}

/** Every app project the import modal can scan or import into. */
export interface McpImportProjectTarget {
  id: string;
  name: string;
  location: ProjectLocation;
  servers: McpServer[];
  onChange: (servers: McpServer[]) => void;
}

export function McpServersManager(props: {
  sources: {
    user: McpServerSource;
    workspace?: McpServerSource;
  };
  importProjects?: McpImportProjectTarget[];
  defaultScope: McpServerScope;
  disabledBuiltIns?: BuiltInMcpServerDisabled;
  onBuiltInDisabledChange?: (id: BuiltInMcpServerId, disabled: boolean) => void;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | undefined>();
  const [importOpen, setImportOpen] = useState(false);
  const oauth = useMcpServerOauth();
  const userProbes = useMcpServerProbes(props.sources.user.servers);
  const workspaceProbes = useMcpServerProbes(
    props.sources.workspace?.servers ?? EMPTY_MCP_SERVERS,
    props.sources.workspace?.projectLocation,
  );
  const defaultScope =
    props.defaultScope === "workspace" && !props.sources.workspace ? "user" : props.defaultScope;
  const defaultSource =
    defaultScope === "workspace"
      ? (props.sources.workspace ?? props.sources.user)
      : props.sources.user;
  const scopeOrder: McpServerScope[] =
    defaultScope === "user" ? ["user", "workspace"] : ["workspace", "user"];
  const sources = scopeOrder.flatMap((scope) => {
    const source = scope === "user" ? props.sources.user : props.sources.workspace;
    return source ? [{ scope, source }] : [];
  });
  const projectDestinations: McpEditorDestination[] = (props.importProjects ?? []).map(
    (project) => ({
      id: mcpProjectDestinationId(project.id),
      project: { id: project.id, name: project.name, location: project.location },
      source: {
        servers: project.servers,
        projectId: project.id,
        projectLocation: project.location,
        projectName: project.name,
        onChange: project.onChange,
      },
    }),
  );
  const workspaceSource = props.sources.workspace;
  if (
    workspaceSource?.projectId &&
    !projectDestinations.some(
      (destination) => destination.id === mcpProjectDestinationId(workspaceSource.projectId!),
    )
  ) {
    projectDestinations.unshift({
      id: mcpProjectDestinationId(workspaceSource.projectId),
      ...(workspaceSource.projectLocation
        ? {
            project: {
              id: workspaceSource.projectId,
              name: workspaceSource.projectName ?? workspaceSource.projectId,
              location: workspaceSource.projectLocation,
            },
          }
        : {}),
      source: workspaceSource,
    });
  }
  const editorDestinations = [
    { id: GLOBAL_MCP_DESTINATION_ID, source: props.sources.user },
    ...projectDestinations,
  ];
  const defaultDestinationId =
    defaultScope === "workspace" && workspaceSource?.projectId
      ? mcpProjectDestinationId(workspaceSource.projectId)
      : GLOBAL_MCP_DESTINATION_ID;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleServers = sources.flatMap(({ scope, source }) =>
    source.servers
      .filter((server) =>
        [server.name, server.description, mcpTransportSummary(server.transport)]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .map((server) => ({ scope, source, server })),
  );

  const builtInDescription = t`Provided and managed by Poracode for supported agents.`;
  const builtIns: BuiltInRow[] = [
    {
      id: "browser",
      name: BUILT_IN_MCP_SERVER_NAMES.browser,
      toolCount: BUILT_IN_MCP_SERVER_TOOL_COUNTS.browser,
      label: t`Browser`,
      description: builtInDescription,
      icon: <Globe className="size-4" />,
    },
    {
      id: "subagents",
      name: BUILT_IN_MCP_SERVER_NAMES.subagents,
      toolCount: BUILT_IN_MCP_SERVER_TOOL_COUNTS.subagents,
      label: t`Subagents`,
      description: builtInDescription,
      icon: <Users className="size-4" />,
    },
    {
      id: "chrome",
      name: BUILT_IN_MCP_SERVER_NAMES.chrome,
      toolCount: BUILT_IN_MCP_SERVER_TOOL_COUNTS.chrome,
      label: t`Chrome`,
      description: builtInDescription,
      icon: <AppWindow className="size-4" />,
    },
    {
      id: "computer-use",
      name: BUILT_IN_MCP_SERVER_NAMES["computer-use"],
      toolCount: BUILT_IN_MCP_SERVER_TOOL_COUNTS["computer-use"],
      label: t`Computer Use`,
      description: builtInDescription,
      icon: <Monitor className="size-4" />,
    },
    {
      id: "app-controls",
      name: BUILT_IN_MCP_SERVER_NAMES["app-controls"],
      toolCount: BUILT_IN_MCP_SERVER_TOOL_COUNTS["app-controls"],
      label: t`App Controls`,
      description: builtInDescription,
      icon: <Settings2 className="size-4" />,
    },
  ];
  const visibleBuiltIns = builtIns.filter((server) =>
    [server.name, server.label, server.description]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );

  const upsert = (server: McpServer) => {
    if (!editor) return;
    const targetSource = editorDestinations.find(
      (destination) => destination.id === editor.selectedDestinationId,
    )?.source;
    if (!targetSource) return;
    const existingIndex = targetSource.servers.findIndex((item) => item.id === server.id);
    targetSource.onChange(
      existingIndex === -1
        ? [...targetSource.servers, server]
        : targetSource.servers.map((item) => (item.id === server.id ? server : item)),
    );
    if (
      editor.server &&
      editor.sourceDestinationId &&
      editor.sourceDestinationId !== editor.selectedDestinationId
    ) {
      const source = editorDestinations.find(
        (destination) => destination.id === editor.sourceDestinationId,
      )?.source;
      const sourceServerId = editor.server.id;
      source?.onChange(source.servers.filter((item) => item.id !== sourceServerId));
    }
    setEditor(undefined);
  };

  const importExternalServers = (destination: McpImportDestination, servers: McpServer[]) => {
    const target =
      destination.scope === "user"
        ? props.sources.user
        : props.importProjects?.find((project) => project.id === destination.projectId);
    if (!target) return;
    const names = new Set(target.servers.map((server) => server.name.toLowerCase()));
    const imported = servers.filter((server) => {
      const name = server.name.toLowerCase();
      if (names.has(name)) return false;
      names.add(name);
      return true;
    });
    if (imported.length > 0) target.onChange([...target.servers, ...imported]);
  };

  const exportServers = () => {
    const blob = new Blob([`${serializeMcpServersJson(defaultSource.servers)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "poracode-mcp-servers.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const hasVisibleRows =
    visibleServers.length > 0 ||
    (props.disabledBuiltIns !== undefined && visibleBuiltIns.length > 0);

  return (
    <div className="space-y-5">
      {editor ? (
        <McpServerEditor
          key={editor.key}
          {...(editor.server ? { server: editor.server } : {})}
          {...(editor.sourceDestinationId === editor.selectedDestinationId && editor.server
            ? { previousName: editor.server.name }
            : {})}
          existingNames={
            new Set(
              editorDestinations
                .find((destination) => destination.id === editor.selectedDestinationId)
                ?.source.servers.map((server) => server.name.toLowerCase()) ?? [],
            )
          }
          scopeId={editor.selectedDestinationId}
          projects={projectDestinations.flatMap((destination) =>
            destination.project ? [destination.project] : [],
          )}
          onScopeChange={(selectedDestinationId) =>
            setEditor((current) => (current ? { ...current, selectedDestinationId } : current))
          }
          onSave={upsert}
          onCancel={() => setEditor(undefined)}
        />
      ) : null}
      <McpExternalImportModal
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        {...(defaultScope === "workspace" && props.sources.workspace?.projectId
          ? { defaultProjectId: props.sources.workspace.projectId }
          : {})}
        userServers={props.sources.user.servers}
        projects={props.importProjects ?? []}
        onImport={importExternalServers}
      />

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
          <Input
            aria-label={t`Search MCP servers`}
            className="w-full pl-9"
            placeholder={t`Search MCP servers...`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="tertiary"
          onPress={() =>
            setEditor({ key: crypto.randomUUID(), selectedDestinationId: defaultDestinationId })
          }
        >
          <Plus className="size-4" />
          <Trans>Add MCP server</Trans>
        </Button>
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              aria-label={t`Import MCP servers`}
              onPress={() => setImportOpen(true)}
            >
              <Download className="size-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <Trans>Import MCP servers</Trans>
          </Tooltip.Content>
        </Tooltip>
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              aria-label={t`Export MCP servers`}
              isDisabled={defaultSource.servers.length === 0}
              onPress={exportServers}
            >
              <Upload className="size-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <Trans>Export MCP servers</Trans>
          </Tooltip.Content>
        </Tooltip>
      </div>

      {visibleServers.length > 0 ? (
        <section className="space-y-2">
          <SectionHeading title={t`Configured MCP servers`} count={visibleServers.length} />
          <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
            {visibleServers.map(({ scope, source, server }) => {
              const probes = scope === "user" ? userProbes : workspaceProbes;
              const destinationId =
                scope === "user"
                  ? GLOBAL_MCP_DESTINATION_ID
                  : source.projectId
                    ? mcpProjectDestinationId(source.projectId)
                    : GLOBAL_MCP_DESTINATION_ID;
              const serverUrl =
                server.transport.type === "http" || server.transport.type === "sse"
                  ? server.transport.url
                  : undefined;
              return (
                <ConfiguredServerRow
                  key={`${scope}:${server.id}`}
                  server={server}
                  scopeLabel={scope === "user" ? t`Global` : (source.projectName ?? t`Workspace`)}
                  oauth={{
                    supported: serverUrl !== undefined,
                    authenticated:
                      serverUrl !== undefined && oauth.authenticatedUrls.has(serverUrl),
                    busy: oauth.busyServerIds.has(server.id),
                    onAuthenticate: () => {
                      void oauth.authenticate(server).then((authenticated) => {
                        if (authenticated) probes.probe(server);
                      });
                    },
                    onSignOut: () => {
                      void oauth.signOut(server).then(() => probes.probe(server));
                    },
                  }}
                  probeState={
                    probes.states[server.id] ?? {
                      status: server.enabled ? "checking" : "disabled",
                    }
                  }
                  onProbe={() => probes.probe(server)}
                  onToggle={(enabled) =>
                    source.onChange(
                      source.servers.map((item) =>
                        item.id === server.id ? { ...item, enabled } : item,
                      ),
                    )
                  }
                  onEdit={() =>
                    setEditor({
                      key: `${scope}:${server.id}`,
                      server,
                      sourceDestinationId: destinationId,
                      selectedDestinationId: destinationId,
                    })
                  }
                  onDelete={() =>
                    source.onChange(source.servers.filter((item) => item.id !== server.id))
                  }
                />
              );
            })}
          </div>
        </section>
      ) : sources.every(({ source }) => source.servers.length === 0) && !normalizedQuery ? (
        <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] px-4 py-7 text-center">
          <p className="text-sm text-foreground">
            <Trans>No configured MCP servers yet</Trans>
          </p>
          <p className="mt-1 text-xs text-muted">
            <Trans>Add one manually or import from another agent.</Trans>
          </p>
        </div>
      ) : null}

      {props.disabledBuiltIns !== undefined ? (
        <section className="space-y-2">
          <div>
            <SectionHeading title={t`Built-in MCP servers`} count={visibleBuiltIns.length} />
            <p className="mt-0.5 text-xs text-muted">
              <Trans>
                Built-in servers are managed by Poracode. They can be disabled globally but cannot
                be edited or removed.
              </Trans>
            </p>
          </div>
          {visibleBuiltIns.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
              {visibleBuiltIns.map((server) => (
                <BuiltInServerRow
                  key={server.id}
                  server={server}
                  disabled={props.disabledBuiltIns?.[server.id] === true}
                  onToggle={(enabled) => props.onBuiltInDisabledChange?.(server.id, !enabled)}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {!hasVisibleRows && normalizedQuery ? (
        <p className="py-6 text-center text-xs text-muted">
          <Trans>No MCP servers match your search.</Trans>
        </p>
      ) : null}
    </div>
  );
}

function SectionHeading(props: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-xs font-semibold text-foreground">{props.title}</h2>
      <span className="text-xs text-muted">{props.count}</span>
    </div>
  );
}

interface ConfiguredServerRowOauth {
  supported: boolean;
  authenticated: boolean;
  busy: boolean;
  onAuthenticate: () => void;
  onSignOut: () => void;
}

function ConfiguredServerRow(props: {
  server: McpServer;
  scopeLabel: string;
  probeState: McpServerProbeState;
  oauth: ConfiguredServerRowOauth;
  onProbe: () => void;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const server = props.server;
  const serverName = server.name;
  const showAuthenticate =
    props.oauth.supported &&
    !props.oauth.authenticated &&
    props.probeState.status === "auth-required";
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-[var(--hairline)] px-3 py-2.5 last:border-b-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] text-muted">
        <Settings2 className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{server.name}</span>
          <Badge>{props.scopeLabel}</Badge>
          <Badge>{server.transport.type.toUpperCase()}</Badge>
        </div>
        <p className="truncate font-mono text-xs text-muted">
          {mcpTransportSummary(server.transport)}
        </p>
        {server.description ? (
          <p className="truncate text-xs text-muted/80">{server.description}</p>
        ) : null}
        <McpServerProbeStatus state={props.probeState} />
      </div>
      {showAuthenticate ? (
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={props.oauth.busy}
          onPress={props.oauth.onAuthenticate}
        >
          <Trans>Authenticate</Trans>
        </Button>
      ) : null}
      {props.oauth.authenticated ? (
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`Sign out of ${serverName}`}
              isDisabled={props.oauth.busy}
              onPress={props.oauth.onSignOut}
            >
              <LogOut className="size-3.5" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <Trans>Sign out</Trans>
          </Tooltip.Content>
        </Tooltip>
      ) : null}
      <Tooltip>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={
              props.probeState.status === "checking"
                ? t`Checking ${serverName}`
                : props.probeState.status === "auth-required" ||
                    props.probeState.status === "unavailable"
                  ? t`Retry ${serverName}`
                  : t`Check ${serverName} again`
            }
            isDisabled={!server.enabled || props.probeState.status === "checking"}
            onPress={props.onProbe}
          >
            <RefreshCw
              className={`size-3.5 ${props.probeState.status === "checking" ? "animate-spin" : ""}`}
            />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>
          {props.probeState.status === "checking" ? (
            <Trans>Checking</Trans>
          ) : props.probeState.status === "auth-required" ||
            props.probeState.status === "unavailable" ? (
            <Trans>Retry check</Trans>
          ) : (
            <Trans>Check again</Trans>
          )}
        </Tooltip.Content>
      </Tooltip>
      <Switch
        aria-label={server.enabled ? t`Disable ${serverName}` : t`Enable ${serverName}`}
        isSelected={server.enabled}
        onChange={props.onToggle}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={t`Edit ${serverName}`}
        onPress={props.onEdit}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={t`Delete ${serverName}`}
        onPress={props.onDelete}
      >
        <Trash2 className="size-3.5 text-danger" />
      </Button>
    </div>
  );
}

function McpServerProbeStatus(props: { state: McpServerProbeState }) {
  const { t } = useLingui();
  const state = props.state;

  if (state.status === "disabled") {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted" role="status">
        <span className="size-2 shrink-0 rounded-full bg-muted/50" aria-hidden="true" />
        <Trans>Disabled</Trans>
      </div>
    );
  }
  if (state.status === "checking") {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted" role="status">
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
        <Trans>Checking…</Trans>
      </div>
    );
  }
  if (state.status === "connected") {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted" role="status">
        <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
        <span className="text-success">
          <Trans>Connected</Trans>
        </span>
        <span aria-hidden="true">·</span>
        <Plural value={state.toolCount} one="# tool" other="# tools" />
      </div>
    );
  }
  if (state.status === "auth-required") {
    return (
      <div
        className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-warning"
        role="status"
      >
        <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
        <Trans>Authentication required</Trans>
        <span aria-hidden="true">·</span>
        <Trans>This server requires authentication before Poracode can check it.</Trans>
      </div>
    );
  }

  let errorMessage: string;
  switch (state.errorCode) {
    case "timeout":
      errorMessage = t`Connection timed out.`;
      break;
    case "command-not-found":
      errorMessage = t`Command not found.`;
      break;
    case "connection-failed":
      errorMessage = t`Connection failed.`;
      break;
    case "protocol-error":
      errorMessage = t`The server returned an invalid MCP response.`;
      break;
    case "invalid-config":
      errorMessage = t`The server configuration is invalid.`;
      break;
    case "probe-unavailable":
      errorMessage = t`MCP server checking is unavailable.`;
      break;
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-danger" role="status">
      <span className="size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
      <Trans>Unavailable</Trans>
      <span aria-hidden="true">·</span>
      <span>{errorMessage}</span>
    </div>
  );
}

interface BuiltInRow {
  id: BuiltInMcpServerId;
  name: string;
  toolCount: number;
  label: string;
  description: string;
  icon: ReactNode;
}

function BuiltInServerRow(props: {
  server: BuiltInRow;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const { t } = useLingui();
  const enabled = !props.disabled;
  const serverLabel = props.server.label;
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-[var(--hairline)] px-3 py-2.5 last:border-b-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] text-muted">
        {props.server.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{props.server.label}</span>
          <Badge>{props.server.name}</Badge>
          <Badge>{t`Built-in`}</Badge>
        </div>
        <p className="truncate text-xs text-muted">{props.server.description}</p>
        <p className="mt-1 text-xs text-muted">
          <Plural value={props.server.toolCount} one="# tool" other="# tools" />
        </p>
      </div>
      {props.disabled ? (
        <span className="text-xs text-muted">
          <Trans>Disabled globally</Trans>
        </span>
      ) : null}
      <Switch
        aria-label={enabled ? t`Disable ${serverLabel}` : t`Enable ${serverLabel}`}
        isSelected={enabled}
        onChange={props.onToggle}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
}

function Badge(props: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-md border border-[var(--hairline)] bg-surface-tertiary/60 px-1.5 py-0.5 text-[10px] font-medium text-muted">
      {props.children}
    </span>
  );
}
