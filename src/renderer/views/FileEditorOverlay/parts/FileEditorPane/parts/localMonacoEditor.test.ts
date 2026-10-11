// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  editor: {},
  languages: {},
  typescript: {
    typescriptDefaults: { setDiagnosticsOptions: vi.fn<(options: unknown) => void>() },
    javascriptDefaults: { setDiagnosticsOptions: vi.fn<(options: unknown) => void>() },
  },
}));
const loader = vi.hoisted(() => ({ config: vi.fn<(config: unknown) => void>() }));
vi.mock("monaco-editor", () => runtime);
vi.mock("@monaco-editor/react", () => ({ Editor: () => null, loader }));
vi.mock("monaco-editor/editor/editor.worker?worker", () => ({
  default: class {
    kind = "editor";
  },
}));
vi.mock("monaco-editor/language/json/json.worker?worker", () => ({
  default: class {
    kind = "json";
  },
}));
vi.mock("monaco-editor/language/css/css.worker?worker", () => ({
  default: class {
    kind = "css";
  },
}));
vi.mock("monaco-editor/language/html/html.worker?worker", () => ({
  default: class {
    kind = "html";
  },
}));
vi.mock("monaco-editor/language/typescript/ts.worker?worker", () => ({
  default: class {
    kind = "typescript";
  },
}));

describe("local editor runtime", () => {
  it("uses the installed package's actual TypeScript feature namespace", async () => {
    // jsdom lacks this browser clipboard capability; keep the Monaco module
    // and its namespace unmocked while declaring unavailable clipboard paste.
    const descriptor = Object.getOwnPropertyDescriptor(document, "queryCommandSupported");
    Object.defineProperty(document, "queryCommandSupported", {
      configurable: true,
      value: () => false,
    });
    try {
      const actual = await vi.importActual<typeof import("monaco-editor")>("monaco-editor");
      expect(typeof actual.typescript.typescriptDefaults.setDiagnosticsOptions).toBe("function");
      expect(typeof actual.typescript.javascriptDefaults.setDiagnosticsOptions).toBe("function");
      expect(actual.languages).not.toHaveProperty("typescript");
    } finally {
      if (descriptor) Object.defineProperty(document, "queryCommandSupported", descriptor);
      else Reflect.deleteProperty(document, "queryCommandSupported");
    }
  });
  it("configures the installed runtime before exposing the source editor", async () => {
    const before = document.querySelectorAll("script[src]").length;
    const module = await import("./localMonacoEditor");
    expect(typeof module.default).toBe("function");
    expect(loader.config).toHaveBeenCalledExactlyOnceWith({ monaco: runtime });
    expect(
      runtime.typescript.typescriptDefaults.setDiagnosticsOptions,
    ).toHaveBeenCalledExactlyOnceWith({ noSemanticValidation: true, noSyntaxValidation: false });
    expect(
      runtime.typescript.javascriptDefaults.setDiagnosticsOptions,
    ).toHaveBeenCalledExactlyOnceWith({ noSemanticValidation: true, noSyntaxValidation: false });
    expect(document.querySelectorAll("script[src]").length).toBe(before);
  });
  it("preserves the editor and language worker service labels", async () => {
    await import("./localMonacoEditor");
    const expected = {
      editorWorkerService: "editor",
      json: "json",
      css: "css",
      scss: "css",
      less: "css",
      html: "html",
      handlebars: "html",
      razor: "html",
      typescript: "typescript",
      javascript: "typescript",
    };
    for (const [label, kind] of Object.entries(expected)) {
      const worker = self.MonacoEnvironment?.getWorker?.("", label) as unknown as { kind: string };
      expect(worker.kind).toBe(kind);
    }
  });
});
