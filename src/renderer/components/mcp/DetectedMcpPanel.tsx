import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import {
  isValidMcpServerName,
  type DetectedMcpGroup,
  type DetectedMcpServer,
} from "@/shared/contracts";
import { Button, PixelLoader } from "@/renderer/components/common";
import { transportBadge, transportSummary } from "./mcpFormUtils";

function loadDetectedMcpGroups(projectPath: string | undefined): Promise<DetectedMcpGroup[]> {
  return readBridge()
    .getDetectedMcpServers(projectPath ? { projectPath } : {})
    .then((result) => result.groups);
}

export function DetectedMcpPanel(props: {
  /** Absolute project path for project-scope scans; omit for global-only. */
  projectPath?: string;
  /** Server names already managed in the current scope (lowercased). */
  managedNames: ReadonlySet<string>;
  onImport: (detected: DetectedMcpServer) => void;
}) {
  const { projectPath, managedNames, onImport } = props;
  const [groups, setGroups] = useState<DetectedMcpGroup[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const scan = () => {
    setLoading(true);
    void loadDetectedMcpGroups(projectPath)
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGroups(undefined);
    void loadDetectedMcpGroups(projectPath)
      .then((nextGroups) => {
        if (!cancelled) setGroups(nextGroups);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  if (groups === undefined) {
    return (
      <div className="flex items-center justify-center py-8">
        <PixelLoader size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          MCP servers found in other tools&apos; config files. Import any to manage it in Lightcode.
        </p>
        <Button size="sm" variant="tertiary" isDisabled={loading} onPress={scan}>
          {loading ? <PixelLoader size="xs" /> : <RefreshCw className="size-3.5" />}
          Rescan
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">
          No MCP servers detected in other tools.
        </p>
      ) : (
        groups.map((group) => (
          <div key={`${group.source}:${group.filePath}`} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">{group.label}</span>
              <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-muted">
                {group.scope}
              </span>
            </div>
            <div className="space-y-1">
              {group.servers.map((server) => {
                const alreadyManaged = managedNames.has(server.name.toLowerCase());
                const invalidName = !isValidMcpServerName(server.name);
                return (
                  <div
                    key={server.name}
                    className="flex items-center gap-2 rounded-md border border-[var(--hairline)] px-3 py-2"
                  >
                    <span className="shrink-0 rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {server.transport ? transportBadge(server.transport) : "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-foreground">{server.name}</div>
                      <div className="truncate font-mono text-[11px] text-muted">
                        {server.transport
                          ? transportSummary(server.transport)
                          : "Unsupported config shape"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="tertiary"
                      isDisabled={!server.transport || alreadyManaged || invalidName}
                      onPress={() => onImport(server)}
                    >
                      <Download className="size-3.5" />
                      {alreadyManaged
                        ? "Managed"
                        : invalidName
                          ? "Invalid"
                          : server.transport
                            ? "Import"
                            : "Unsupported"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
