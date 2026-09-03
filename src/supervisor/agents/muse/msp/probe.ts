import type { ChildProcess } from "node:child_process";
import type { ProjectLocation } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { buildMuseServeArgs } from "./argv";
import { MuseMspClient, spawnMuseServeHost } from "./client";
import { MSP_SCHEMA_FINGERPRINT, MSP_SCHEMA_VERSION, parseMspModelListResult } from "./protocol";

export interface MuseProbedCatalogModel {
  id: string;
  label: string;
  contextLimit: number | null;
  isDefault: boolean;
}

export interface MuseProbedCatalog {
  models: MuseProbedCatalogModel[];
  source: string;
  providerId: string;
  profileId: string | null;
}

export interface ProbeMuseModelCatalogOptions {
  executablePath: string;
  probeEnv?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  clientName?: string;
  clientVersion?: string;
  /** Seam for tests — defaults to spawning a real `muse serve` host. */
  spawnHost?: typeof spawnMuseServeHost;
}

/**
 * Ask a throwaway `muse serve --no-session-log` host for its `model/list`
 * catalog: the only installed-binary source for the models the host will
 * accept in `session/setModel`. Unauthenticated hosts answer with an empty
 * `bundledCatalog`; failures (spawn error, timeout, abort) resolve to
 * `undefined` so detection falls back to the static list. Never touches
 * auth and writes nothing to disk (ephemeral host).
 */
export async function probeMuseModelCatalog(
  location: ProjectLocation,
  options: ProbeMuseModelCatalogOptions,
): Promise<MuseProbedCatalog | undefined> {
  const tag = "[muse-probe]";
  if (options.signal?.aborted) return undefined;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const ownedProcessGroup = process.platform !== "win32";
  let child: ChildProcess | undefined;
  let client: MuseMspClient | undefined;
  let timeout: NodeJS.Timeout | undefined;
  let abortProbe: (() => void) | undefined;

  const stop = () => {
    if (child) terminateChildProcessTree(child, { ownedProcessGroup });
  };

  try {
    const spawned = await (options.spawnHost ?? spawnMuseServeHost)(location, {
      executablePath: options.executablePath,
      ...(options.probeEnv ? { extraEnv: options.probeEnv } : {}),
      serveArgs: buildMuseServeArgs(undefined, { noSessionLog: true }),
      label: tag,
    });
    child = spawned.child;
    client = new MuseMspClient(spawned.transport);

    const run = (async (): Promise<MuseProbedCatalog> => {
      const init = await client!.initialize(
        options.clientName ?? "poracode_probe",
        options.clientVersion ?? "1.0.0",
      );
      // The pin is advisory (schema is additive-open): warn on drift so a
      // silently incompatible host is visible in logs, but keep probing.
      if (
        init.schema.version !== MSP_SCHEMA_VERSION ||
        init.schema.fingerprint !== MSP_SCHEMA_FINGERPRINT
      ) {
        console.warn(
          `${tag} MSP schema drift: host reports version ${init.schema.version} ` +
            `fingerprint ${init.schema.fingerprint || "<none>"}; ` +
            `pinned version ${MSP_SCHEMA_VERSION}.`,
        );
      }
      const result = await client!.request("model/list");
      const parsed = parseMspModelListResult(result);
      return {
        models: parsed.models.map((model) => ({
          id: model.modelId,
          label: model.displayLabel,
          contextLimit: model.contextLimit,
          isDefault: model.isDefault,
        })),
        source: parsed.source,
        providerId: parsed.providerId,
        profileId: parsed.profileId,
      };
    })();

    const abortPromise = options.signal
      ? new Promise<never>((_, reject) => {
          abortProbe = () => {
            stop();
            reject(new Error("Muse model catalog probe aborted"));
          };
          options.signal!.addEventListener("abort", abortProbe, { once: true });
          if (options.signal!.aborted) abortProbe();
        })
      : undefined;

    return await Promise.race([
      run,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          stop();
          reject(new Error("Muse model catalog probe timed out"));
        }, timeoutMs);
        if (typeof timeout.unref === "function") timeout.unref();
      }),
      ...(abortPromise ? [abortPromise] : []),
    ]);
  } catch (error) {
    console.warn(
      `${tag} model catalog probe failed:`,
      error instanceof Error ? error.message : error,
    );
    return undefined;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortProbe) options.signal?.removeEventListener("abort", abortProbe);
    client?.dispose();
    if (child) terminateChildProcessTree(child, { ownedProcessGroup });
  }
}
