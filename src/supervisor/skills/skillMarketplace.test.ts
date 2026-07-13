import { describe, expect, it } from "vitest";
import { parseSkillMarketplace, parseSkillsDirectoryMarketplace } from "./skillMarketplace";

describe("parseSkillMarketplace", () => {
  it("reads leaderboard metrics and removes duplicate entries", () => {
    const item =
      '{\\"source\\":\\"vercel-labs/skills\\",\\"skillId\\":\\"find-skills\\",\\"name\\":\\"find-skills\\",\\"installs\\":24531,\\"weeklyInstalls\\":[10,20,30],\\"isOfficial\\":true}';

    expect(parseSkillMarketplace(`${item}${item}`)).toEqual([
      {
        id: "vercel-labs/skills/find-skills",
        marketplace: "skills-sh",
        source: "vercel-labs/skills",
        skillId: "find-skills",
        name: "find-skills",
        installs: 24531,
        weeklyInstalls: [10, 20, 30],
        official: true,
        rank: 1,
      },
    ]);
  });

  it("reads installable Skills Directory entries", () => {
    expect(
      parseSkillsDirectoryMarketplace({
        skills: [
          {
            slug: "example-secure-review",
            name: "Secure review",
            description: "Review code securely",
            repository: "example/skills",
            stars: 120,
            votes: 14,
            verified: true,
          },
        ],
        pagination: { total: 12 },
      }),
    ).toEqual({
      skills: [
        {
          id: "example-secure-review",
          marketplace: "skills-directory",
          name: "Secure review",
          description: "Review code securely",
          source: "example/skills",
          sourceUrl: "https://github.com/example/skills",
          skillId: "secure-review",
          stars: 120,
          votes: 14,
          official: true,
          rank: 1,
        },
      ],
      total: 12,
    });
  });
});
