import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillEntry, SkillScanResult } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { SkillImportModal } from "./SkillImportModal";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    importSkills: vi.fn<() => Promise<{ imported: string[] }>>().mockResolvedValue({
      imported: ["C:\\Users\\me\\.agents\\skills\\review"],
    }),
  },
}));

const { useSkillsMock } = vi.hoisted(() => ({
  useSkillsMock: vi.fn<() => unknown>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isDevApp: () => false,
}));
vi.mock("./useSkills", () => ({ useSkills: useSkillsMock }));

function skill(overrides: Partial<SkillEntry> = {}): SkillEntry {
  return {
    id: "global:claude:review:on",
    name: "review",
    description: "Review changes",
    folderName: "review",
    absolutePath: "C:\\Users\\me\\.claude\\skills\\review",
    skillFilePath: "C:\\Users\\me\\.claude\\skills\\review\\SKILL.md",
    rootPath: "C:\\Users\\me\\.claude\\skills",
    providerId: "claude",
    providerLabel: "Claude Code",
    scope: "global",
    scopeLabel: "Global",
    origin: "external",
    enabled: true,
    mutable: true,
    valid: true,
    linked: false,
    importState: "available",
    ...overrides,
  };
}

function scan(skills: SkillEntry[]): SkillScanResult {
  return {
    skills,
    effectiveSkillIds: [],
    invocation: null,
    issues: [],
    canLinkToGlobal: true,
  };
}

function renderModal(skills: SkillEntry[]) {
  useSkillsMock.mockReturnValue({ scan: scan(skills), loading: false, error: undefined });
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onImported = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  render(
    <AppProvider>
      <SkillImportModal
        isOpen
        onOpenChange={onOpenChange}
        scan={scan(skills)}
        projects={[]}
        wslDistros={[]}
        sourceTarget={{ id: "user", scope: "global" }}
        defaultDestinationId="user"
        onImported={onImported}
      />
    </AppProvider>,
  );
  return { onOpenChange, onImported };
}

describe("SkillImportModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects and imports an external skill", async () => {
    const { onOpenChange, onImported } = renderModal([skill()]);
    expect(screen.getByRole("button", { name: "Import destination" })).toHaveClass(
      "button--ghost",
      "select__trigger",
    );
    fireEvent.click(screen.getByRole("button", { name: "Show skills from Claude Code" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select review from Claude Code" }));
    fireEvent.click(screen.getByRole("button", { name: "Import selected" }));

    await waitFor(() =>
      expect(bridge.importSkills).toHaveBeenCalledWith({
        skills: [
          {
            sourcePath: "C:\\Users\\me\\.claude\\skills\\review",
            destinationScope: "global",
            availability: "shared",
            mode: "copy",
            replace: false,
          },
        ],
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onImported).toHaveBeenCalled();
  });

  it("imports a skill into the Poracode-only root", async () => {
    renderModal([skill()]);
    fireEvent.click(screen.getByLabelText("Skill availability"));
    fireEvent.click(await screen.findByRole("option", { name: "Poracode only" }));
    fireEvent.click(screen.getByRole("button", { name: "Show skills from Claude Code" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select review from Claude Code" }));
    fireEvent.click(screen.getByRole("button", { name: "Import selected" }));

    await waitFor(() =>
      expect(bridge.importSkills).toHaveBeenCalledWith({
        skills: [
          {
            sourcePath: "C:\\Users\\me\\.claude\\skills\\review",
            destinationScope: "global",
            availability: "poracode",
            mode: "copy",
            replace: false,
          },
        ],
      }),
    );
  });

  it("requires explicit replacement consent for a conflict", () => {
    renderModal([
      skill({ importState: "conflict" }),
      skill({
        id: "global:agents:review:on",
        absolutePath: "C:\\Users\\me\\.agents\\skills\\review",
        rootPath: "C:\\Users\\me\\.agents\\skills",
        providerId: "agents",
        providerLabel: "Shared agents",
        origin: "managed",
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Show skills from Claude Code" }));

    expect(
      screen.getByRole("checkbox", { name: "review: Conflicts with a managed skill" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Allow replacing conflicting managed skills" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "review: Conflicts with a managed skill" }),
    ).toBeEnabled();
  });
});
