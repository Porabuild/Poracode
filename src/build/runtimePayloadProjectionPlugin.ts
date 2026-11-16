import type { TsdownPlugin } from "tsdown";
import {
  createRuntimePayloadProjectionSource,
  createToolPresentationAdapterSource,
  RUNTIME_PAYLOAD_PROJECTION_MODULE,
  TOOL_PRESENTATION_ADAPTER_MODULE,
} from "./runtimePayloadProjectionSource.mjs";

export { RUNTIME_PAYLOAD_PROJECTION_MODULE } from "./runtimePayloadProjectionSource.mjs";
const sources = new Map([
  ["\0" + RUNTIME_PAYLOAD_PROJECTION_MODULE, createRuntimePayloadProjectionSource],
  ["\0" + TOOL_PRESENTATION_ADAPTER_MODULE, createToolPresentationAdapterSource],
]);

/** Build-time composition only; runtime readers never discover files or load adapters. */
export function runtimePayloadProjectionPlugin(
  root: string,
  /** Some consumers treat watched directories as module imports; use their watcher instead. */
  { watchDirectory = true }: { watchDirectory?: boolean } = {},
) {
  return {
    name: RUNTIME_PAYLOAD_PROJECTION_MODULE,
    resolveId(id: string) {
      return sources.has("\0" + id) ? "\0" + id : null;
    },
    load(this: { addWatchFile(path: string): void }, id: string) {
      const createSource = sources.get(id);
      if (!createSource) return null;
      const { directory, files, source } = createSource(root);
      if (watchDirectory) this.addWatchFile(directory);
      for (const path of files) this.addWatchFile(path);
      return source;
    },
  } satisfies TsdownPlugin;
}
