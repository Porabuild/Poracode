import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { build, type UserConfig } from "tsdown";
import {
  withRuntimeDeclarationBatch,
  type RuntimeDeclarationPluginApi,
} from "./runtimeDeclarationPlugin.ts";

const [rootArgument, outputArgument, selectedArgument] = process.argv.slice(2);
if (!rootArgument || !outputArgument || !selectedArgument)
  throw new Error("Development build requires a root, output directory and entry selection.");
const root = resolve(rootArgument);
const outDir = resolve(outputArgument);
const selected = new Set(JSON.parse(selectedArgument) as string[]);
const configs = (await import(pathToFileURL(join(root, "tsdown.config.ts")).href))
  .default as UserConfig[];
const entries: {
  id: string;
  runtimeDeclaration: boolean;
  inputs: string[];
  files: string[];
}[] = [];

function declarationApi(plugin: unknown): RuntimeDeclarationPluginApi | undefined {
  return plugin && typeof plugin === "object" && "api" in plugin
    ? (plugin.api as RuntimeDeclarationPluginApi)
    : undefined;
}

const runtime = configs
  .flatMap((config) => config.plugins ?? [])
  .map(declarationApi)
  .find((api) => api?.runtimeDeclaration);
if (!runtime) throw new Error("Development runtime has no source declaration.");

await withRuntimeDeclarationBatch(root, runtime.runtimeDeclaration.buildOptions, async (batch) => {
  const results = await Promise.allSettled(
    configs.map(async (config) => {
      const id = Object.keys(config.entry as Record<string, string>).join("+");
      if (selected.size > 0 && !selected.has(id)) return;
      const configuredPlugins = Array.isArray(config.plugins) ? config.plugins : [config.plugins];
      const plugins = configuredPlugins.map((plugin) => {
        const api = declarationApi(plugin);
        return api?.runtimeDeclaration ? api.runtimeDeclaration.withBatch(batch) : plugin;
      });
      const entry = {
        id,
        runtimeDeclaration: plugins.some((plugin) => declarationApi(plugin)?.runtimeDeclaration),
        inputs: [] as string[],
        files: [] as string[],
      };
      const bundles = await build({
        ...config,
        config: false,
        cwd: root,
        outDir,
        clean: false,
        report: false,
        logLevel: "silent",
        plugins: [
          ...plugins,
          {
            name: "poracode:dev-build-inputs",
            generateBundle() {
              entry.inputs = [...this.getModuleIds()]
                .map((moduleId) => moduleId.split("?")[0]!)
                .filter(isAbsolute);
            },
            writeBundle(_options, bundle) {
              entry.files = Object.keys(bundle);
              for (const file of entry.files) {
                const local = relative(outDir, resolve(outDir, file));
                if (local === ".." || local.startsWith(".." + sep) || isAbsolute(local))
                  throw new Error("Development build output escapes its staging directory.");
              }
            },
          },
        ],
      });
      await Promise.all(bundles.map((bundle) => bundle[Symbol.asyncDispose]()));
      entries.push(entry);
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
});

if (!process.send) throw new Error("Development build requires an owning process.");
await new Promise<void>((done, reject) => {
  process.send!({ version: 1, entries }, (error) => (error ? reject(error) : done()));
});
process.disconnect?.();
