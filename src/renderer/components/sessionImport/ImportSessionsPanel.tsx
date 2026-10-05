import { useEffect, useState } from "react";
import { Checkbox, toast } from "@heroui/react";
import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { ImportSessionFacets, ImportableSession } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { Button, Input, PixelLoader, Select } from "@/renderer/components/common";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import {
  ALL,
  applyImportFilters,
  EMPTY_FILTERS,
  reconcileFilters,
  type ImportFilters,
} from "./importFilters";
import { findImportedThreadId, importSessions } from "./importSessionsActions";

const SEARCH_DEBOUNCE_MS = 400;
const EMPTY_FACETS: ImportSessionFacets = { agentKinds: [], folders: [] };

function folderName(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

/** Lists CLI conversations found on disk and turns the chosen ones into threads. */
export function ImportSessionsPanel() {
  const { t } = useLingui();
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const agentStatuses = useAgentStatusesStore((state) => state.agentStatuses);
  const [sessions, setSessions] = useState<ImportableSession[]>([]);
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [filters, setFilters] = useState<ImportFilters>(EMPTY_FILTERS);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [scannedFor, setScannedFor] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(filters.query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [filters.query]);

  const scanKey = JSON.stringify([filters.agentKind, filters.folder, debouncedQuery]);
  const rescanning = scannedFor !== scanKey;

  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .listImportableSessions({
        ...(filters.agentKind === ALL ? {} : { agentKind: filters.agentKind }),
        ...(filters.folder === ALL ? {} : { cwd: filters.folder }),
        ...(debouncedQuery.trim() ? { query: debouncedQuery } : {}),
      })
      .then((result) => {
        if (cancelled || result.superseded) return;
        setSessions(result.sessions);
        setFacets(result.facets);
        setTruncated(result.truncated);
        setFilters((current) => reconcileFilters(current, result.facets));
        setSelected((current) => {
          const ids = new Set(result.sessions.map((session) => session.id));
          return new Set([...current].filter((id) => ids.has(id)));
        });
        setScannedFor(scanKey);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.danger(friendlyError(error));
        setScannedFor(scanKey);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.agentKind, filters.folder, debouncedQuery, scanKey]);

  if (scannedFor === undefined) {
    return (
      <div className="flex items-center justify-center py-8">
        <PixelLoader />
      </div>
    );
  }

  const agentLabel = (kind: string) =>
    agentStatuses.find((status) => status.kind === kind)?.label ?? kind;
  const visible = applyImportFilters(sessions, filters);
  const importable = visible.filter((session) => !findImportedThreadId(session, threads));
  const allSelected = importable.length > 0 && importable.every(({ id }) => selected.has(id));
  const update = (patch: Partial<ImportFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));

  const toggle = (id: string, isSelected: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });

  const runImport = async () => {
    setBusy(true);
    try {
      const chosen = sessions.filter((session) => selected.has(session.id));
      const { imported, failed } = await importSessions({
        sessions: chosen,
        ...(projectId ? { fallbackProjectId: projectId } : {}),
      });
      if (imported > 0) {
        toast.success(
          t`${plural(imported, { one: "Imported # session.", other: "Imported # sessions." })}`,
        );
      }
      if (imported === 0 && failed > 0) toast.danger(t`No sessions could be imported.`);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        <Trans>
          The thread keeps its provider session, so your next message continues where you left off.
        </Trans>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={t`Agent`}
          className="w-44"
          value={filters.agentKind}
          options={[
            { id: ALL, label: t`All agents` },
            ...facets.agentKinds.map((kind) => ({ id: kind, label: agentLabel(kind) })),
          ]}
          onChange={(agentKind) => update({ agentKind: agentKind || ALL })}
        />
        <Select
          aria-label={t`Folder`}
          className="w-56"
          value={filters.folder}
          options={[
            { id: ALL, label: t`All folders` },
            ...facets.folders.map((folder) => ({
              id: folder,
              label: folderName(folder),
              detail: folder,
            })),
          ]}
          onChange={(folder) => update({ folder: folder || ALL })}
        />
        <Input
          aria-label={t`Search sessions`}
          placeholder={t`Search titles, messages and folders`}
          className="min-w-40 flex-1"
          value={filters.query}
          onChange={(event) => update({ query: event.target.value })}
        />
      </div>

      {projects.length > 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>
            <Trans>If the folder no longer exists, import into</Trans>
          </span>
          <Select
            aria-label={t`Fallback project`}
            className="w-56"
            value={projectId}
            options={projects.map((project) => ({
              id: project.id,
              label: project.name,
              detail:
                project.location.kind === "wsl"
                  ? project.location.linuxPath
                  : project.location.path,
            }))}
            onChange={setProjectId}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Checkbox
          aria-label={t`Select all sessions`}
          isSelected={allSelected}
          isIndeterminate={!allSelected && importable.some(({ id }) => selected.has(id))}
          isDisabled={importable.length === 0 || busy}
          onChange={(isSelected) =>
            setSelected(isSelected ? new Set(importable.map(({ id }) => id)) : new Set())
          }
        >
          <Checkbox.Content className="text-xs">
            <Checkbox.Control className="border border-[var(--hairline-strong)] bg-surface-secondary shadow-none">
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Trans>Select all</Trans>
          </Checkbox.Content>
        </Checkbox>
        {truncated ? (
          <span className="text-[10px] text-muted">
            <Trans>Showing the most recent sessions — narrow the filters to see more.</Trans>
          </span>
        ) : null}
      </div>

      <ul
        aria-busy={rescanning}
        className={`flex max-h-96 flex-col gap-1 overflow-y-auto ${rescanning ? "opacity-60" : ""}`}
      >
        {visible.length === 0 ? (
          <li className="py-4 text-center text-xs text-muted">
            {sessions.length === 0 && filters === EMPTY_FILTERS ? (
              <Trans>No importable sessions found on this computer.</Trans>
            ) : (
              <Trans>No sessions match the current filters.</Trans>
            )}
          </li>
        ) : null}
        {visible.map((session) => {
          const alreadyImported = findImportedThreadId(session, threads) !== undefined;
          const heading = session.title ?? (session.preview || session.providerSessionId);
          return (
            <li key={session.id} className="rounded border border-border/10 px-2 py-1.5">
              <Checkbox
                aria-label={heading}
                className="w-full"
                isSelected={!alreadyImported && selected.has(session.id)}
                isDisabled={alreadyImported || busy}
                onChange={(isSelected) => toggle(session.id, isSelected)}
              >
                <Checkbox.Content className="w-full min-w-0 items-start">
                  <Checkbox.Control className="mt-0.5 border border-[var(--hairline-strong)] bg-surface-secondary shadow-none">
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground">{heading}</span>
                    {session.title && session.preview ? (
                      <span className="block truncate text-[10px] text-muted">
                        {session.preview}
                      </span>
                    ) : null}
                    <span className="block truncate font-mono text-[10px] text-muted">
                      {agentLabel(session.agentKind)} · {session.cwd ?? t`Unknown folder`}
                    </span>
                    {session.cwd && !session.cwdExists ? (
                      <span className="block text-[10px] text-warning">
                        <Trans>
                          Folder no longer exists — imports into the project chosen above.
                        </Trans>
                      </span>
                    ) : null}
                  </span>
                  {alreadyImported ? (
                    <span className="text-[10px] text-muted">
                      <Trans>Imported</Trans>
                    </span>
                  ) : null}
                </Checkbox.Content>
              </Checkbox>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="primary"
          isDisabled={selected.size === 0 || busy || rescanning}
          onPress={() => void runImport()}
        >
          <Plural value={selected.size} one="Import # session" other="Import # sessions" />
        </Button>
      </div>
    </div>
  );
}
