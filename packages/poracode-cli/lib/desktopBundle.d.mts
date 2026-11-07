export const DESKTOP_CLI_RESOURCE_DIRECTORIES: Readonly<Record<string, string>>;

export interface DesktopCliBundle {
  readonly formatVersion: 1;
  readonly runtime: "electron-run-as-node";
  readonly channel: "stable" | "nightly";
  readonly commandName: "poracode" | "poracode-next";
  readonly appVersion: string;
  readonly electronVersion: string;
  readonly platform: NodeJS.Platform;
  readonly executableName: string;
  readonly serverPrefixRelative: string;
  readonly entryRelative: string;
  readonly files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly resourcesDir: string;
  readonly prefix: string;
  readonly entry: string;
  readonly sources: ReadonlyMap<
    string,
    { readonly source: string; readonly format: "module" | "commonjs" }
  >;
}

export function readSelectedDesktopBundle(options: {
  readonly resourcesDir: string;
  readonly execPath?: string;
  readonly platform?: NodeJS.Platform;
  readonly electronVersion?: string;
}): DesktopCliBundle;
