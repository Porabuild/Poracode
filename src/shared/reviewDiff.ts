/** Decode Git's C-quoted UTF-8 paths without requiring Node in browser clients. */
export function unquoteGitPath(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const body = raw.slice(1, -1);
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let index = 0; index < body.length;) {
    if (body[index] === "\\") {
      const octal = /^[0-7]{1,3}/.exec(body.slice(index + 1));
      if (octal) {
        bytes.push(parseInt(octal[0], 8) & 255);
        index += octal[0].length + 1;
        continue;
      }
      const next = body[index + 1];
      const escaped: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
      if (next !== undefined) {
        bytes.push(...encoder.encode(escaped[next] ?? next));
        index += 2;
        continue;
      }
    }
    const character = String.fromCodePoint(body.codePointAt(index)!);
    bytes.push(...encoder.encode(character));
    index += character.length;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Full patches, including deleted and binary files, keyed by the changed path. */
export function splitUnifiedDiff(raw: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw.trim()) return result;
  const blocks = raw.split(/(?=^diff --git )/m);
  for (const [blockIndex, fullBlock] of blocks.entries()) {
    const block = blockIndex < blocks.length - 1 ? fullBlock.replace(/\n$/, "") : fullBlock;
    const lines = block.split("\n");
    if (!lines[0]?.startsWith("diff --git ")) continue;
    const newHeader = lines.find((line) => line.startsWith("+++ "));
    const oldHeader = lines.find((line) => line.startsWith("--- "));
    // Git appends a tab to these headers when the path contains a space.
    const newPath = newHeader
      ? unquoteGitPath(newHeader.slice(4).replace(/\t$/, "")).replace(/^b\//, "")
      : undefined;
    const oldPath = oldHeader
      ? unquoteGitPath(oldHeader.slice(4).replace(/\t$/, "")).replace(/^a\//, "")
      : undefined;
    let path = newPath === "/dev/null" ? oldPath : newPath;
    if (!path) {
      const renamed = lines.find((line) => line.startsWith("rename to "))?.slice(10);
      if (renamed !== undefined) path = unquoteGitPath(renamed);
    }
    if (!path) {
      const header = lines[0].slice("diff --git ".length);
      if (header.startsWith('"')) {
        const quoted = /^"(?:\\.|[^"\\])*" /.exec(header);
        if (quoted) path = unquoteGitPath(header.slice(quoted[0].length)).replace(/^b\//, "");
      } else {
        // Binary paths containing spaces are unquoted; both sides name the same file.
        for (
          let index = header.indexOf(" b/");
          index >= 0;
          index = header.indexOf(" b/", index + 1)
        ) {
          if (header.slice(0, index).replace(/^a\//, "") === header.slice(index + 3)) {
            path = header.slice(index + 3);
            break;
          }
        }
      }
    }
    if (path && path !== "/dev/null") result.set(path, block);
  }
  return result;
}

/** Kept byte-for-byte compatible with the version-two device-local viewed marks. */
export function viewedFingerprint(
  patch: string | undefined,
  file: { additions: number; deletions: number },
): string {
  if (patch === undefined) return `pending:${file.additions}:${file.deletions}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < patch.length; index += 1) {
    hash ^= patch.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ready:${file.additions}:${file.deletions}:${patch.length}:${hash >>> 0}`;
}
