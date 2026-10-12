import type { TsdownPlugin } from "tsdown";
import {
  createRuntimePayloadProjectionSource,
  RUNTIME_PAYLOAD_PROJECTION_MODULE,
} from "./runtimePayloadProjectionSource.mjs";

export { RUNTIME_PAYLOAD_PROJECTION_MODULE } from "./runtimePayloadProjectionSource.mjs";
const virtualId = "\0" + RUNTIME_PAYLOAD_PROJECTION_MODULE;

/** Build-time composition only; runtime readers never discover files or load adapters. */
export function runtimePayloadProjectionPlugin(
  root: string,
  /** Some consumers treat watched directories as module imports; use their watcher instead. */
  { watchDirectory = true }: { watchDirectory?: boolean } = {},
) {
  return {
    name: RUNTIME_PAYLOAD_PROJECTION_MODULE,
    resolveId(id: string) {
      return id === RUNTIME_PAYLOAD_PROJECTION_MODULE ? virtualId : null;
    },
    load(this: { addWatchFile(path: string): void }, id: string) {
      if (id !== virtualId) return null;
      const { directory, files, source } = createRuntimePayloadProjectionSource(root);
      if (watchDirectory) this.addWatchFile(directory);
      for (const path of files) this.addWatchFile(path);
      return source;
    },
  } satisfies TsdownPlugin;
}
