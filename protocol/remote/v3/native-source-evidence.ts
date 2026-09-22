import { basename, posix } from "node:path";

/**
 * Recognize the repository's simple SOURCE_ROOT synchronized folders. This is
 * deliberately not an OpenStep parser: unsupported group configuration fails
 * closed and needs an explicit validator update. A folder only counts when the
 * application target, rather than a test/extension target, owns it.
 */
export function iosSourceIsCompiled(project: string, sourcePath: string): boolean {
  if (project.includes(`${basename(sourcePath)} in Sources`)) return true;
  const text = project.replace(/\/\*[\s\S]*?\*\//g, "");
  const objects = new Map<string, string>();
  for (const match of text.matchAll(/^\s*([A-Fa-f0-9]{24})\s*=\s*\{([\s\S]*?)^\s*\};/gm)) {
    // TargetAttributes reuses target IDs for metadata dictionaries. Those
    // are not project objects and must not replace the PBXNativeTarget.
    if (/^\s*isa\s*=\s*PBX/m.test(match[2]!)) objects.set(match[1]!, match[2]!);
  }
  const value = (body: string, key: string): string | undefined => {
    const raw = new RegExp(`(?:^|[;\\n])\\s*${key}\\s*=\\s*([^;]+);`).exec(body)?.[1]?.trim();
    return raw?.replace(/^"([^"\\]*)"$/, "$1");
  };
  for (const body of objects.values()) {
    if (
      value(body, "isa") !== "PBXNativeTarget" ||
      value(body, "name") !== "App" ||
      value(body, "productType") !== "com.apple.product-type.application"
    )
      continue;
    const members = /fileSystemSynchronizedGroups\s*=\s*\(([^)]*)\)/.exec(body)?.[1] ?? "";
    for (const id of members.match(/[A-Fa-f0-9]{24}/g) ?? []) {
      const group = objects.get(id);
      if (
        !group ||
        value(group, "isa") !== "PBXFileSystemSynchronizedRootGroup" ||
        value(group, "sourceTree") !== "SOURCE_ROOT"
      )
        continue;
      if (/\b(?:exceptions|explicitFileTypes|explicitFolders)\s*=/.test(group)) continue;
      const path = value(group, "path");
      if (!path || /["\\$]/.test(path) || posix.isAbsolute(path)) continue;
      const root = posix.normalize(posix.join("ios/App", path));
      if (
        sourcePath === posix.normalize(sourcePath) &&
        sourcePath.startsWith(`${root}/`) &&
        sourcePath.endsWith(".swift")
      )
        return true;
    }
  }
  return false;
}

export function isNativeDeviceTest(path: string, platform: "ios" | "android"): boolean {
  const root = platform === "ios" ? "ios/App/NativeE2ETests/" : "android/app/src/androidTest/";
  return (
    path === posix.normalize(path) &&
    path.startsWith(root) &&
    path.endsWith(platform === "ios" ? ".swift" : ".kt")
  );
}
