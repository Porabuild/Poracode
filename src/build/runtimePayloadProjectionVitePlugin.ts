import { relative, sep } from "node:path";
import type { Plugin } from "vite";
import { runtimePayloadProjectionPlugin } from "./runtimePayloadProjectionPlugin.ts";
import {
  RUNTIME_PAYLOAD_PROJECTION_FILE,
  RUNTIME_PAYLOAD_PROJECTION_MODULE,
  runtimePayloadProjectionDirectory,
} from "./runtimePayloadProjectionSource.mjs";

/** Vite treats addWatchFile entries as imports; directories belong to its watcher. */
export function runtimePayloadProjectionVitePlugin(root: string): Plugin {
  const directory = runtimePayloadProjectionDirectory(root);
  return {
    ...runtimePayloadProjectionPlugin(root, { watchDirectory: false }),
    configureServer(server) {
      const refresh = (path: string) => {
        const parts = relative(directory, path).split(sep);
        if (
          parts.length !== 2 ||
          !parts[0] ||
          parts[0].startsWith(".") ||
          parts[1] !== RUNTIME_PAYLOAD_PROJECTION_FILE
        )
          return;
        for (const environment of Object.values(server.environments)) {
          const module = environment.moduleGraph.getModuleById(
            "\0" + RUNTIME_PAYLOAD_PROJECTION_MODULE,
          );
          if (module) environment.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.add(directory);
      server.watcher.on("add", refresh);
      server.watcher.on("unlink", refresh);
      server.httpServer?.once("close", () => {
        server.watcher.off("add", refresh);
        server.watcher.off("unlink", refresh);
      });
    },
  };
}
