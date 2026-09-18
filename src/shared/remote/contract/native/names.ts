import { createHash } from "node:crypto";
import { compareUnicodeCodePoints } from "../unicodeOrder";

const SWIFT_KEYWORDS = new Set([
  "Type",
  "Protocol",
  "Self",
  "Any",
  "Class",
  "Struct",
  "Enum",
  "Extension",
  "Import",
  "Default",
  "Repeat",
]);

const KOTLIN_KEYWORDS = new Set([
  "As",
  "Break",
  "Class",
  "Continue",
  "Do",
  "Else",
  "False",
  "For",
  "Fun",
  "If",
  "In",
  "Interface",
  "Is",
  "Null",
  "Object",
  "Package",
  "Return",
  "Super",
  "This",
  "Throw",
  "True",
  "Try",
  "Typealias",
  "Val",
  "Var",
  "When",
  "While",
]);

function asciiWord(codePoint: string): string {
  return /^[A-Za-z0-9]$/.test(codePoint)
    ? codePoint
    : `U${codePoint.codePointAt(0)!.toString(16).toUpperCase()}`;
}

/** Convert wire names to portable identifiers by iterating Unicode code points, never UTF-16 units. */
export function portablePascalName(value: string): string {
  const words: string[] = [];
  let current = "";
  for (const character of value) {
    if (/^[A-Za-z0-9]$/.test(character)) {
      current += character;
    } else {
      if (current) words.push(current);
      current = asciiWord(character);
      words.push(current);
      current = "";
    }
  }
  if (current) words.push(current);
  const joined = words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join("");
  const safe = joined || "Anonymous";
  return /^[0-9]/.test(safe) ? `N${safe}` : safe;
}

export function stableTypeName(preferred: string, structuralHash: string): string {
  return `${portablePascalName(preferred)}_${structuralHash.slice(0, 10)}`;
}

export function stableMemberName(raw: string, language: "swift" | "kotlin"): string {
  const pascal = portablePascalName(raw);
  let name = `${pascal.slice(0, 1).toLowerCase()}${pascal.slice(1)}`;
  if (!name) name = "value";
  const keyword = language === "swift" ? SWIFT_KEYWORDS : KOTLIN_KEYWORDS;
  if (keyword.has(pascal)) name = `${name}Value`;
  return name;
}

export function collisionSuffix(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export function sortedCodePoint(values: readonly string[]): string[] {
  return [...values].sort(compareUnicodeCodePoints);
}
