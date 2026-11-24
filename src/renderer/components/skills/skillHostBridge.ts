import type {
  DeleteSkillPayload,
  ImportSkillsPayload,
  ImportSkillsResult,
  InstallMarketplaceSkillPayload,
  InstallMarketplaceSkillResult,
  ListSkillMarketplacePayload,
  ReadExternalFilePayload,
  ReadExternalFileResult,
  ScanSkillsPayload,
  SetSkillEnabledPayload,
  SkillMarketplaceResult,
  SkillScanResult,
  WriteExternalFilePayload,
  WriteExternalFileResult,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { unprojectRemotePayload } from "@/renderer/remoteProcedureRouter";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

/**
 * Host procedures receive host-local coordinates. Project rows mirrored from a
 * paired host carry `remoteServerId`, so strip it before the explicit client
 * call (the local bridge router already does this for its own remote routes).
 */
function hostProcedurePayload(payload: unknown): unknown {
  return unprojectRemotePayload(payload);
}

export function resolveSkillHostPlatform(hostPlatform?: string): string {
  return hostPlatform ?? readBridge().platform;
}

export function scanSkillsForHost(
  connectionKey: string | undefined,
  payload: ScanSkillsPayload,
): Promise<SkillScanResult> {
  if (!connectionKey) return readBridge().scanSkills(payload);
  return useRemoteServersStore
    .getState()
    .withClient(
      connectionKey,
      (client) =>
        client.callRemoteProcedure(
          "scanSkills",
          hostProcedurePayload(payload),
        ) as Promise<SkillScanResult>,
    );
}

export function setSkillEnabledForHost(
  connectionKey: string | undefined,
  payload: SetSkillEnabledPayload,
): Promise<void> {
  if (!connectionKey) return readBridge().setSkillEnabled(payload);
  return useRemoteServersStore.getState().withClient(connectionKey, async (client) => {
    await client.callRemoteProcedure("setSkillEnabled", hostProcedurePayload(payload));
  });
}

export function deleteSkillForHost(
  connectionKey: string | undefined,
  payload: DeleteSkillPayload,
): Promise<void> {
  if (!connectionKey) return readBridge().deleteSkill(payload);
  return useRemoteServersStore.getState().withClient(connectionKey, async (client) => {
    await client.callRemoteProcedure("deleteSkill", hostProcedurePayload(payload));
  });
}

export function importSkillsForHost(
  connectionKey: string | undefined,
  payload: ImportSkillsPayload,
): Promise<ImportSkillsResult> {
  if (!connectionKey) return readBridge().importSkills(payload);
  return useRemoteServersStore
    .getState()
    .withClient(
      connectionKey,
      (client) =>
        client.callRemoteProcedure(
          "importSkills",
          hostProcedurePayload(payload),
        ) as Promise<ImportSkillsResult>,
    );
}

export function listSkillMarketplaceForHost(
  connectionKey: string | undefined,
  payload: ListSkillMarketplacePayload,
): Promise<SkillMarketplaceResult> {
  if (!connectionKey) return readBridge().listSkillMarketplace(payload);
  return useRemoteServersStore
    .getState()
    .withClient(
      connectionKey,
      (client) =>
        client.callRemoteProcedure(
          "listSkillMarketplace",
          hostProcedurePayload(payload),
        ) as Promise<SkillMarketplaceResult>,
    );
}

export function installMarketplaceSkillForHost(
  connectionKey: string | undefined,
  payload: InstallMarketplaceSkillPayload,
): Promise<InstallMarketplaceSkillResult> {
  if (!connectionKey) return readBridge().installMarketplaceSkill(payload);
  return useRemoteServersStore
    .getState()
    .withClient(
      connectionKey,
      (client) =>
        client.callRemoteProcedure(
          "installMarketplaceSkill",
          hostProcedurePayload(payload),
        ) as Promise<InstallMarketplaceSkillResult>,
    );
}

export function readExternalFileForHost(
  connectionKey: string | undefined,
  payload: ReadExternalFilePayload,
): Promise<ReadExternalFileResult> {
  if (!connectionKey) return readBridge().readExternalFile(payload);
  return useRemoteServersStore
    .getState()
    .withClient(
      connectionKey,
      (client) =>
        client.callRemoteProcedure(
          "readExternalFile",
          hostProcedurePayload(payload),
        ) as Promise<ReadExternalFileResult>,
    );
}

export function writeExternalFileForHost(
  connectionKey: string | undefined,
  payload: WriteExternalFilePayload,
): Promise<WriteExternalFileResult> {
  if (!connectionKey) return readBridge().writeExternalFile(payload);
  return useRemoteServersStore
    .getState()
    .withClient(
      connectionKey,
      (client) =>
        client.callRemoteProcedure(
          "writeExternalFile",
          hostProcedurePayload(payload),
        ) as Promise<WriteExternalFileResult>,
    );
}
