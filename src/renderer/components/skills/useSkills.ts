import { useEffect, useRef, useState } from "react";
import type {
  AgentSlashCommand,
  InstalledPlugins,
  ProjectLocation,
  ScanSkillsPayload,
  SkillScanResult,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import {
  resolveLocalizedPluginSkill,
  useLocalizedPluginCatalog,
  type LocalizedPlugin,
} from "@/renderer/components/plugins/pluginCopy";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePlugins } from "@/renderer/state/pluginsStore";
import type { PluginMentionItem } from "@/renderer/components/composer/MentionInput";
import {
  getPluginCoreSkill,
  isPluginSkillEnabled,
  isPluginSupportedForProject,
  resolveInstalledPluginState,
} from "@/shared/plugins/catalog";

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
  const pluginRevision = usePlugins((state) => state.revision);
  const requestKey = `${agentKind ?? ""}\0${wslDistro ?? ""}\0${presentationMode ?? ""}\0${projectLocation ? JSON.stringify(projectLocation) : ""}\0${pluginSkillScanKey(installedPlugins)}\0${pluginRevision}`;
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
): AgentSlashCommand[] {
  return useSkillSlashCommandState(projectLocation, agentKind, presentationMode).commands;
}

export function useSkillSlashCommandState(
  projectLocation: ProjectLocation,
  agentKind: string,
  presentationMode?: ThreadPresentationMode,
) {
  const { scan, loading, error } = useSkills(
    projectLocation,
    agentKind,
    undefined,
    presentationMode,
  );
  const localizedPlugins = useLocalizedPluginCatalog(projectLocation);
  return {
    commands: buildSkillSlashCommands(scan, localizedPlugins),
    resolved: !loading && (scan !== null || error !== undefined),
  };
}

export function buildSkillSlashCommands(
  scan: SkillScanResult | null,
  localizedPlugins: readonly LocalizedPlugin[] = [],
): AgentSlashCommand[] {
  const invocation = scan?.invocation;
  if (!invocation) return [];
  const effective = new Set(scan.effectiveSkillIds);
  return scan.skills.flatMap((skill) => {
    if (!effective.has(skill.id)) return [];
    return [buildSkillSlashCommand(skill, invocation, localizedPlugins)];
  });
}

function buildSkillSlashCommand(
  skill: SkillScanResult["skills"][number],
  invocationKind: NonNullable<SkillScanResult["invocation"]>,
  localizedPlugins: readonly LocalizedPlugin[],
): AgentSlashCommand {
  const { localizedPlugin, localizedSkill } = resolveLocalizedPluginSkill(localizedPlugins, skill);
  const displayName = localizedSkill?.name ?? skill.name;
  const description = localizedSkill?.description ?? skill.description;
  const invocation =
    invocationKind === "dollar"
      ? `$${skill.name}`
      : invocationKind === "skill"
        ? `/skill:${skill.name}`
        : invocationKind === "prompt"
          ? `Use the ${skill.name} skill.`
          : `/${skill.name}`;
  return {
    id: skill.name,
    label: description ? `${displayName} — ${description}` : displayName,
    ...(description ? { description } : {}),
    section: "skills",
    skillName: skill.name,
    skillPath: skill.skillFilePath,
    skillInvocation: invocation,
    skillProvider: localizedPlugin?.name ?? skill.providerLabel,
    skillScope: skill.scope,
    ...(skill.pluginId ? { pluginId: skill.pluginId } : {}),
    ...(skill.pluginName ? { pluginName: localizedPlugin?.name ?? skill.pluginName } : {}),
  };
}

/** Installed plugins represented as one composer mention backed by their core skill. */
export function usePluginMentionItems(
  projectLocation: ProjectLocation,
  agentKind: string,
  presentationMode?: ThreadPresentationMode,
): PluginMentionItem[] {
  const { scan } = useSkills(projectLocation, agentKind, undefined, presentationMode);
  const localizedPlugins = useLocalizedPluginCatalog(projectLocation);
  const installedPlugins = useSharedSettings((state) => state.installedPlugins);
  const disabledBuiltIns = useSharedSettings((state) => state.disabledBuiltInMcpServers);
  const invocation = scan?.invocation;
  if (!invocation) return [];

  return localizedPlugins.flatMap((localized): PluginMentionItem[] => {
    const plugin = localized.plugin;
    const state = resolveInstalledPluginState(plugin, installedPlugins);
    const core = getPluginCoreSkill(plugin);
    if (
      !state?.enabled ||
      !core ||
      !isPluginSkillEnabled(plugin, state, core.folder) ||
      !isPluginSupportedForProject(plugin, readBridge().platform, projectLocation) ||
      plugin.poracode.builtInMcpServerIds.some((id) => disabledBuiltIns[id] === true)
    ) {
      return [];
    }
    const skill = scan.skills.find(
      (candidate) =>
        candidate.pluginId === plugin.name &&
        candidate.folderName === core.folder &&
        candidate.enabled &&
        candidate.valid,
    );
    if (!skill) return [];
    const command = buildSkillSlashCommand(skill, invocation, localizedPlugins);
    return [
      {
        id: plugin.name,
        name: localized.name,
        // Manifest keywords double as mention aliases so a package still
        // answers to what it does ("@pane" → Terminal), not only to
        // its display name.
        ...(plugin.manifest.keywords?.length ? { searchAliases: plugin.manifest.keywords } : {}),
        command: { ...command, pluginId: plugin.name, pluginName: localized.name },
        ...(plugin.poracode.builtInMcpServerIds.length > 0
          ? { enablesMcpServerIds: plugin.poracode.builtInMcpServerIds }
          : {}),
      },
    ];
  });
}
