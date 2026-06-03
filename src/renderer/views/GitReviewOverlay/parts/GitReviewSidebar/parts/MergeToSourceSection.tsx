import { ChevronDown, GitMerge } from "lucide-react";
import { Button, ButtonGroup, Dropdown, Label } from "@heroui/react";
import { PixelLoader } from "@/renderer/components/common";
import { GitReviewSection } from "./GitReviewSection";

export function MergeToSourceSection(props: {
  sourceBranchLoading: boolean;
  sourceBranch: string | null;
  worktreeBranch: string | undefined;
  commitsAhead: number;
  isMerging: boolean;
  handleMergeAndRemove: () => Promise<void>;
  handleMergeOnly: () => Promise<void>;
}) {
  const {
    sourceBranchLoading,
    sourceBranch,
    worktreeBranch,
    commitsAhead,
    isMerging,
    handleMergeAndRemove,
    handleMergeOnly,
  } = props;

  return (
    <GitReviewSection>
      {sourceBranchLoading ? (
        <div className="flex min-h-[3.5rem] items-center justify-center">
          <PixelLoader size="xs" />
        </div>
      ) : sourceBranch ? (
        <>
          <ButtonGroup className="w-full">
            <Button
              variant="tertiary"
              className="flex-1"
              isDisabled={isMerging}
              isPending={isMerging}
              onPress={() => void handleMergeAndRemove()}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <PixelLoader size="xs" /> : <GitMerge className="size-3.5" />}
                  Merge & Remove Worktree
                </>
              )}
            </Button>
            <Dropdown>
              <Button
                isIconOnly
                variant="tertiary"
                aria-label="More merge options"
                isDisabled={isMerging}
              >
                <ButtonGroup.Separator />
                <ChevronDown className="size-3.5" />
              </Button>
              <Dropdown.Popover placement="top end">
                <Dropdown.Menu
                  aria-label="Merge options"
                  onAction={(key) => {
                    if (key === "merge-only") void handleMergeOnly();
                  }}
                >
                  <Dropdown.Item id="merge-only" textValue="Merge Worktree">
                    <GitMerge className="size-3.5" />
                    <Label>Merge Worktree</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </ButtonGroup>
          <p className="h-4 truncate px-1 text-center text-xs leading-4 text-muted/60">
            {worktreeBranch} → {sourceBranch} · {commitsAhead} ahead
          </p>
        </>
      ) : (
        <p className="px-2 py-1 text-center text-xs text-muted/60">
          Source branch unknown — merge manually
        </p>
      )}
    </GitReviewSection>
  );
}
