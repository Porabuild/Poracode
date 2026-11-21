/** Internal command meaning, reusable by hosts and client widgets; not a wire DTO. */
export type CommandIntentKind =
  | "check"
  | "command"
  | "git"
  | "install"
  | "list"
  | "package"
  | "search"
  | "view";

export type CommandTitleLabel =
  | "check"
  | "format-files"
  | "git"
  | "install-packages"
  | "list"
  | "list-packages"
  | "package-config"
  | "package-manager"
  | "run"
  | "search";

export type CommandTitle =
  | { kind: "label"; label: CommandTitleLabel; text?: string }
  | { kind: "view"; text: string; lines?: string }
  | { kind: "search"; query: string; scope?: string; additionalPatterns?: number };

export interface CommandIntent {
  kind: CommandIntentKind;
  title: CommandTitle;
  path?: { path: string; filePath?: boolean };
  additionalActions?: number;
}

/** Existing formatted client API; interpretation is represented above. */
export interface CommandIntentDisplay {
  title: string;
  kind: CommandIntentKind;
  parts?: { prefix: string; path: string; filePath?: boolean };
}

export interface CommandTitleLabels {
  label: (key: CommandTitleLabel | "view") => string;
  searchIn: (query: string, scope: string) => string;
}
