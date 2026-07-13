import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type {
  McpProbeErrorCode,
  McpProbeResult,
  McpServer,
  ProjectLocation,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

export type McpServerProbeState =
  | { status: "disabled" }
  | { status: "checking" }
  | { status: "connected"; toolCount: number; tools: string[] }
  | { status: "auth-required" }
  | { status: "unavailable"; errorCode: Exclude<McpProbeErrorCode, "auth-required"> };

function stateFromResult(result: McpProbeResult): McpServerProbeState {
  if (result.status === "available") {
    return { status: "connected", toolCount: result.toolCount, tools: result.tools ?? [] };
  }
  if (result.status === "auth-required") return { status: "auth-required" };
  return {
    status: "unavailable",
    errorCode: result.error.code === "auth-required" ? "connection-failed" : result.error.code,
  };
}

function startProbe(
  server: McpServer,
  projectLocation: ProjectLocation | undefined,
  requestSequences: RefObject<Map<string, number>>,
  mounted: RefObject<boolean>,
  setStates: Dispatch<SetStateAction<Record<string, McpServerProbeState>>>,
): void {
  const sequence = (requestSequences.current.get(server.id) ?? 0) + 1;
  requestSequences.current.set(server.id, sequence);
  setStates((current) => ({ ...current, [server.id]: { status: "checking" } }));

  let request: Promise<McpProbeResult>;
  try {
    request = readBridge().probeMcpServer({
      server,
      ...(projectLocation ? { projectLocation } : {}),
    });
  } catch {
    if (mounted.current && requestSequences.current.get(server.id) === sequence) {
      setStates((current) => ({
        ...current,
        [server.id]: { status: "unavailable", errorCode: "probe-unavailable" },
      }));
    }
    return;
  }

  void request.then(
    (result) => {
      if (!mounted.current || requestSequences.current.get(server.id) !== sequence) return;
      setStates((current) => ({ ...current, [server.id]: stateFromResult(result) }));
    },
    () => {
      if (!mounted.current || requestSequences.current.get(server.id) !== sequence) return;
      setStates((current) => ({
        ...current,
        [server.id]: { status: "unavailable", errorCode: "probe-unavailable" },
      }));
    },
  );
}

export function useMcpServerProbes(
  servers: McpServer[],
  projectLocation?: ProjectLocation,
): {
  states: Record<string, McpServerProbeState>;
  probe: (server: McpServer) => void;
} {
  const [states, setStates] = useState<Record<string, McpServerProbeState>>({});
  const fingerprints = useRef(new Map<string, string>());
  const requestSequences = useRef(new Map<string, number>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const nextFingerprints = new Map<string, string>();
    const currentIds = new Set(servers.map((server) => server.id));

    setStates((current) => {
      const remaining = Object.fromEntries(
        Object.entries(current).filter(([serverId]) => currentIds.has(serverId)),
      );
      return Object.keys(remaining).length === Object.keys(current).length ? current : remaining;
    });

    for (const server of servers) {
      const fingerprint = JSON.stringify({ server, projectLocation: projectLocation ?? null });
      nextFingerprints.set(server.id, fingerprint);
      if (fingerprints.current.get(server.id) === fingerprint) continue;

      if (!server.enabled) {
        requestSequences.current.set(server.id, (requestSequences.current.get(server.id) ?? 0) + 1);
        setStates((current) => ({ ...current, [server.id]: { status: "disabled" } }));
        continue;
      }

      startProbe(server, projectLocation, requestSequences, mounted, setStates);
    }

    for (const serverId of fingerprints.current.keys()) {
      if (!currentIds.has(serverId)) {
        requestSequences.current.set(serverId, (requestSequences.current.get(serverId) ?? 0) + 1);
      }
    }
    fingerprints.current = nextFingerprints;
  }, [projectLocation, servers]);

  const probe = (server: McpServer) => {
    if (!server.enabled) return;
    startProbe(server, projectLocation, requestSequences, mounted, setStates);
  };

  return { states, probe };
}
