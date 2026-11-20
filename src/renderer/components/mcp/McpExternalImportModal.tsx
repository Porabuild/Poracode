import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { useEffect, useId, useRef, useState } from "react";
import { Button, ButtonGroup, Checkbox, Modal } from "@heroui/react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  isReservedMcpServerName,
  type DiscoverExternalMcpServersPayload,
  type McpExternalServerCandidate,
  type McpExternalServerGroup,
  type McpExternalUnsupportedReason,
  type McpServer,
  type ProjectLocation,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import {
  GLOBAL_MCP_DESTINATION_ID,
  MCP_PROJECT_DESTINATION_PREFIX,
  MCP_WSL_DESTINATION_PREFIX,
  McpProjectDestinationDropdown,
} from "./McpProjectDestinationDropdown";

/** A project the modal can scan as a source or write to as a destination. */
export interface McpImportProject {
  id: string;
  name: string;
  location: ProjectLocation;
  servers: McpServer[];
}

export type McpImportDestination = { scope: "user" } | { scope: "project"; projectId: string };

export interface McpExternalImportModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Preselects this project as source and destination when it exists. */
  defaultProjectId?: string;
  userServers: McpServer[];
  projects: McpImportProject[];
  onImport: (destination: McpImportDestination, servers: McpServer[]) => void;
}

type DiscoveryState =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "success"; groups: McpExternalServerGroup[] };

type DisabledReason = "reserved" | "existing" | "duplicate" | McpExternalUnsupportedReason;

interface CandidateRow {
  key: string;
  providerId: string;
  providerLabel: string;
  server: McpExternalServerCandidate;
  disabledReason?: DisabledReason;
}

const USER_KEY = GLOBAL_MCP_DESTINATION_ID;
const WSL_KEY_PREFIX = MCP_WSL_DESTINATION_PREFIX;
const PROJECT_KEY_PREFIX = MCP_PROJECT_DESTINATION_PREFIX;
const MIN_REFRESH_SPIN_MS = 600;

type SourceSelection =
  | { kind: "user" }
  | { kind: "wsl"; distro: string }
  | { kind: "project"; projectId: string };

function sourceSelectionFromKey(key: string): SourceSelection {
  if (key.startsWith(WSL_KEY_PREFIX))
    return { kind: "wsl", distro: key.slice(WSL_KEY_PREFIX.length) };
  if (key.startsWith(PROJECT_KEY_PREFIX)) {
    return { kind: "project", projectId: key.slice(PROJECT_KEY_PREFIX.length) };
  }
  return { kind: "user" };
}

function destinationFromKey(key: string): McpImportDestination {
  return key.startsWith(PROJECT_KEY_PREFIX)
    ? { scope: "project", projectId: key.slice(PROJECT_KEY_PREFIX.length) }
    : { scope: "user" };
}

function candidateKey(providerId: string, candidateId: string): string {
  return `${providerId}\u0000${candidateId}`;
}

function buildCandidateRows(
  groups: readonly McpExternalServerGroup[],
  existingServers: readonly McpServer[],
): CandidateRow[] {
  const existingNames = new Set(existingServers.map((server) => server.name.toLowerCase()));
  const discoveredNames = new Set<string>();
  const rows: CandidateRow[] = [];

  for (const group of groups) {
    for (const server of group.servers) {
      const normalizedName = server.name.toLowerCase();
      let disabledReason: DisabledReason | undefined;
      if (isReservedMcpServerName(server.name)) disabledReason = "reserved";
      else if (existingNames.has(normalizedName)) disabledReason = "existing";
      else if (server.unsupportedReason) {
        disabledReason = server.unsupportedReason;
      } else if (discoveredNames.has(normalizedName)) disabledReason = "duplicate";
      else discoveredNames.add(normalizedName);

      rows.push({
        key: candidateKey(group.providerId, server.id),
        providerId: group.providerId,
        providerLabel: group.providerLabel,
        server,
        ...(disabledReason ? { disabledReason } : {}),
      });
    }
  }

  return rows;
}

export function McpExternalImportModal(props: McpExternalImportModalProps) {
  const { t } = useLingui();
  const groupsId = useId();
  const spinTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const defaultProject = props.projects.find((project) => project.id === props.defaultProjectId);
  const defaultSourceKey = defaultProject ? `${PROJECT_KEY_PREFIX}${defaultProject.id}` : USER_KEY;
  const [sourceKey, setSourceKey] = useState(defaultSourceKey);
  const [destKey, setDestKey] = useState(defaultSourceKey);
  const [discovery, setDiscovery] = useState<DiscoveryState>({ status: "idle" });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshSpinning, setRefreshSpinning] = useState(false);
  const [wslDistros, setWslDistros] = useState<string[]>([]);
  const [expandedProviders, setExpandedProviders] = useState<ReadonlySet<string>>(new Set());
  const [selectedCandidates, setSelectedCandidates] = useState<ReadonlySet<string>>(new Set());

  const isWindows = readBridge().platform === "win32";

  // Reset the modal chrome whenever it closes (or the default source changes
  // while closed), tracked during render instead of an effect.
  const [prevModalReset, setPrevModalReset] = useState({
    open: props.isOpen,
    source: defaultSourceKey,
  });
  if (prevModalReset.open !== props.isOpen || prevModalReset.source !== defaultSourceKey) {
    setPrevModalReset({ open: props.isOpen, source: defaultSourceKey });
    if (!props.isOpen) {
      setSourceKey(defaultSourceKey);
      setDestKey(defaultSourceKey);
      setDiscovery({ status: "idle" });
      setExpandedProviders(new Set());
      setSelectedCandidates(new Set());
    }
  }

  useEffect(() => {
    if (!props.isOpen || !isWindows) return;
    let active = true;
    void readBridge()
      .listWslDistros()
      .then((distros) => {
        if (active) setWslDistros(distros);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isWindows, props.isOpen]);

  useEffect(() => () => clearTimeout(spinTimer.current), []);

  const source = sourceSelectionFromKey(sourceKey);
  const sourceProject =
    source.kind === "project"
      ? props.projects.find((project) => project.id === source.projectId)
      : undefined;
  let request: DiscoverExternalMcpServersPayload | undefined;
  if (source.kind === "user") request = { sourceScope: "user" };
  else if (source.kind === "wsl") request = { sourceScope: "wsl-user", distro: source.distro };
  else if (sourceProject) {
    request = { sourceScope: "workspace", projectLocation: sourceProject.location };
  }
  // The discovery request plus the manual-refresh generation. Parsed back in
  // the effect below so the refresh trigger is a consumed value rather than
  // a re-run-only dependency.
  const discoveryRequestKey =
    request === undefined
      ? undefined
      : JSON.stringify({ version: refreshVersion, payload: request });

  // Opening (or a new source/refresh while open) raises the loading state and
  // clears the selection during render; the fetch below only settles through
  // async callbacks.
  const [prevDiscoveryKey, setPrevDiscoveryKey] = useState({
    open: props.isOpen,
    request: discoveryRequestKey,
  });
  if (
    prevDiscoveryKey.open !== props.isOpen ||
    (props.isOpen && prevDiscoveryKey.request !== discoveryRequestKey)
  ) {
    setPrevDiscoveryKey({ open: props.isOpen, request: discoveryRequestKey });
    if (props.isOpen) {
      if (discoveryRequestKey === undefined) {
        setDiscovery({ status: "error" });
      } else {
        setDiscovery({ status: "loading" });
        setExpandedProviders(new Set());
        setSelectedCandidates(new Set());
      }
    }
  }

  useEffect(() => {
    if (!props.isOpen || discoveryRequestKey === undefined) return;
    const { payload } = JSON.parse(discoveryRequestKey) as {
      version: number;
      payload: DiscoverExternalMcpServersPayload;
    };

    let active = true;

    void readBridge()
      .discoverExternalMcpServers(payload)
      .then((result) => {
        if (!active) return;
        setDiscovery({ status: "success", groups: result.groups });
      })
      .catch(() => {
        if (!active) return;
        setDiscovery({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, [props.isOpen, discoveryRequestKey]);

  const destination = destinationFromKey(destKey);
  const destinationProject =
    destination.scope === "project"
      ? props.projects.find((project) => project.id === destination.projectId)
      : undefined;
  const groups = discovery.status === "success" ? discovery.groups : [];
  const destinationServers =
    destination.scope === "user" ? props.userServers : (destinationProject?.servers ?? []);
  const candidateRows = buildCandidateRows(groups, destinationServers);
  const importableRows = candidateRows.filter((row) => row.disabledReason === undefined);
  const selectedRows = importableRows.filter((row) => selectedCandidates.has(row.key));
  const allSelected = importableRows.length > 0 && selectedRows.length === importableRows.length;
  const someSelected = selectedRows.length > 0 && !allSelected;

  const refresh = () => {
    setRefreshVersion((version) => version + 1);
    setRefreshSpinning(true);
    clearTimeout(spinTimer.current);
    spinTimer.current = setTimeout(() => setRefreshSpinning(false), MIN_REFRESH_SPIN_MS);
  };

  const toggleAll = (selected: boolean) => {
    setSelectedCandidates(selected ? new Set(importableRows.map((row) => row.key)) : new Set());
  };

  const toggleProvider = (providerId: string, selected: boolean) => {
    const providerKeys = importableRows
      .filter((row) => row.providerId === providerId)
      .map((row) => row.key);
    setSelectedCandidates((current) => {
      const next = new Set(current);
      for (const key of providerKeys) {
        if (selected) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const toggleCandidate = (key: string, selected: boolean) => {
    setSelectedCandidates((current) => {
      const next = new Set(current);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleExpanded = (providerId: string) => {
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const importSelected = () => {
    if (selectedRows.length === 0) return;
    props.onImport(
      destination,
      selectedRows.map(({ server }) => ({
        id: crypto.randomUUID(),
        name: server.name,
        description: "",
        enabled: server.enabled,
        timeoutMs: server.timeoutMs,
        transport: server.transport,
      })),
    );
    props.onOpenChange(false);
  };

  const hasWslSources = isWindows && wslDistros.length > 0;
  const hostGlobalLabel = hasWslSources ? t`Global (Windows)` : t`Global`;
  const wslSourceLabel = (distro: string) => t`WSL (${distro})`;
  const sourceLabel =
    source.kind === "user"
      ? hostGlobalLabel
      : source.kind === "wsl"
        ? wslSourceLabel(source.distro)
        : (sourceProject?.name ?? t`Project`);
  const destinationProjectName = destinationProject?.name;
  const destinationLabel = destinationProjectName
    ? t`Import to ${destinationProjectName}`
    : t`Import to Global`;
  const refreshSpin = refreshSpinning || discovery.status === "loading";

  return (
    <Modal.Backdrop isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <Modal.Container placement="center" scroll="inside" size="lg">
        <Modal.Dialog className="sm:max-w-[672px]">
          <Modal.CloseTrigger />
          <Modal.Header className="pr-12">
            <div className="flex w-full items-center justify-between gap-4">
              <Modal.Heading>
                <Trans>Import external agent MCP servers</Trans>
              </Modal.Heading>
              <div className="flex shrink-0 items-center gap-1">
                <McpProjectDestinationDropdown
                  ariaLabel={t`MCP server source scope`}
                  placement="bottom end"
                  projects={props.projects}
                  wslDistros={wslDistros}
                  value={sourceKey}
                  trigger={
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t`MCP server source scope`}
                      className="text-muted"
                    >
                      {sourceLabel}
                      <ChevronDown className="size-3.5" />
                    </Button>
                  }
                  onChange={setSourceKey}
                />
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`Refresh MCP server sources`}
                  isDisabled={discovery.status === "loading"}
                  onPress={refresh}
                >
                  <RefreshCw className={`size-3.5 ${refreshSpin ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </Modal.Header>

          <Modal.Body className="flex h-[min(32rem,65vh)] min-h-80 flex-col gap-3 p-4">
            {discovery.status === "success" && candidateRows.length > 0 ? (
              <div className="flex items-center justify-between px-1">
                <Checkbox
                  aria-label={t`Select all MCP servers`}
                  isSelected={allSelected}
                  isIndeterminate={someSelected}
                  isDisabled={importableRows.length === 0}
                  onChange={toggleAll}
                >
                  <Checkbox.Content>
                    <Checkbox.Control className="border border-[var(--hairline-strong)] bg-surface-secondary shadow-none">
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Trans>Select all</Trans>
                  </Checkbox.Content>
                </Checkbox>
                <span className="text-xs text-muted" aria-live="polite">
                  <Trans>
                    {selectedRows.length}/{importableRows.length} selected
                  </Trans>
                </span>
              </div>
            ) : null}

            <ContentSurface
              id={groupsId}
              className="min-h-0 flex-1 overflow-y-auto"
              aria-busy={discovery.status === "loading"}
            >
              {discovery.status === "idle" || discovery.status === "loading" ? (
                <div className="flex h-full min-h-40 items-center justify-center gap-2 text-xs text-muted">
                  <RefreshCw className="size-3.5 animate-spin" />
                  <Trans>Scanning provider configurations…</Trans>
                </div>
              ) : discovery.status === "error" ? (
                <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-4 text-center">
                  <p role="alert" className="text-xs text-danger">
                    <Trans>Couldn&apos;t scan MCP server configurations.</Trans>
                  </p>
                  <Button size="sm" variant="tertiary" onPress={refresh}>
                    <Trans>Retry</Trans>
                  </Button>
                </div>
              ) : candidateRows.length === 0 ? (
                <div className="flex h-full min-h-40 items-center justify-center px-4 text-center text-xs text-muted">
                  <Trans>No MCP servers found in this scope.</Trans>
                </div>
              ) : (
                groups.map((group) => {
                  const groupRows = candidateRows.filter(
                    (row) => row.providerId === group.providerId,
                  );
                  if (groupRows.length === 0) return null;
                  const importableGroupRows = groupRows.filter(
                    (row) => row.disabledReason === undefined,
                  );
                  const selectedGroupRows = importableGroupRows.filter((row) =>
                    selectedCandidates.has(row.key),
                  );
                  const groupSelected =
                    importableGroupRows.length > 0 &&
                    selectedGroupRows.length === importableGroupRows.length;
                  const groupIndeterminate = selectedGroupRows.length > 0 && !groupSelected;
                  const expanded = expandedProviders.has(group.providerId);
                  const childListId = `${groupsId}-${group.providerId}`;
                  const providerLabel = group.providerLabel;

                  return (
                    <div
                      key={group.providerId}
                      className="border-b border-[var(--hairline-soft)] last:border-b-0"
                    >
                      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
                        <Checkbox
                          aria-label={t`Select all MCP servers from ${providerLabel}`}
                          isSelected={groupSelected}
                          isIndeterminate={groupIndeterminate}
                          isDisabled={importableGroupRows.length === 0}
                          onChange={(selected) => toggleProvider(group.providerId, selected)}
                        >
                          <Checkbox.Content>
                            <Checkbox.Control className="border border-[var(--hairline-strong)] bg-surface-secondary shadow-none">
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                          </Checkbox.Content>
                        </Checkbox>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="shrink-0 text-sm font-medium text-foreground">
                              {group.providerLabel}
                            </span>
                            <span className="truncate font-mono text-xs text-muted">
                              {group.sourcePath}
                            </span>
                            <span className="shrink-0 text-xs text-muted">
                              <Plural
                                value={groupRows.length}
                                one="# MCP server"
                                other="# MCP servers"
                              />
                            </span>
                          </div>
                        </div>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label={
                            expanded
                              ? t`Hide MCP servers from ${providerLabel}`
                              : t`Show MCP servers from ${providerLabel}`
                          }
                          aria-expanded={expanded}
                          aria-controls={childListId}
                          onPress={() => toggleExpanded(group.providerId)}
                        >
                          <ChevronRight
                            className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
                          />
                        </Button>
                      </div>
                      {expanded ? (
                        <div id={childListId} className="border-t border-[var(--hairline)] py-1">
                          {groupRows.map((row) => {
                            const serverName = row.server.name;
                            let disabledLabel: string | undefined;
                            if (row.disabledReason === "reserved") {
                              disabledLabel = t`Managed by Poracode`;
                            } else if (row.disabledReason === "existing") {
                              disabledLabel = t`Already configured`;
                            } else if (row.disabledReason === "duplicate") {
                              disabledLabel = t`Duplicate server name in scan`;
                            } else if (row.disabledReason === "authentication") {
                              disabledLabel = t`Authentication setup cannot be imported`;
                            } else if (row.disabledReason === "tool-restrictions") {
                              disabledLabel = t`Tool restrictions cannot be imported`;
                            } else if (row.disabledReason === "sensitive-values") {
                              disabledLabel = t`Contains sensitive values; add manually`;
                            }
                            return (
                              <Checkbox
                                key={row.key}
                                aria-label={
                                  disabledLabel
                                    ? t`${serverName} from ${providerLabel}: ${disabledLabel}`
                                    : t`Select ${serverName} from ${providerLabel}`
                                }
                                className="block px-11 py-1.5"
                                isSelected={
                                  row.disabledReason === undefined &&
                                  selectedCandidates.has(row.key)
                                }
                                isDisabled={row.disabledReason !== undefined}
                                onChange={(selected) => toggleCandidate(row.key, selected)}
                              >
                                <Checkbox.Content className="w-full min-w-0">
                                  <Checkbox.Control className="border border-[var(--hairline-strong)] bg-surface-secondary shadow-none">
                                    <Checkbox.Indicator />
                                  </Checkbox.Control>
                                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                    {serverName}
                                  </span>
                                  {disabledLabel ? (
                                    <span className="shrink-0 text-xs text-muted">
                                      {disabledLabel}
                                    </span>
                                  ) : null}
                                </Checkbox.Content>
                              </Checkbox>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </ContentSurface>
          </Modal.Body>

          <Modal.Footer className="justify-between">
            <span className="text-xs text-muted" aria-live="polite">
              {discovery.status === "success" ? (
                <Trans>
                  Found{" "}
                  <Plural
                    value={importableRows.length}
                    one="# importable MCP server"
                    other="# importable MCP servers"
                  />
                </Trans>
              ) : null}
            </span>
            <ButtonGroup size="sm" variant="tertiary" isDisabled={selectedRows.length === 0}>
              <Button onPress={importSelected}>{destinationLabel}</Button>
              <McpProjectDestinationDropdown
                ariaLabel={t`Import destination`}
                placement="top end"
                projects={props.projects}
                value={destKey}
                trigger={
                  /* Nested inside <Dropdown>, so the group's variant/size/disabled
                     context doesn't reach this trigger — mirror them explicitly. */
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    isDisabled={selectedRows.length === 0}
                    aria-label={t`Choose import destination`}
                  >
                    <ButtonGroup.Separator />
                    <ChevronDown className="size-3.5" />
                  </Button>
                }
                onChange={setDestKey}
              />
            </ButtonGroup>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
