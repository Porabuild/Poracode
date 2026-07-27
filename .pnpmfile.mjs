import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = dirname(fileURLToPath(import.meta.url));
const loaderUrl = pathToFileURL(
  resolve(workspaceRoot, "scripts/pnpm-esm-node-path-loader.mjs"),
).href;

export const hooks = {
  updateConfig(config) {
    if (!config.enableGlobalVirtualStore) return config;

    const registrationCode =
      `import{register}from'node:module';` +
      `register('${loaderUrl}','${pathToFileURL(workspaceRoot).href}');`;
    const importFlag = `--import=data:text/javascript,${encodeURIComponent(registrationCode)}`;
    const currentNodeOptions = process.env.NODE_OPTIONS?.trim() ?? "";

    config.extraEnv ??= {};
    config.extraEnv.NODE_OPTIONS = currentNodeOptions.includes(loaderUrl)
      ? currentNodeOptions
      : [currentNodeOptions, importFlag].filter(Boolean).join(" ");
    return config;
  },
};
