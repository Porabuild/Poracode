import {
  isGitHubRepositorySource,
  isValidSkillName,
  type MarketplaceSkill,
} from "@/shared/contracts";

const MARKETPLACE_ITEM_PATTERN =
  /\{\\"source\\":\\"([^"\\]+)\\",\\"skillId\\":\\"([^"\\]+)\\",\\"name\\":\\"([^"\\]+)\\",\\"installs\\":(\d+),\\"weeklyInstalls\\":\[([0-9,]*)\](,\\"isOfficial\\":true)?\}/gu;

export function parseSkillMarketplace(html: string): MarketplaceSkill[] {
  const seen = new Set<string>();
  const skills: MarketplaceSkill[] = [];
  for (const match of html.matchAll(MARKETPLACE_ITEM_PATTERN)) {
    const source = match[1]!;
    const skillId = match[2]!;
    const id = `${source}/${skillId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    skills.push({
      id,
      marketplace: "skills-sh",
      source,
      skillId,
      name: match[3]!,
      installs: Number.parseInt(match[4]!, 10),
      weeklyInstalls: match[5]
        ? match[5].split(",").map((value) => Number.parseInt(value, 10))
        : [],
      official: match[6] !== undefined,
      rank: skills.length + 1,
    });
  }
  return skills;
}

export function parseSkillsDirectoryMarketplace(input: unknown): {
  skills: MarketplaceSkill[];
  total: number;
} {
  if (!input || typeof input !== "object") {
    throw new Error("Skills Directory returned invalid data.");
  }
  const rawSkills = (input as { skills?: unknown }).skills;
  if (!rawSkills) throw new Error("Skills Directory returned invalid data.");
  if (!Array.isArray(rawSkills)) throw new Error("Skills Directory returned invalid data.");
  const skills = rawSkills.flatMap((raw, index): MarketplaceSkill[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (
      typeof item.slug !== "string" ||
      typeof item.name !== "string" ||
      typeof item.repository !== "string" ||
      !isGitHubRepositorySource(item.repository)
    ) {
      return [];
    }
    const source = item.repository;
    const owner = source.slice(0, source.indexOf("/")).toLowerCase();
    const skillId = item.slug.toLowerCase().startsWith(`${owner}-`)
      ? item.slug.slice(owner.length + 1)
      : item.slug;
    if (!isValidSkillName(skillId)) return [];
    const stars = typeof item.stars === "number" ? item.stars : undefined;
    const votes = typeof item.votes === "number" ? item.votes : undefined;
    return [
      {
        id: item.slug,
        marketplace: "skills-directory",
        name: item.name,
        ...(typeof item.description === "string" ? { description: item.description } : {}),
        source,
        sourceUrl: `https://github.com/${source}`,
        skillId,
        ...(stars !== undefined ? { stars } : {}),
        ...(votes !== undefined ? { votes } : {}),
        official: item.verified === true,
        rank: index + 1,
      },
    ];
  });
  const pagination = (input as { pagination?: unknown }).pagination;
  const total =
    pagination &&
    typeof pagination === "object" &&
    typeof (pagination as { total?: unknown }).total === "number"
      ? (pagination as { total: number }).total
      : skills.length;
  return { skills, total };
}
