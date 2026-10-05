import type { Monaco } from "@monaco-editor/react";
import type {
  editor as MonacoEditor,
  CancellationToken,
  languages as MonacoLanguages,
} from "monaco-editor";
import type { LspIpcTransport } from "./ipcTransport";

type ITextModel = MonacoEditor.ITextModel;
type IPosition = { lineNumber: number; column: number };

type IDisposable = { dispose(): void };
type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };

// ── LSP ↔ Monaco type translation ───────────────────────────

/** LSP uses 0-based line/col. Monaco uses 1-based line/col. */
function toLspPosition(monacoPos: { lineNumber: number; column: number }) {
  return { line: monacoPos.lineNumber - 1, character: monacoPos.column - 1 };
}

function toMonacoRange(lspRange: LspRange, monaco: Monaco): InstanceType<typeof monaco.Range> {
  return new monaco.Range(
    lspRange.start.line + 1,
    lspRange.start.character + 1,
    lspRange.end.line + 1,
    lspRange.end.character + 1,
  );
}

/** Map LSP CompletionItemKind to Monaco. */
function mapCompletionKind(lspKind: number | undefined, monaco: Monaco): number {
  const k = monaco.languages.CompletionItemKind;
  // LSP kinds: 1=Text, 2=Method, 3=Function, 4=Constructor, 5=Field, 6=Variable, 7=Class, 8=Interface, 9=Module, etc.
  const map: Record<number, number> = {
    1: k.Text,
    2: k.Method,
    3: k.Function,
    4: k.Constructor,
    5: k.Field,
    6: k.Variable,
    7: k.Class,
    8: k.Interface,
    9: k.Module,
    10: k.Property,
    11: k.Unit,
    12: k.Value,
    13: k.Enum,
    14: k.Keyword,
    15: k.Snippet,
    16: k.Color,
    17: k.File,
    18: k.Reference,
    19: k.Folder,
    20: k.EnumMember,
    21: k.Constant,
    22: k.Struct,
    23: k.Event,
    24: k.Operator,
    25: k.TypeParameter,
  };
  return map[lspKind ?? 1] ?? k.Text;
}

/** Map LSP DiagnosticSeverity to Monaco MarkerSeverity. */
function mapSeverity(lspSeverity: number | undefined, monaco: Monaco): number {
  // LSP: 1=Error, 2=Warning, 3=Info, 4=Hint
  switch (lspSeverity) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Info;
  }
}

function completionLabelText(label: LspCompletionItem["label"]): string {
  return typeof label === "string" ? label : label.label;
}

function documentationToMarkdown(
  documentation: string | LspMarkupContent | undefined,
): string | { value: string } | undefined {
  if (!documentation) return undefined;
  return typeof documentation === "string" ? documentation : { value: documentation.value };
}

function completionTextEditRange(textEdit: LspCompletionTextEdit | undefined): LspRange | null {
  if (!textEdit) return null;
  if ("range" in textEdit) return textEdit.range;
  return textEdit.insert;
}

function hoverContentToMarkdown(content: LspHoverContent): { value: string } {
  if (typeof content === "string") return { value: content };
  if ("kind" in content) return { value: content.value };
  return { value: `\`\`\`${content.language}\n${content.value}\n\`\`\`` };
}

function isLocationLink(location: LspLocation | LspLocationLink): location is LspLocationLink {
  return "targetUri" in location;
}

function isUriInRoot(uri: string, rootUri: string): boolean {
  return uri === rootUri || uri.startsWith(`${rootUri}/`);
}

// ── Provider registration ───────────────────────────────────

/**
 * Register Monaco language providers that forward requests to the
 * language server via the IPC transport. Returns disposables for cleanup.
 */
export function registerLspProviders(
  monaco: Monaco,
  transport: LspIpcTransport,
  languageIds: string[],
  rootUri: string,
): IDisposable[] {
  let active = true;
  const disposables: IDisposable[] = [
    {
      dispose: () => {
        active = false;
      },
    },
  ];
  const live = (model: ITextModel, token: CancellationToken) =>
    active && !transport.isDisposed() && !model.isDisposed() && !token.isCancellationRequested;
  try {
    // Completion
    for (const lang of languageIds) {
      disposables.push(
        monaco.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: [".", "/", "<", '"', "'", "@", "#"],
          provideCompletionItems: async (
            model: ITextModel,
            position: IPosition,
            _context: MonacoLanguages.CompletionContext,
            token: CancellationToken,
          ) => {
            if (!live(model, token) || !isUriInRoot(model.uri.toString(), rootUri))
              return { suggestions: [] };

            let result: { items?: unknown[]; isIncomplete?: boolean } | unknown[] | null;
            try {
              result = (await transport.sendMessage({
                jsonrpc: "2.0",
                id: Date.now(),
                method: "textDocument/completion",
                params: {
                  textDocument: { uri: model.uri.toString() },
                  position: toLspPosition(position),
                },
              })) as { items?: unknown[]; isIncomplete?: boolean } | unknown[] | null;
            } catch {
              return { suggestions: [] };
            }

            if (!live(model, token) || !result) return { suggestions: [] };
            const items = Array.isArray(result) ? result : (result.items ?? []);
            const word = model.getWordUntilPosition(position);
            const fallbackRange = new monaco.Range(
              position.lineNumber,
              word.startColumn,
              position.lineNumber,
              word.endColumn,
            );

            return {
              suggestions: (items as LspCompletionItem[]).map((item) => {
                const textEditRange = completionTextEditRange(item.textEdit);
                return {
                  label: item.label,
                  kind: mapCompletionKind(item.kind, monaco),
                  insertText:
                    item.textEdit?.newText ?? item.insertText ?? completionLabelText(item.label),
                  insertTextRules:
                    item.insertTextFormat === 2
                      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                      : undefined,
                  detail: item.detail,
                  documentation: documentationToMarkdown(item.documentation),
                  sortText: item.sortText,
                  filterText: item.filterText,
                  range: textEditRange ? toMonacoRange(textEditRange, monaco) : fallbackRange,
                };
              }),
            };
          },
        }),
      );

      // Hover
      disposables.push(
        monaco.languages.registerHoverProvider(lang, {
          provideHover: async (
            model: ITextModel,
            position: IPosition,
            token: CancellationToken,
          ) => {
            if (!live(model, token) || !isUriInRoot(model.uri.toString(), rootUri)) return null;

            let result: LspHover | null;
            try {
              result = (await transport.sendMessage({
                jsonrpc: "2.0",
                id: Date.now(),
                method: "textDocument/hover",
                params: {
                  textDocument: { uri: model.uri.toString() },
                  position: toLspPosition(position),
                },
              })) as LspHover | null;
            } catch {
              return null;
            }

            if (!result?.contents) return null;

            const contents = Array.isArray(result.contents) ? result.contents : [result.contents];
            return {
              contents: contents.map(hoverContentToMarkdown),
              range: result.range ? toMonacoRange(result.range, monaco) : undefined,
            };
          },
        }),
      );

      // Go to definition
      disposables.push(
        monaco.languages.registerDefinitionProvider(lang, {
          provideDefinition: async (
            model: ITextModel,
            position: IPosition,
            token: CancellationToken,
          ) => {
            if (!live(model, token) || !isUriInRoot(model.uri.toString(), rootUri)) return null;

            let result: LspDefinitionResult | null;
            try {
              result = (await transport.sendMessage({
                jsonrpc: "2.0",
                id: Date.now(),
                method: "textDocument/definition",
                params: {
                  textDocument: { uri: model.uri.toString() },
                  position: toLspPosition(position),
                },
              })) as LspDefinitionResult | null;
            } catch {
              return null;
            }

            if (!live(model, token) || !result) return null;
            const locations = Array.isArray(result) ? result : [result];
            return locations.map((loc) =>
              isLocationLink(loc)
                ? {
                    uri: monaco.Uri.parse(loc.targetUri),
                    range: toMonacoRange(loc.targetSelectionRange ?? loc.targetRange, monaco),
                  }
                : {
                    uri: monaco.Uri.parse(loc.uri),
                    range: toMonacoRange(loc.range, monaco),
                  },
            );
          },
        }),
      );

      // Signature help
      disposables.push(
        monaco.languages.registerSignatureHelpProvider(lang, {
          signatureHelpTriggerCharacters: ["(", ","],
          provideSignatureHelp: async (
            model: ITextModel,
            position: IPosition,
            token: CancellationToken,
          ) => {
            if (!live(model, token) || !isUriInRoot(model.uri.toString(), rootUri)) return null;

            let result: LspSignatureHelp | null;
            try {
              result = (await transport.sendMessage({
                jsonrpc: "2.0",
                id: Date.now(),
                method: "textDocument/signatureHelp",
                params: {
                  textDocument: { uri: model.uri.toString() },
                  position: toLspPosition(position),
                },
              })) as LspSignatureHelp | null;
            } catch {
              return null;
            }

            if (!live(model, token) || !result) return null;
            return {
              value: {
                signatures: result.signatures.map((sig) => ({
                  label: sig.label,
                  documentation: documentationToMarkdown(sig.documentation),
                  parameters: (sig.parameters ?? []).map((p) => ({
                    label: p.label as string | [number, number],
                    documentation: documentationToMarkdown(p.documentation),
                  })),
                })),
                activeSignature: result.activeSignature ?? 0,
                activeParameter: result.activeParameter ?? 0,
              },
              dispose: () => {},
            };
          },
        }),
      );
    }

    // Diagnostics — listen for publishDiagnostics notifications
    transport.onMessage((message) => {
      const msg = message as { method?: string; params?: unknown };
      if (msg.method === "textDocument/publishDiagnostics") {
        const params = msg.params as LspPublishDiagnostics;
        if (!isUriInRoot(params.uri, rootUri)) return;

        const uri = monaco.Uri.parse(params.uri);
        const model = monaco.editor.getModel(uri);
        if (!active || transport.isDisposed() || !model || model.isDisposed()) return;

        const markers = params.diagnostics.map((d) => ({
          severity: mapSeverity(d.severity, monaco),
          message: d.message,
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
          source: d.source,
          code: d.code !== undefined ? String(d.code) : undefined,
        }));

        monaco.editor.setModelMarkers(model, "lsp", markers);
      }
    });

    return disposables;
  } catch (error) {
    for (const disposable of disposables) disposable.dispose();
    throw error;
  }
}

// ── Minimal LSP type interfaces (only what we use) ──────────

interface LspCompletionItem {
  label: string | { label: string; detail?: string };
  kind?: number;
  detail?: string;
  documentation?: string | LspMarkupContent;
  insertText?: string;
  insertTextFormat?: number;
  sortText?: string;
  filterText?: string;
  textEdit?: LspCompletionTextEdit;
}

interface LspMarkupContent {
  kind: "markdown" | "plaintext";
  value: string;
}

type LspHoverContent = string | LspMarkupContent | { language: string; value: string };

type LspCompletionTextEdit =
  | { range: LspRange; newText: string }
  | { insert: LspRange; replace: LspRange; newText: string };

interface LspHover {
  contents: LspHoverContent | LspHoverContent[];
  range?: LspRange;
}

interface LspLocation {
  uri: string;
  range: LspRange;
}

interface LspLocationLink {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange?: LspRange;
}

type LspDefinitionResult = LspLocation | LspLocation[] | LspLocationLink | LspLocationLink[];

interface LspSignatureHelp {
  signatures: {
    label: string;
    documentation?: string | LspMarkupContent;
    parameters?: {
      label: string | [number, number];
      documentation?: string | LspMarkupContent;
    }[];
  }[];
  activeSignature?: number;
  activeParameter?: number;
}

interface LspPublishDiagnostics {
  uri: string;
  diagnostics: {
    range: LspRange;
    severity?: number;
    code?: number | string;
    source?: string;
    message: string;
  }[];
}
