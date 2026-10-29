import { readTuiBootstrap, UnsupportedTuiBootstrapVersionError } from "./bootstrap";
import { TuiReauthRequiredError } from "./adapter/connection";
import { TUI_REPAIR_EXIT_CODE } from "@/shared/tuiSession";

try {
  const bootstrap = readTuiBootstrap();
  process.env.PORACODE_TUI_HOME = bootstrap.home;
  delete process.env.OPENCODE_DRIVE;
  process.chdir(bootstrap.directory);
  const [
    { createAdapter },
    { createTuiConfigStore },
    { Effect },
    { Global },
    { LayerNode },
    { run },
  ] = await Promise.all([
    import("./adapter"),
    import("./config-store"),
    import("effect"),
    import("@opencode/util/global"),
    import("@opencode/util/effect/layer-node"),
    import("@opencode/tui"),
  ]);
  const adapter = await createAdapter(bootstrap);
  try {
    await Effect.runPromise(
      run({
        app: { name: "poracode", version: bootstrap.appVersion, channel: "stable" },
        server: { endpoint: { url: "http://poracode.invalid/" }, fetch: adapter.fetch },
        args: {
          ...(bootstrap.args.continue !== undefined ? { continue: bootstrap.args.continue } : {}),
          ...(bootstrap.args.sessionId ? { sessionID: bootstrap.args.sessionId } : {}),
          ...(bootstrap.args.prompt !== undefined ? { prompt: bootstrap.args.prompt } : {}),
          ...(bootstrap.args.auto !== undefined ? { auto: bootstrap.args.auto } : {}),
        },
        config: createTuiConfigStore(bootstrap.home),
        packages: {
          prepare: async () => {
            throw new Error("Plugins are not supported in this TUI build");
          },
        },
        plugins: {
          local: false,
          server: false,
          internal: [(await import("./plugin")).createPoracodePlugin({ adapter })],
        },
      }).pipe(Effect.provide(LayerNode.compile(Global.node))),
    );
  } finally {
    await adapter.dispose();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode =
    error instanceof TuiReauthRequiredError
      ? TUI_REPAIR_EXIT_CODE
      : error instanceof UnsupportedTuiBootstrapVersionError
        ? 2
        : 1;
}
