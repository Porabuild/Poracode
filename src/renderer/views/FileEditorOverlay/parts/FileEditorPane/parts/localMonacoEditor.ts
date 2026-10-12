import { Editor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
// oxlint-disable-next-line import/default -- Vite's ?worker transform generates the constructor default export.
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
// oxlint-disable-next-line import/default -- Vite's ?worker transform generates the constructor default export.
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
// oxlint-disable-next-line import/default -- Vite's ?worker transform generates the constructor default export.
import CssWorker from "monaco-editor/language/css/css.worker?worker";
// oxlint-disable-next-line import/default -- Vite's ?worker transform generates the constructor default export.
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
// oxlint-disable-next-line import/default -- Vite's ?worker transform generates the constructor default export.
import TsWorker from "monaco-editor/language/typescript/ts.worker?worker";

// Imported only when a source editor mounts. Workers and runtime come from
// the same installed package and Vite asset graph, including remote/offline UI.
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    switch (label) {
      case "json":
        return new JsonWorker();
      case "css":
      case "scss":
      case "less":
        return new CssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlWorker();
      case "typescript":
      case "javascript":
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

// Monaco 0.56 exports feature namespaces at the top level. Keep validation
// setup with that runtime rather than the CDN's older languages.typescript API.
// LSP supplies semantic diagnostics when enabled; syntax validation stays on.
const diagnostics = { noSemanticValidation: true, noSyntaxValidation: false };
monaco.typescript.typescriptDefaults.setDiagnosticsOptions(diagnostics);
monaco.typescript.javascriptDefaults.setDiagnosticsOptions(diagnostics);
loader.config({ monaco });

export default Editor;
