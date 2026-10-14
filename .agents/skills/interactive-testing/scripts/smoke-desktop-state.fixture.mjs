// Test-only preload for launcher validation/cancellation fixtures. Never use
// this module for interactive qualification: it supplies no desktop evidence.
import childProcess from "node:child_process";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";

const desktopModule = new URL("./smoke-desktop-state.mjs", import.meta.url).href;
registerHooks({
  load(url, context, nextLoad) {
    if (url !== desktopModule) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source:
        "export function assertSmokeDesktopUnlocked() { return { required: true, screenLocked: false }; }",
    };
  },
});

const spawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  if (
    /^electron(?:\.exe)?$/i.test(basename(String(command))) ||
    args?.some((arg) => String(arg).endsWith("prepare-smoke-runtime.mjs"))
  ) {
    throw new Error("Desktop unit fixtures cannot launch Electron or prepare an app runtime");
  }
  return spawn.call(this, command, args, options);
};
syncBuiltinESMExports();
