import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createRuntimePayloadProjectionSource,
  RUNTIME_PAYLOAD_PROJECTION_MODULE,
} from "../build/runtimePayloadProjectionSource.mjs";

/**
 * Bundle the real CLI entry for the spawned-child suites with only the
 * headless composition, persistence sampler, pairing control and diagnostics imports
 * replaced by the fixture bridge `globalThis.__cliFixture` (implemented by
 * `fixtures/cliStartupSignal.mjs` and `fixtures/cliStartupDeadline.mjs`).
 *
 * Runtime packages stay external, so a fixture that forks the bundle must
 * declare NODE_PATH for its CommonJS requires and the required asset dirs.
 */
export async function buildSyntheticCliEntry(
  outfile: string,
  compositionImportProbe?: string,
): Promise<void> {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  await build({
    entryPoints: [fileURLToPath(new URL("./cli.ts", import.meta.url))],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    logLevel: "silent",
    plugins: [
      {
        name: RUNTIME_PAYLOAD_PROJECTION_MODULE,
        setup(builder) {
          const exactModule = new RegExp(
            "^" + RUNTIME_PAYLOAD_PROJECTION_MODULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
          );
          builder.onResolve({ filter: exactModule }, () => ({
            path: RUNTIME_PAYLOAD_PROJECTION_MODULE,
            namespace: RUNTIME_PAYLOAD_PROJECTION_MODULE,
          }));
          builder.onLoad({ filter: /.*/, namespace: RUNTIME_PAYLOAD_PROJECTION_MODULE }, () => ({
            contents: createRuntimePayloadProjectionSource(root).source,
            loader: "js",
            resolveDir: root,
          }));
        },
      },
      {
        name: "synthetic-headless-services",
        setup(builder) {
          if (compositionImportProbe) {
            builder.onLoad({ filter: /[\\/]db[\\/]connection\.ts$/ }, (args) => ({
              contents:
                `import {writeFileSync as recordCliDatabaseImport} from 'node:fs'; recordCliDatabaseImport(${JSON.stringify(compositionImportProbe + ".database")}, 'loaded');\n` +
                readFileSync(args.path, "utf8"),
              loader: "ts",
              resolveDir: dirname(args.path),
            }));
          }
          builder.onResolve(
            {
              filter: new RegExp(
                "(createHeadlessRemoteHost|headlessRemoteComposition|pairingControl|nodePerformanceDiagnostics|runtimePersistenceRuntime)$",
              ),
            },
            (args) => ({ path: args.path, namespace: "synthetic" }),
          );
          builder.onLoad({ filter: new RegExp(".*"), namespace: "synthetic" }, (args) => {
            const contents = args.path.endsWith("createHeadlessRemoteHost")
              ? (compositionImportProbe
                  ? `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(compositionImportProbe)}, 'loaded'); globalThis.__cliFixture.onImport?.();\n`
                  : "") +
                "export const createHeadlessRemoteHost = (options) => globalThis.__cliFixture.create(options);"
              : args.path.endsWith("runtimePersistenceRuntime")
                ? (compositionImportProbe
                    ? `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(compositionImportProbe + ".persistence")}, 'loaded'); globalThis.__cliFixture.onPersistenceImport?.();\n`
                    : "") + "export const getRuntimePersistenceSample = () => null;"
                : args.path.endsWith("nodePerformanceDiagnostics")
                  ? "export const startNodePerformanceDiagnostics = () => ({stop: () => globalThis.__cliFixture.stopDiagnostics()});"
                  : args.path.endsWith("headlessRemoteComposition")
                    ? "export class HeadlessCompositionShutdownError extends AggregateError {}"
                    : "export const requestPairingFromRunningServer = () => { throw new Error('Pairing is outside this fixture.'); }; export const requestHostStatusFromRunningServer = () => { throw new Error('Status is outside this fixture.'); }; export const requestHostStatusDetailsFromRunningServer = () => { throw new Error('Detailed status is outside this fixture.'); };";
            return { contents, loader: "js" };
          });
        },
      },
    ],
  });
}

export async function buildCliProcessFixture(
  outfile: string,
  fixture: "cliStartupSignal" | "cliStartupDeadline",
): Promise<void> {
  await build({
    entryPoints: [fileURLToPath(new URL(`./fixtures/${fixture}.mjs`, import.meta.url))],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    define: { "import.meta.url": JSON.stringify(pathToFileURL(outfile).href) },
    logLevel: "silent",
  });
}
