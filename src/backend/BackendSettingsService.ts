import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { CreateProfilePayload, SetProfileEnvironmentPayload } from "@/shared/contracts";
import type {
  BackendServicePayload,
  BackendServiceResult,
  BackendSettingsProcedureName,
} from "@/shared/backendHostProtocol";
import type { SharedSettings, SharedSettingsInput } from "@/shared/settings";
import {
  settingsSubjectId,
  type SettingsMutationResult,
  type SettingsSubject,
} from "@/shared/settingsTransactions";
import {
  notifySettingsChanged,
  reportSettingsError,
  type BackendSettingsNotifications,
} from "./BackendSettingsNotifications";
import { SettingsAuthority } from "./settings/SettingsAuthority";
import {
  SettingsCommandService,
  type SettingsCommandExpectation,
} from "./settings/SettingsCommandService";
import { SettingsCompatWriter, withSettingsRebase } from "./settings/settingsCompatWrites";

/** Authority-backed settings surface for the desktop composition.
 *
 * The authority owns settings.json for the whole process: every writer —
 * renderer commands, remote patches, durable routing records — commits through
 * its compare-and-swap instead of a last-writer-wins file merge. First use opens
 * the authority (the composition constructor stays synchronous); `dispose`
 * drains pending commits before shutdown. */
export function createBackendSettingsAccess(
  options: BackendSettingsNotifications & {
    settingsPath(): string;
  },
): BackendSettingsAccess {
  let runtime: Promise<SettingsCommandRuntime> | null = null;
  let closed = false;

  function ensureRuntime(): Promise<SettingsCommandRuntime> {
    runtime ??= openRuntime();
    return runtime;
  }

  async function openRuntime(): Promise<SettingsCommandRuntime> {
    const settingsPath = options.settingsPath();
    // Desktop custody is process-lifetime today: a fresh generation per open
    // invalidates revisions across restarts, and the guard only refuses use
    // after dispose. The HostOwnerController unification (Gate 2.5) replaces
    // this adapter with the shared kernel lease and its real credential mode.
    const generation = randomUUID();
    const authority = await SettingsAuthority.open({
      lease: {
        paths: { dataRoot: dirname(settingsPath) },
        generation,
        assertActive: () => {
          if (closed) throw new Error("The desktop settings authority is closed.");
        },
      },
      // The desktop key always persists (OS-sealed or file-backed); there is no
      // session-only desktop mode to guard against yet.
      assertPersistentCredentials: () => {},
      onCommitted: (_result, settings) =>
        notifySettingsChanged(settings, {
          onChanged: options.onChanged,
          ...(options.reportError ? { reportError: options.reportError } : {}),
        }),
      ...(options.reportError ? { reportError: options.reportError } : {}),
    });
    const commands = new SettingsCommandService(authority, { assertCanPersistSecrets: () => {} });
    return { authority, commands, writes: new SettingsCompatWriter(authority) };
  }

  async function call<Name extends BackendSettingsProcedureName>(
    name: Name,
    payload: BackendServicePayload<Name>,
  ): Promise<BackendServiceResult<Name>> {
    const { authority, commands, writes } = await ensureRuntime();
    switch (name) {
      case "getSharedSettings":
        return authority.readSettings() as BackendServiceResult<Name>;
      case "setSharedSettings":
        return (await writes.commitCompatSnapshot(
          payload as SharedSettingsInput,
        )) as BackendServiceResult<Name>;
      case "settingsTransactionMutate":
        // Authority-native CAS: conflicts are returned, never rebased.
        return (await commands.mutateSettings(payload)) as BackendServiceResult<Name>;
      case "settingsTransactionSnapshot":
        return commands.getSnapshot() as BackendServiceResult<Name>;
      case "setAgentSecretSetting": {
        const { agentKind, key } = payload as { agentKind: string; key: string };
        const result = await withSettingsRebase(() =>
          commands.setAgentSecretSetting(
            payload,
            expectationFor(authority, { kind: "agent-setting", agentKind, key }),
          ),
        );
        // The legacy handler returned the stored ciphertext for the renderer
        // store to adopt; a cleared value stores nothing.
        const stored = commandValue(result) as string | undefined;
        return { storedValue: stored ?? null } as BackendServiceResult<Name>;
      }
      case "removeCrossagentRoutingOverride":
      case "removeCrossagentMemoryEntry":
      case "updateCrossagentMemoryEntryTags":
        return commandValue(
          await withSettingsRebase(() => runCrossagentCommand(commands, authority, name, payload)),
        ) as BackendServiceResult<Name>;
      case "setProfileEnvironment": {
        const { instanceId } = payload as SetProfileEnvironmentPayload;
        return commandValue(
          await withSettingsRebase(() =>
            commands.setProfileEnvironment(
              payload,
              expectationFor(authority, {
                kind: "entry",
                field: "agentInstances",
                key: instanceId,
              }),
            ),
          ),
        ) as BackendServiceResult<Name>;
      }
      case "createProfile": {
        const { id } = payload as CreateProfilePayload;
        return commandValue(
          await withSettingsRebase(() =>
            commands.createProfile(
              payload,
              expectationFor(authority, { kind: "entry", field: "agentInstances", key: id }),
            ),
          ),
        ) as BackendServiceResult<Name>;
      }
    }
  }

  async function dispose(): Promise<void> {
    closed = true;
    if (!runtime) return;
    try {
      const opened = await runtime;
      await opened.authority.close();
    } catch {
      // An authority that never opened has nothing to drain.
    }
  }

  return {
    call,
    editSettingsField: (field, compute) =>
      ensureRuntime().then((opened) => opened.writes.editSettingsField(field, compute)),
    commitCompatPatch: (patch) =>
      ensureRuntime().then((opened) => opened.writes.commitCompatPatch(patch)),
    /** Fire-and-forget compat write for durable event handlers; failures are
     * reported through diagnostics, never thrown into the event path. */
    writeSharedSettingsCompat: (next: SharedSettingsInput): void => {
      if (closed) return;
      void ensureRuntime()
        .then((opened) => opened.writes.commitCompatSnapshot(next))
        .catch((error: unknown) => reportSettingsError(error, options.reportError));
    },
    dispose,
  };
}

export interface BackendSettingsAccess {
  call<Name extends BackendSettingsProcedureName>(
    name: Name,
    payload: BackendServicePayload<Name>,
  ): Promise<BackendServiceResult<Name>>;
  editSettingsField<F extends keyof SharedSettings>(
    field: F,
    compute: (current: SharedSettings) => SharedSettings[F] | undefined,
  ): Promise<SettingsMutationResult>;
  /** Compat partial patch through the authority's compare-and-swap; rejects
   * loudly when a conflict survives the bounded rebase. */
  commitCompatPatch(patch: {
    [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
  }): Promise<SharedSettings>;
  writeSharedSettingsCompat(next: SharedSettingsInput): void;
  dispose(): Promise<void>;
}

interface SettingsCommandRuntime {
  authority: SettingsAuthority;
  commands: SettingsCommandService;
  writes: SettingsCompatWriter;
}

/** Owner-managed learned-routing fields share their containing field's revision. */
function runCrossagentCommand(
  commands: SettingsCommandService,
  authority: SettingsAuthority,
  name:
    | "removeCrossagentRoutingOverride"
    | "removeCrossagentMemoryEntry"
    | "updateCrossagentMemoryEntryTags",
  payload: unknown,
): Promise<SettingsMutationResult> {
  const field =
    name === "removeCrossagentRoutingOverride"
      ? "crossagentRoutingOverrides"
      : "crossagentSelectionUsage";
  const expectation = expectationFor(authority, { kind: "field", field });
  if (name === "removeCrossagentRoutingOverride")
    return commands.removeCrossagentRoutingOverride(payload, expectation);
  if (name === "removeCrossagentMemoryEntry")
    return commands.removeCrossagentMemoryEntry(payload, expectation);
  return commands.updateCrossagentMemoryEntryTags(payload, expectation);
}

function expectationFor(
  authority: SettingsAuthority,
  subject: SettingsSubject,
): SettingsCommandExpectation {
  const snapshot = authority.snapshot([subject]);
  return {
    authorityId: snapshot.authorityId,
    expectedRevision: snapshot.revisions[settingsSubjectId(subject)]!,
  };
}

/** Adapter commands commit one subject; the committed value is the result the
 * legacy handlers returned. A conflict that survives the bounded rebase fails
 * the command loudly instead of overwriting the concurrent change. */
function commandValue(result: SettingsMutationResult): unknown {
  if (result.status !== "committed") {
    throw new Error(`The settings edit did not commit: ${result.reason}.`);
  }
  return result.changes[0]?.value;
}
