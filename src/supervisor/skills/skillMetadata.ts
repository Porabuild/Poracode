import { type SkillInvalidReason, isValidSkillName } from "@/shared/contracts";

/**
 * SKILL.md frontmatter parsing and validation. Pure text analysis: no
 * filesystem access, so both the scanner and the marketplace installer can
 * validate a skill folder's metadata before anything is written.
 */

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : trimmed;
    } catch {
      return trimmed.replace(/^"|"$/gu, "");
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/gu, "'");
  }
  return trimmed.replace(/\s+#.*$/u, "").trim();
}

export function parseSkillMetadata(
  content: string,
  folderName: string,
): {
  name: string;
  description: string;
  hasFrontmatter: boolean;
  hasName: boolean;
  hasDescription: boolean;
} {
  const normalized = content.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const match = /^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/u.exec(normalized);
  if (!match) {
    return {
      name: folderName,
      description: "",
      hasFrontmatter: false,
      hasName: false,
      hasDescription: false,
    };
  }
  let name = folderName;
  let description = "";
  let hasName = false;
  let hasDescription = false;
  const lines = match[1]?.split("\n") ?? [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const field = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u.exec(line);
    if (!field) continue;
    if (field[1] === "name") {
      hasName = true;
      name = parseScalar(field[2] ?? "");
    }
    if (field[1] !== "description") continue;
    hasDescription = true;
    const rawDescription = field[2] ?? "";
    if (!/^[>|][+-]?$/u.test(rawDescription.trim())) {
      description = parseScalar(rawDescription);
      continue;
    }
    const block: string[] = [];
    while (index + 1 < lines.length && /^(?:\s|$)/u.test(lines[index + 1]!)) {
      block.push(lines[++index]!.trim());
    }
    description = block.filter(Boolean).join(rawDescription.trim().startsWith("|") ? "\n" : " ");
  }
  return { name, description, hasFrontmatter: true, hasName, hasDescription };
}

export function validateSkillMetadata(
  metadata: ReturnType<typeof parseSkillMetadata>,
  folderName: string,
): SkillInvalidReason | undefined {
  if (!metadata.hasFrontmatter) return "missing-frontmatter";
  if (!metadata.hasName || !metadata.name) return "missing-name";
  if (metadata.name.length > 64 || !isValidSkillName(metadata.name)) return "invalid-name";
  if (metadata.name !== folderName) return "name-mismatch";
  if (!metadata.hasDescription || !metadata.description) return "missing-description";
  if (metadata.description.length > 1024) return "description-too-long";
  return undefined;
}
