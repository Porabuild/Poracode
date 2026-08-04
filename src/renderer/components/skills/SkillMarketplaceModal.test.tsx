import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InstallMarketplaceSkillPayload,
  InstallMarketplaceSkillResult,
  ListSkillMarketplacePayload,
  SkillMarketplaceResult,
  SkillScanResult,
} from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { SkillMarketplaceModal } from "./SkillMarketplaceModal";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    listSkillMarketplace:
      vi.fn<(payload: ListSkillMarketplacePayload) => Promise<SkillMarketplaceResult>>(),
    installMarketplaceSkill:
      vi.fn<(payload: InstallMarketplaceSkillPayload) => Promise<InstallMarketplaceSkillResult>>(),
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isDevApp: () => false,
}));

const emptyScan: SkillScanResult = {
  skills: [],
  effectiveSkillIds: [],
  invocation: null,
  issues: [],
  canLinkToGlobal: true,
};

describe("SkillMarketplaceModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.listSkillMarketplace.mockResolvedValue({
      marketplace: "skills-sh",
      skills: [
        {
          id: "vercel-labs/skills/find-skills",
          marketplace: "skills-sh",
          name: "find-skills",
          source: "vercel-labs/skills",
          skillId: "find-skills",
          installs: 24531,
          weeklyInstalls: [100, 200],
          official: true,
          rank: 1,
        },
        {
          id: "example/community/review-code",
          marketplace: "skills-sh",
          name: "review-code",
          source: "example/community",
          skillId: "review-code",
          installs: 120,
          weeklyInstalls: [5, 9],
          official: false,
          rank: 2,
        },
      ],
      total: 2,
    });
    bridge.installMarketplaceSkill.mockResolvedValue({
      installed: "C:\\Users\\me\\.agents\\skills\\find-skills",
    });
  });

  it("shows marketplace metrics, filters, and installs into the selected target", async () => {
    const onInstalled = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    render(
      <AppProvider>
        <SkillMarketplaceModal
          isOpen
          onOpenChange={() => undefined}
          target={{ id: "wsl:Ubuntu", scope: "global", wslDistro: "Ubuntu" }}
          targetLabel="Ubuntu"
          scan={emptyScan}
          onInstalled={onInstalled}
        />
      </AppProvider>,
    );

    expect(await screen.findByText("find-skills")).toBeInTheDocument();
    expect(bridge.listSkillMarketplace).toHaveBeenCalledWith({
      marketplace: "skills-sh",
      sort: "rank",
    });
    fireEvent.click(screen.getByLabelText("Skill marketplace source"));
    expect(await screen.findByRole("option", { name: "Skills Directory" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "MCP Market" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Skills.sh" }));
    expect(screen.getByText("review-code")).toBeInTheDocument();
    expect(screen.getByText("Official")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search marketplace skills" }), {
      target: { value: "find" },
    });
    expect(screen.queryByText("review-code")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Skill availability"));
    fireEvent.click(await screen.findByRole("option", { name: "Poracode only" }));

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() =>
      expect(bridge.installMarketplaceSkill).toHaveBeenCalledWith({
        marketplace: "skills-sh",
        marketplaceSkillId: "vercel-labs/skills/find-skills",
        destinationScope: "global",
        availability: "poracode",
        replace: false,
        wslDistro: "Ubuntu",
      }),
    );
    expect(onInstalled).toHaveBeenCalledOnce();
  });

  it("searches the Skills Directory public registry", async () => {
    bridge.listSkillMarketplace.mockImplementation(async ({ marketplace, query }) => {
      if (marketplace === "skills-directory" && query) {
        return new Promise<SkillMarketplaceResult>(() => undefined);
      }
      return {
        marketplace,
        skills:
          marketplace === "skills-directory"
            ? [
                {
                  id: "example-secure-review",
                  marketplace,
                  name: "Secure review",
                  source: "example/skills",
                  skillId: "secure-review",
                  stars: 120,
                  official: true,
                  rank: 1,
                },
                {
                  id: "example-another-review",
                  marketplace,
                  name: "Another review",
                  source: "example/skills",
                  skillId: "another-review",
                  stars: 120,
                  official: false,
                  rank: 2,
                },
              ]
            : [],
        total: marketplace === "skills-directory" ? 96_920 : 0,
      };
    });
    render(
      <AppProvider>
        <SkillMarketplaceModal
          isOpen
          onOpenChange={() => undefined}
          target={{ id: "windows:global", scope: "global" }}
          targetLabel="Global (Windows)"
          scan={emptyScan}
          onInstalled={async () => undefined}
        />
      </AppProvider>,
    );

    await screen.findByText("No marketplace skills match these filters.");
    fireEvent.click(screen.getByLabelText("Skill marketplace source"));
    fireEvent.click(await screen.findByRole("option", { name: "Skills Directory" }));
    expect(await screen.findByText("Secure review")).toBeInTheDocument();
    const githubStarsLabel = screen.getByText("GitHub stars");
    expect(githubStarsLabel.previousElementSibling).toHaveTextContent("120");
    fireEvent.change(screen.getByRole("textbox", { name: "Search marketplace skills" }), {
      target: { value: "review" },
    });
    await waitFor(() =>
      expect(bridge.listSkillMarketplace).toHaveBeenCalledWith({
        marketplace: "skills-directory",
        query: "review",
        sort: "rank",
      }),
    );
    expect(screen.getByText("Secure review")).toBeInTheDocument();
  });
});
