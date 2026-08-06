import { useEffect, useRef, useState } from "react";
import type {
  AgentSlashCommand,
  InstalledPlugins,
  ProjectLocation,
  ScanSkillsPayload,
  SkillScanResult,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { arePluginSkillRequiredAppsEnabled } from "@/shared/plugins/catalog";
import { readBridge } from "@/renderer/bridge";
import {
  resolveLocalizedPluginSkill,
  useLocalizedPluginCatalog,
  type LocalizedPlugin,
} from "@/renderer/components/plugins/pluginCopy";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const scanCache = new Map<string, SkillScanResult>();
const pendingScans = new Map<string, Promise<SkillScanResult>>();
const scanVersions = new Map<string, number>();

function pluginSkillScanKey(installedPlugins: InstalledPlugins): string {
  return JSON.stringify(
    Object.entries(installedPlugins)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([id, state]) => [id, state.version, state.enabled, state.disabledSkillIds.toSorted()]),
  );
}

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
  presentationMode?: ThreadPresentationMode,
) {
  const installedPlugins = useSharedSettings((state) => state.installedPlugins);
  const requestKey = `${agentKind ?? ""}\0${wslDistro ?? ""}\0${presentationMode ?? ""}\0${projectLocation ? JSON.stringify(projectLocation) : ""}\0${pluginSkillScanKey(installedPlugins)}`;
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
          ...(presentationMode ? { presentationMode } : {}),
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
  presentationMode?: ThreadPresentationMode,
  launchConfig?: ThreadConfig,
): AgentSlashCommand[] {
  return useSkillSlashCommandState(projectLocation, agentKind, presentationMode, launchConfig)
    .commands;
}

export function useSkillSlashCommandState(
  projectLocation: ProjectLocation,
  agentKind: string,
  presentationMode?: ThreadPresentationMode,
  launchConfig?: ThreadConfig,
) {
  const { scan, loading, error } = useSkills(
    projectLocation,
    agentKind,
    undefined,
    presentationMode,
  );
  const localizedPlugins = useLocalizedPluginCatalog();
  return {
    commands: buildSkillSlashCommands(scan, localizedPlugins, launchConfig),
    resolved: !loading && (scan !== null || error !== undefined),
  };
}

export function buildSkillSlashCommands(
  scan: SkillScanResult | null,
  localizedPlugins: readonly LocalizedPlugin[] = [],
  launchConfig?: ThreadConfig,
): AgentSlashCommand[] {
  if (!scan?.invocation) return [];
  const effective = new Set(scan.effectiveSkillIds);
  return scan.skills.flatMap((skill) => {
    if (!effective.has(skill.id)) return [];
    const { localizedPlugin, pluginSkill, localizedSkill } = resolveLocalizedPluginSkill(
      localizedPlugins,
      skill,
    );
    if (
      launchConfig &&
      localizedPlugin &&
      pluginSkill &&
      !arePluginSkillRequiredAppsEnabled(localizedPlugin.plugin, pluginSkill.folder, launchConfig)
    ) {
      return [];
    }
    const displayName = localizedSkill?.name ?? skill.name;
    const description = localizedSkill?.description ?? skill.description;
    const invocation =
      scan.invocation === "dollar"
        ? `$${skill.name}`
        : scan.invocation === "prompt"
          ? `Use the ${skill.name} skill.`
          : `/${skill.name}`;
    return [
      {
        id: skill.name,
        label: description ? `${displayName} — ${description}` : displayName,
        ...(description ? { description } : {}),
        section: "skills" as const,
        skillName: skill.name,
        skillPath: skill.skillFilePath,
        skillInvocation: invocation,
        skillProvider: localizedPlugin?.name ?? skill.providerLabel,
        skillScope: skill.scope,
      },
    ];
  });
}
