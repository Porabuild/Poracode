import { useEffect, useRef, useState } from "react";
import type {
  AgentSlashCommand,
  ProjectLocation,
  ScanSkillsPayload,
  SkillScanResult,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

const scanCache = new Map<string, SkillScanResult>();
const pendingScans = new Map<string, Promise<SkillScanResult>>();
const scanVersions = new Map<string, number>();

function requestSkillScan(
  requestKey: string,
  payload: ScanSkillsPayload,
  reusePending: boolean,
): Promise<SkillScanResult> {
  const pending = pendingScans.get(requestKey);
  if (reusePending && pending) return pending;

  const version = (scanVersions.get(requestKey) ?? 0) + 1;
  scanVersions.set(requestKey, version);
  const request = readBridge()
    .scanSkills(payload)
    .then((result) => {
      if (scanVersions.get(requestKey) === version) scanCache.set(requestKey, result);
      return result;
    });
  pendingScans.set(requestKey, request);
  const clearPending = () => {
    if (pendingScans.get(requestKey) === request) pendingScans.delete(requestKey);
  };
  void request.then(clearPending, clearPending);
  return request;
}

export function useSkills(
  projectLocation?: ProjectLocation,
  agentKind?: string,
  wslDistro?: string,
) {
  const requestKey = `${agentKind ?? ""}\0${wslDistro ?? ""}\0${projectLocation ? JSON.stringify(projectLocation) : ""}`;
  const cachedScan = scanCache.get(requestKey);
  const [scanState, setScanState] = useState<
    | {
        requestKey: string;
        result: SkillScanResult;
      }
    | undefined
  >(cachedScan ? { requestKey, result: cachedScan } : undefined);
  const [loading, setLoading] = useState(!cachedScan);
  const [error, setError] = useState<unknown>();
  const runRef = useRef(0);

  const load = async (reusePending: boolean) => {
    const run = ++runRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await requestSkillScan(
        requestKey,
        {
          ...(projectLocation ? { projectLocation } : {}),
          ...(wslDistro ? { wslDistro } : {}),
          ...(agentKind ? { agentKind } : {}),
        },
        reusePending,
      );
      if (runRef.current === run) setScanState({ requestKey, result });
    } catch (nextError) {
      if (runRef.current === run) setError(nextError);
    } finally {
      if (runRef.current === run) setLoading(false);
    }
  };

  const reload = () => load(false);

  useEffect(() => {
    const cached = scanCache.get(requestKey);
    if (cached) setScanState({ requestKey, result: cached });
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only when the requested skill scope changes.
  }, [requestKey]);

  return {
    scan:
      scanState?.requestKey === requestKey ? scanState.result : (scanCache.get(requestKey) ?? null),
    loading,
    error,
    reload,
  };
}

export function useSkillSlashCommands(
  projectLocation: ProjectLocation,
  agentKind: string,
): AgentSlashCommand[] {
  return useSkillSlashCommandState(projectLocation, agentKind).commands;
}

export function useSkillSlashCommandState(projectLocation: ProjectLocation, agentKind: string) {
  const { scan, loading, error } = useSkills(projectLocation, agentKind);
  return {
    commands: buildSkillSlashCommands(scan),
    resolved: !loading && (scan !== null || error !== undefined),
  };
}

export function buildSkillSlashCommands(scan: SkillScanResult | null): AgentSlashCommand[] {
  if (!scan?.invocation) return [];
  const effective = new Set(scan.effectiveSkillIds);
  return scan.skills.flatMap((skill) => {
    if (!effective.has(skill.id)) return [];
    const invocation =
      scan.invocation === "dollar"
        ? `$${skill.name}`
        : scan.invocation === "skill"
          ? `/skill:${skill.name}`
          : scan.invocation === "prompt"
            ? `Use the ${skill.name} skill.`
            : `/${skill.name}`;
    return [
      {
        id: skill.name,
        label: skill.description ? `${skill.name} — ${skill.description}` : skill.name,
        ...(skill.description ? { description: skill.description } : {}),
        section: "skills" as const,
        skillName: skill.name,
        skillPath: skill.skillFilePath,
        skillInvocation: invocation,
        skillProvider: skill.providerLabel,
        skillScope: skill.scope,
      },
    ];
  });
}
