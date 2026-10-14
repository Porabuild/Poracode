import { register } from "node:module";
import {
  cursorSdkParamFamily,
  type CursorSdkModel,
  type CursorSdkModelSelection,
} from "./sdkModels";

const MAX_MODE_SYMBOL = "poracode.cursor-sdk.max-mode.v1";

/**
 * The public local SDK advertises long contexts but omits RequestedModel.maxMode
 * (verified in 1.0.31–1.0.37). Apply the missing flag only when the live catalog
 * identifies a selected context beyond the model's first, standard window.
 * This hook changes the module in the isolated worker's memory; it never writes
 * to the user's installation. An unrecognized local request fails qualification.
 * https://forum.cursor.com/t/grok-4-7-run-rejects-advertised-context-500k/172554/7
 */
export class CursorSdkMaxModeCompatibility {
  private catalog: readonly CursorSdkModel[] = [];
  private registered = false;

  get hasCatalog(): boolean {
    return this.catalog.length > 0;
  }

  setCatalog(catalog: readonly CursorSdkModel[]): void {
    this.catalog = catalog;
  }

  needsMaxMode(selection: CursorSdkModelSelection): boolean {
    const model = this.catalog.find(
      (candidate) => candidate.id === selection.id || candidate.aliases?.includes(selection.id),
    );
    return (
      selection.params?.some(({ id, value }) => {
        const context = model?.parameters?.find(
          (definition) => definition.id === id && cursorSdkParamFamily(id) === "context",
        );
        return (
          context !== undefined &&
          context.values[0]?.value !== value &&
          context.values.some((candidate) => candidate.value === value)
        );
      }) === true
    );
  }

  registerForImport(specifier: string): void {
    if (this.registered) return;
    this.registered = true;
    Object.defineProperty(globalThis, Symbol.for(MAX_MODE_SYMBOL), {
      configurable: true,
      value: (selection: CursorSdkModelSelection) => this.needsMaxMode(selection),
    });
    // register() works on the SDK's minimum Node 22.13, including the Node 22.14
    // WSL helper. Synchronous registerHooks() requires a newer Node release.
    const loaderSource = `
      import { Buffer } from "node:buffer";
      const patch = ${patchCursorSdkMaxModeRequest.toString()};
      let directory;
      export function initialize(data) { directory = data.directory; }
      export async function load(url, context, nextLoad) {
        const result = await nextLoad(url, context);
        if (!url.startsWith(directory) || result.format !== "module" || result.source == null) return result;
        const source = typeof result.source === "string" ? result.source : Buffer.from(result.source).toString("utf8");
        return { ...result, source: patch(source) };
      }
    `;
    register(`data:text/javascript;base64,${Buffer.from(loaderSource).toString("base64")}`, {
      parentURL: specifier,
      data: { directory: new URL(".", specifier).href },
    });
  }
}

/** Self-contained because the module loader evaluates it in its own thread. */
export function patchCursorSdkMaxModeRequest(source: string): string {
  if (!source.includes('"./src/agent/local-executor.ts"(')) return source;
  const pattern =
    /new\s+[$A-Za-z_][$\w]*\.[$A-Za-z_][$\w]*\(\{modelId:([$A-Za-z_][$\w]*)\.model\.id,parameters:/gu;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(
      "The Cursor SDK local model request format is not supported by this integration.",
    );
  }
  return source.replace(pattern, (match, options: string) =>
    match.replace(
      ",parameters:",
      `,maxMode:globalThis[Symbol.for("poracode.cursor-sdk.max-mode.v1")](${options}.model),parameters:`,
    ),
  );
}
