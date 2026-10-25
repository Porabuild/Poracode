import { writeSync } from "node:fs";
import { join } from "node:path";
import type { HostBuildIdentity } from "@/shared/hostControlProtocol";
import { joinRuntimeShutdown } from "@/backend/joinRuntimeShutdown";
import { connectHostAdministration } from "./cliAdmin";
import { parseRunCli, runRunCli } from "./cliRun";
import { installShutdown } from "./cliRuntime";
import { terminalText } from "./cliPrompts";
import { redactDiagnosticLine } from "./serverDoctorIo";
import { createHeadlessRemoteHost, type HeadlessRemoteHost } from "./createHeadlessRemoteHost";
import { HeadlessCompositionShutdownError } from "./headlessRemoteCompositionSupport";
import {
  resolveServerInstallLayout,
  resolveServerResourceDirs,
  WSL_HELPERS_DIR_ENV,
  type ServerInstallLayout,
} from "./serverInstallLayout";
import { resolveRunningBuildIdentity } from "./serverUpgradeIdentity";
import { resolveServerVersion } from "./serverVersion";

export async function runStandaloneCli(
  profileNamespace: string,
  input: NonNullable<ReturnType<typeof parseRunCli>>,
  libDir: string,
  capturedBuild?: HostBuildIdentity,
) {
  const cancellation = new AbortController();
  const published = Promise.withResolvers<void>();
  const startup = Promise.withResolvers<void>();
  const retired = Promise.withResolvers<void>();
  let connecting = false;
  let finalizing = false;
  let host: HeadlessRemoteHost | undefined;
  let uncertainStartup: HeadlessCompositionShutdownError | undefined;
  let closing: Promise<void> | undefined;
  let draining: Promise<void> | undefined;
  let exitCode: 0 | 1 = 1;
  let streamError: Error | undefined;
  let stopFollowingRun: (() => void) | undefined;
  const closeHost = (): Promise<void> => {
    if (!connecting) return Promise.resolve();
    return (closing ??= (async () => {
      // Publish the factory's result before disposal, but do not await startup:
      // disposal must cancel and join an ingress that is still starting.
      await published.promise;
      if (uncertainStartup) throw uncertainStartup;
      await host?.dispose();
    })());
  };
  const log = console.log;
  console.log = console.error;
  const shutdown = installShutdown(
    "[poracode-run]",
    () => {
      if (!finalizing) cancellation.abort(new Error("Standalone run cancelled."));
      draining = joinRuntimeShutdown([closeHost, () => startup.promise, () => retired.promise]);
      return draining;
    },
    { exitCode: () => exitCode },
  );
  const failStderr = (error: Error) => {
    streamError ??= error;
    exitCode = 1;
    cancellation.abort(error);
    shutdown.requestShutdown("stderr failure");
  };
  const closeStderr = () => failStderr(new Error("Standalone diagnostics output closed."));
  process.stderr.on("error", failStderr);
  process.stderr.once("close", closeStderr);
  try {
    await runRunCli(
      input,
      async (signal) => {
        signal.throwIfAborted();
        const cancelRun = () => {
          cancellation.abort(signal.reason);
          shutdown.requestShutdown("task cancellation");
        };
        signal.addEventListener("abort", cancelRun, { once: true });
        stopFollowingRun = () => signal.removeEventListener("abort", cancelRun);
        connecting = true;
        try {
          let layout: ServerInstallLayout | undefined;
          try {
            layout = resolveServerInstallLayout({ libDir });
          } catch (error) {
            if (process.env[WSL_HELPERS_DIR_ENV]?.trim() === undefined) throw error;
          }
          const resources = resolveServerResourceDirs({
            env: process.env,
            ...(layout ? { layout } : {}),
          });
          const buildIdentity =
            capturedBuild ?? resolveRunningBuildIdentity(layout ? { libDir: layout.libDir } : {});
          const version =
            capturedBuild?.version ?? resolveServerVersion(layout ? { layout } : {}).version;
          process.env.PORACODE_HEADLESS_SERVER = "1";
          try {
            host = await createHeadlessRemoteHost({
              appVersion: version,
              supervisorPath: join(libDir, "supervisor.cjs"),
              databaseReadWorkerPath: join(libDir, "databaseReadWorker.cjs"),
              sessionExportWorkerPath: join(libDir, "sessionExportWorker.cjs"),
              wslHelpersDir: resources.wslHelpersDir,
              ...(resources.bundledSkillsDir
                ? { bundledSkillsDir: resources.bundledSkillsDir }
                : {}),
              ...(resources.bundledPluginsDir
                ? { bundledPluginsDir: resources.bundledPluginsDir }
                : {}),
              ...(resources.agentPluginsDir ? { agentPluginsDir: resources.agentPluginsDir } : {}),
              ...(resources.computerUseHelperRoot
                ? { computerUseHelperRoot: resources.computerUseHelperRoot }
                : {}),
              baseDir: profileNamespace,
              localAdministrationOnly: true,
              buildIdentity,
              signal: cancellation.signal,
              requestShutdown: () => shutdown.requestShutdown("authenticated task stop"),
              ...(process.env.PORACODE_SECRET_STORAGE_KEY !== undefined
                ? { environmentKey: process.env.PORACODE_SECRET_STORAGE_KEY }
                : {}),
            });
          } catch (error) {
            if (error instanceof HeadlessCompositionShutdownError) uncertainStartup = error;
            throw error;
          } finally {
            published.resolve();
          }
          signal.throwIfAborted();
          await host.startLocalAdministration();
          signal.throwIfAborted();
          return await connectHostAdministration(profileNamespace, signal);
        } finally {
          // Resource/identity resolution can fail before the factory is called.
          published.resolve();
          startup.resolve();
        }
      },
      undefined,
      {
        signal: cancellation.signal,
        finalize: async () => {
          finalizing = true;
          if (!connecting) startup.resolve();
          shutdown.requestShutdown("task retirement");
          await closeHost();
        },
      },
    );
    if (!streamError && !cancellation.signal.aborted) exitCode = 0;
  } catch (error) {
    exitCode = 1;
    try {
      writeSync(
        2,
        `[poracode] ${terminalText(redactDiagnosticLine(error instanceof Error ? error.message : "Standalone run failed."))}\n`,
      );
    } catch {
      // The diagnostics pipe can be the failure being retired.
    }
  } finally {
    if (!connecting) startup.resolve();
    retired.resolve();
  }
  try {
    await draining;
  } catch {
    // installShutdown retains the existing hard deadline and reports the join.
    return;
  }
  shutdown.uninstall();
  stopFollowingRun?.();
  console.log = log;
  process.stderr.off("error", failStderr);
  process.stderr.off("close", closeStderr);
}
