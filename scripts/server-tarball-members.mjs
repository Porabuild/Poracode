/**
 * Windows-portability checks for the files staged into the server tarball.
 *
 * One artifact is extracted on Windows hosts as well, where a member name that
 * is fine on POSIX cannot be created (`:` and `<>"|?*`), silently changes
 * (trailing dot/space), aliases a device (`CON`, `NUL`, `COM1`...), or collides
 * with a sibling that differs only by case. Failing at assembly time keeps an
 * unextractable artifact from ever being published.
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

// eslint-disable-next-line no-control-regex -- control characters are the point
const INVALID_CHARACTERS = /[<>:"|?*\u0000-\u001f]/u;
const RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;

function listMembers(root, directory = root) {
  const members = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    members.push(relative(root, path).split(/[\\/]/u).join("/"));
    if (entry.isDirectory()) members.push(...listMembers(root, path));
  }
  return members.sort();
}

/** Every staged member path, "/"-separated, relative to the stage root. */
export function listStagedMembers(root) {
  return listMembers(root);
}

/** Problems one member path would cause on Windows (empty when portable). */
export function windowsMemberProblems(member) {
  const problems = [];
  for (const segment of member.split("/")) {
    if (INVALID_CHARACTERS.test(segment)) {
      problems.push(`contains a character Windows forbids (${segment})`);
    }
    if (/[. ]$/u.test(segment)) problems.push(`ends with a dot or space (${segment})`);
    if (RESERVED_BASENAME.test(segment.split(".")[0] ?? "")) {
      problems.push(`uses a reserved device name (${segment})`);
    }
  }
  return problems;
}

/**
 * Reject a stage whose members cannot all be extracted on Windows. Throws one
 * error naming every offending member so a single run fixes them all.
 */
export function assertWindowsPortableMembers(root, members = listStagedMembers(root)) {
  const failures = [];
  const seen = new Map();
  for (const member of members) {
    for (const problem of windowsMemberProblems(member)) failures.push(`${member}: ${problem}`);
    const folded = member.toLowerCase();
    const previous = seen.get(folded);
    if (previous !== undefined && previous !== member) {
      failures.push(`${member}: differs from ${previous} only by case`);
    } else {
      seen.set(folded, member);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Refusing to pack members that are not Windows-portable:\n${failures.join("\n")}`,
    );
  }
  return members;
}

/** Longest member path (in characters), for the install-path-length preflight. */
export function longestMemberPath(members) {
  let longest = "";
  for (const member of members) if (member.length > longest.length) longest = member;
  return longest;
}
