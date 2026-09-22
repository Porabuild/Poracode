import { build } from "esbuild";
import { fileURLToPath } from "node:url";

/**
 * Bundle the real CLI entry for the spawned-child suites with only the
 * headless composition, pairing control and performance-diagnostics imports
 * replaced by the fixture bridge `globalThis.__cliFixture` (implemented by
 * `fixtures/cliStartupSignal.mjs` and `fixtures/cliStartupDeadline.mjs`).
 *
 * Runtime packages stay external, so a fixture that forks the bundle must
 * declare NODE_PATH for its CommonJS requires and the required asset dirs.
 */
export async function buildSyntheticCliEntry(outfile: string): Promise<void> {
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
        name: "synthetic-headless-services",
        setup(builder) {
          builder.onResolve(
            {
              filter: new RegExp(
                "(createHeadlessRemoteHost|headlessRemoteComposition|pairingControl|nodePerformanceDiagnostics)$",
              ),
            },
            (args) => ({ path: args.path, namespace: "synthetic" }),
          );
          builder.onLoad({ filter: new RegExp(".*"), namespace: "synthetic" }, (args) => {
            const contents = args.path.endsWith("createHeadlessRemoteHost")
              ? "export const createHeadlessRemoteHost = (options) => globalThis.__cliFixture.create(options);"
              : args.path.endsWith("nodePerformanceDiagnostics")
                ? "export const startNodePerformanceDiagnostics = () => ({stop: () => globalThis.__cliFixture.stopDiagnostics()});"
                : args.path.endsWith("headlessRemoteComposition")
                  ? "export class HeadlessCompositionShutdownError extends AggregateError {}"
                  : "export const requestPairingFromRunningServer = () => { throw new Error('Pairing is outside this fixture.'); }; export const requestHostStatusFromRunningServer = () => { throw new Error('Status is outside this fixture.'); };";
            return { contents, loader: "js" };
          });
        },
      },
    ],
  });
}
