import type { ProjectLocation } from "./contracts";

export function normalizeShellScriptLines(script: string): string[] {
  return script
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** Run the saved command chain in its PTY and exit with its status. */
export function buildProjectActionCommand(script: string, kind: ProjectLocation["kind"]): string {
  const lines = normalizeShellScriptLines(script);
  if (lines.length === 0) return "";
  if (kind !== "windows") {
    const body = lines.join(" && ").replaceAll("'", "'\\''");
    return `exec bash -c '${body}'`;
  }
  const guarded = lines.reduceRight(
    (tail, line) => `${line}; if ($?) { ${tail} }`,
    "$poracodeActionSucceeded = $true",
  );
  return [
    "$poracodeActionSucceeded = $false",
    "$global:LASTEXITCODE = 0",
    `try { ${guarded} } catch { $_ | Out-String | Write-Host -NoNewline } finally { if ($poracodeActionSucceeded) { exit 0 }; if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 1 }`,
  ].join("; ");
}
