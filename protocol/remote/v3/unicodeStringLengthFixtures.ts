import { readFileSync } from "node:fs";

/** Shared Node/generated Swift/generated Kotlin code-point boundary recipes. */
export const unicodeStringLengthGroups = JSON.parse(
  readFileSync(new URL("./fixtures/unicode-string-length.json", import.meta.url), "utf8"),
) as {
  id: string;
  minLength: number;
  maxLength: number;
  cases: { unit: string; repeat: number; suffix?: string; valid: boolean }[];
}[];

export const unicodeStringLengthCases = unicodeStringLengthGroups.map((group) => ({
  ...group,
  cases: group.cases.map((item) => ({
    value: item.unit.repeat(item.repeat) + (item.suffix ?? ""),
    valid: item.valid,
  })),
}));
