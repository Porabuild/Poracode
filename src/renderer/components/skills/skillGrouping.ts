import type { SkillEntry } from "@/shared/contracts";

export function groupSkills(
  skills: readonly SkillEntry[],
  keyFor: (skill: SkillEntry) => string,
): Map<string, SkillEntry[]> {
  const groups = new Map<string, SkillEntry[]>();
  for (const skill of skills) {
    const key = keyFor(skill);
    const existing = groups.get(key);
    if (existing) {
      existing.push(skill);
    } else {
      groups.set(key, [skill]);
    }
  }
  return groups;
}
