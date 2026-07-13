import type { Monaco } from "@monaco-editor/react";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

/**
 * Define custom Monaco themes that use transparent backgrounds so the
 * parent element's CSS `var(--content-background)` shows through.
 */
export function defineAppThemes(monaco: Monaco) {
  const transparent = "#00000000";

  // Disable Monaco's built-in TS/JS semantic validation.
  // When LSP is enabled, the language server provides diagnostics instead.
  // When LSP is off, we want a clean editor with no false errors.
  const diagOpts = { noSemanticValidation: true, noSyntaxValidation: false };
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagOpts);
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagOpts);

  monaco.editor.defineTheme("poracode-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": transparent,
      "editorGutter.background": transparent,
      "editor.lineHighlightBackground": "#ffffff08",
      "editor.selectionBackground": "#ffffff18",
      "editorWidget.background": "#2a2a2e",
      "editorWidget.border": "#3a3a40",
      "scrollbar.shadow": transparent,
      "scrollbarSlider.background": "#ffffff15",
      "scrollbarSlider.hoverBackground": "#ffffff25",
      "scrollbarSlider.activeBackground": "#ffffff35",
      "editorOverviewRuler.border": transparent,
    },
  });

  monaco.editor.defineTheme("poracode-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": transparent,
      "editorGutter.background": transparent,
      "editor.lineHighlightBackground": "#00000006",
      "editor.selectionBackground": "#00000012",
      "editorWidget.background": "#f5f5f8",
      "editorWidget.border": "#e0e0e4",
      "scrollbar.shadow": transparent,
      "scrollbarSlider.background": "#00000012",
      "scrollbarSlider.hoverBackground": "#00000020",
      "scrollbarSlider.activeBackground": "#00000030",
      "editorOverviewRuler.border": transparent,
    },
  });
}

export function useResolvedTheme(): "light" | "dark" {
  const themeMode = useSharedSettings((s) => s.themeMode);
  if (themeMode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return themeMode;
}
