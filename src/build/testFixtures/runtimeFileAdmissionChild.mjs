import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.once("message", async (spec) => {
  try {
    const module = spec.kind.startsWith("archive")
      ? // eslint-disable-next-line import/no-dynamic-require -- parent names the actual fixture-compiled helper
        require(spec.module)
      : await import(spec.module);
    const run = spec.kind.startsWith("archive")
      ? () => module.ensureSshRuntimeBundle(spec.options)
      : spec.kind.startsWith("source")
        ? () => module.readRuntimeSourceDeclaration(spec.root, { fixture: true })
        : () => module.stageAgentPlugins(spec.options);
    const archivePath = spec.kind === "archive-cached" ? run().archivePath : undefined;
    process.once("message", () => {
      try {
        run();
        process.send({ kind: "result", completed: true }, () => process.disconnect());
      } catch (error) {
        process.send({ kind: "result", completed: false, error: String(error) }, () =>
          process.disconnect(),
        );
      }
    });
    process.send({ kind: "ready", archivePath });
  } catch (error) {
    process.send({ kind: "bootstrap-error", error: String(error) }, () => process.disconnect());
  }
});
