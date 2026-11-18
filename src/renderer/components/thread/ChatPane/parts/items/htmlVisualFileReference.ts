export type HtmlVisualFilePart =
  | { kind: "markdown"; text: string }
  | { kind: "html-file"; path: string; title: string };

/** Split provider-authored transcript references into prose and workspace HTML files. */
export type SplitHtmlVisualFileReferences = (text: string) => HtmlVisualFilePart[];
