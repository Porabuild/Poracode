import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { buildRemoteV3GeneratedFiles } from "./generate";
import { compareUnicodeCodePoints } from "./unicodeOrder";

export function generatedDirectory(repositoryRoot: string): string {
  return join(repositoryRoot, "protocol/remote/v3/generated");
}

export function writeRemoteV3Generated(repositoryRoot: string): Record<string, string> {
  const files = buildRemoteV3GeneratedFiles();
  const directory = generatedDirectory(repositoryRoot);
  const parent = dirname(directory);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, ".generated-stage-"));
  const backup = `${staging}-previous`;
  for (const [name, contents] of Object.entries(files)) {
    const target = join(staging, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, "utf8");
  }
  let movedExisting = false;
  try {
    if (existsSync(directory)) {
      renameSync(directory, backup);
      movedExisting = true;
    }
    renameSync(staging, directory);
    if (movedExisting) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!existsSync(directory) && movedExisting && existsSync(backup))
      renameSync(backup, directory);
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return files;
}

function generatedFilesOnDisk(directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(relative(directory, absolute));
    }
  };
  visit(directory);
  return files.sort(compareUnicodeCodePoints);
}

export function checkRemoteV3Generated(repositoryRoot: string): string[] {
  const expected = buildRemoteV3GeneratedFiles();
  const directory = generatedDirectory(repositoryRoot);
  const errors: string[] = [];
  let onDisk: string[] = [];
  try {
    onDisk = generatedFilesOnDisk(directory);
  } catch {
    errors.push(`missing generated directory ${directory}`);
    return errors;
  }

  const expectedNames = new Set(Object.keys(expected));
  for (const name of onDisk) {
    if (!expectedNames.has(name)) {
      errors.push(`extra generated file: ${name}`);
    }
  }
  for (const name of Object.keys(expected).sort(compareUnicodeCodePoints)) {
    if (!onDisk.includes(name)) {
      errors.push(`missing generated file: ${name}`);
      continue;
    }
    const actual = readFileSync(join(directory, name), "utf8");
    if (actual !== expected[name]) {
      errors.push(`stale generated file: ${name}`);
    }
  }
  return errors;
}
