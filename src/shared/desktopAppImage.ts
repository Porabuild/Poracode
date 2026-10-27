import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { DESKTOP_CLI_RESOURCE_DIRECTORIES } from "../../packages/poracode-cli/lib/desktopBundle.mjs";

/** Re-enter the durable AppImage, then use its freshly mounted verified bootstrap. */
export function appImageCliLauncher(imagePath: string): string {
  const word = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
  return [
    "#!/bin/sh",
    "# poracode-appimage-cli-v1",
    "inherited_appdir=${APPDIR-}",
    'if [ -n "$inherited_appdir" ]; then',
    '  if [ -d "$inherited_appdir" ]; then inherited_appdir=$(CDPATH= cd -P "$inherited_appdir" && pwd) || exit 1; fi',
    ...Object.entries(DESKTOP_CLI_RESOURCE_DIRECTORIES).map(
      ([key, directory]) =>
        `  if [ "\${${key}-}" = "$inherited_appdir/resources/${directory}" ]; then unset ${key}; fi`,
    ),
    "fi",
    `exec env NODE_OPTIONS= NODE_PATH= ELECTRON_RUN_AS_NODE=1 APPDIR= ${[imagePath, ...desktopAppImageLaunchArguments()].map(word).join(" ")} "$@"`,
    "",
  ].join("\n");
}

/** Let the fresh bootstrap supply its own defaults, preserving explicit overrides. */
export function desktopAppImageOwnerEnvironment(
  env: NodeJS.ProcessEnv,
  resourcesDir: string,
): NodeJS.ProcessEnv {
  const resources = realpathSync.native(resourcesDir);
  const childEnv: NodeJS.ProcessEnv = { ...env, APPDIR: "", NODE_OPTIONS: "", NODE_PATH: "" };
  for (const [key, directory] of Object.entries(DESKTOP_CLI_RESOURCE_DIRECTORIES))
    if (childEnv[key] === join(resources, directory)) delete childEnv[key];
  return childEnv;
}

/** Every invocation must mount the durable image for its own process lifetime. */
export function desktopAppImageLaunchArguments(): string[] {
  const bootstrap = [
    'const {join} = require("node:path");',
    'const {pathToFileURL} = require("node:url");',
    'if (!process.env.APPDIR) throw new Error("Poracode AppImage did not mount its runtime.");',
    'process.argv[1] = join(process.env.APPDIR, "resources/desktop-cli/bootstrap.mjs");',
    "import(pathToFileURL(process.argv[1]).href)",
    ".catch(error => { console.error(error); process.exitCode = 1; });",
  ].join("\n");
  return ["-e", bootstrap, "--", "poracode"];
}

/** An AppImage terminal can pass its own APPIMAGE into an unrelated desktop app. */
export function selectedDesktopAppImage(input: {
  readonly platform: NodeJS.Platform;
  readonly resourcesDir: string;
  readonly executablePath: string;
  readonly env: NodeJS.ProcessEnv;
}): string | undefined {
  if (input.platform !== "linux" || !input.env.APPIMAGE || !input.env.APPDIR) return undefined;
  try {
    const mount = realpathSync.native(input.env.APPDIR);
    return realpathSync.native(input.resourcesDir) === join(mount, "resources") &&
      dirname(realpathSync.native(input.executablePath)) === mount
      ? realpathSync.native(input.env.APPIMAGE)
      : undefined;
  } catch {
    return undefined;
  }
}
