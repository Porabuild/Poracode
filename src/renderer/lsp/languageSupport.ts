import { getLanguageFromPath } from "../views/FileEditorOverlay/parts/FileEditorPane/parts/langMap";

/** Map file extension to the language server's languageId. */
export function detectLanguageServerId(filePath: string): string | null {
  const lang = getLanguageFromPath(filePath);
  // Map Monaco language IDs to language server IDs
  switch (lang) {
    case "typescript":
    case "javascript":
      return "typescript";
    case "python":
      return "python";
    case "go":
      return "go";
    case "css":
    case "scss":
    case "less":
      return "css";
    case "html":
      return "html";
    case "json":
      return "json";
    case "rust":
      return "rust";
    default:
      return null;
  }
}

/** Monaco language IDs served by a given server language ID. */
export function getMonacoLanguages(serverLanguageId: string): string[] {
  switch (serverLanguageId) {
    case "typescript":
      return ["typescript", "javascript"];
    case "css":
      return ["css", "scss", "less"];
    default:
      return [serverLanguageId];
  }
}
