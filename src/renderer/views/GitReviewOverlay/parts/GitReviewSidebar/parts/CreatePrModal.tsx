import { ChevronDown, GitPullRequest, Sparkles } from "lucide-react";
import { Button, ButtonGroup, Dropdown, Label, Modal, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { GitBranchInfo } from "@/shared/contracts";
import { PixelLoader, TextArea } from "@/renderer/components/common";

export function CreatePrModal(props: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  effectiveBranch: string | undefined;
  defaultTargetBranch: string | null;
  prTitle: string;
  setPrTitle: (title: string) => void;
  prBody: string;
  setPrBody: (body: string) => void;
  prTargetBranch: string | null;
  setPrTargetBranch: (branch: string | null) => void;
  prLoading: boolean;
  isGeneratingPr: boolean;
  canGenerateMessage: boolean;
  branchList: readonly GitBranchInfo[];
  handleCreatePr: (isDraft: boolean) => Promise<void>;
  handleGeneratePrSummary: () => Promise<void>;
}) {
  const {
    isOpen,
    onOpenChange,
    effectiveBranch,
    defaultTargetBranch,
    prTitle,
    setPrTitle,
    prBody,
    setPrBody,
    prTargetBranch,
    setPrTargetBranch,
    prLoading,
    isGeneratingPr,
    canGenerateMessage,
    branchList,
    handleCreatePr,
    handleGeneratePrSummary,
  } = props;
  const { t } = useLingui();
  const targetBranches = Array.from(
    new Set([
      ...(defaultTargetBranch && defaultTargetBranch !== effectiveBranch
        ? [defaultTargetBranch]
        : []),
      ...branchList
        .filter((branch) => !branch.isRemote && branch.name !== effectiveBranch)
        .map((branch) => branch.name),
    ]),
  );

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[600px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Create PR</Trans>
            </Modal.Heading>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
              <span className="truncate">{effectiveBranch}</span>
              <span className="shrink-0">→</span>
              <Dropdown>
                <Button variant="tertiary" className="h-5 min-w-0 px-1.5 text-xs">
                  {prTargetBranch || defaultTargetBranch || "..."}
                  <ChevronDown className="size-3 text-muted/60" />
                </Button>
                <Dropdown.Popover placement="bottom start" className="max-h-60">
                  <Dropdown.Menu
                    aria-label={t`Target branch`}
                    selectionMode="single"
                    selectedKeys={new Set([prTargetBranch || defaultTargetBranch || ""])}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0] as string;
                      setPrTargetBranch(key === defaultTargetBranch ? null : key);
                    }}
                  >
                    {targetBranches.map((branch) => (
                      <Dropdown.Item key={branch} id={branch} textValue={branch}>
                        <Label>{branch}</Label>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </div>
          </Modal.Header>
          <Modal.Body className="p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <TextArea
                  fullWidth
                  autoSize
                  placeholder={t`PR title (leave empty to auto-generate)`}
                  rows={1}
                  maxRows={3}
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void handleCreatePr(false).then(() => onOpenChange(false));
                    }
                  }}
                />
                <Tooltip delay={0}>
                  <Button
                    isIconOnly
                    variant="tertiary"
                    aria-label={t`Generate PR summary`}
                    isDisabled={isGeneratingPr || !canGenerateMessage}
                    isPending={isGeneratingPr}
                    onPress={() => void handleGeneratePrSummary()}
                    className="mt-0.5 shrink-0"
                  >
                    {isGeneratingPr ? <PixelLoader size="xs" /> : <Sparkles className="size-3.5" />}
                  </Button>
                  <Tooltip.Content>
                    <Trans>Generate with AI</Trans>
                  </Tooltip.Content>
                </Tooltip>
              </div>
              <TextArea
                fullWidth
                placeholder={t`Description (optional)`}
                rows={8}
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
              />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" className="text-muted">
              <Trans>Cancel</Trans>
            </Button>
            <ButtonGroup>
              <Button
                variant="tertiary"
                isDisabled={prLoading || isGeneratingPr}
                isPending={prLoading}
                onPress={() => void handleCreatePr(false).then(() => onOpenChange(false))}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <PixelLoader size="xs" />
                    ) : (
                      <GitPullRequest className="size-3.5" />
                    )}
                    <Trans>Create PR</Trans>
                  </>
                )}
              </Button>
              <Dropdown>
                <Button
                  isIconOnly
                  variant="tertiary"
                  aria-label={t`More PR options`}
                  isDisabled={prLoading || isGeneratingPr}
                >
                  <ButtonGroup.Separator />
                  <ChevronDown className="size-3.5" />
                </Button>
                <Dropdown.Popover placement="top end">
                  <Dropdown.Menu
                    aria-label={t`PR options`}
                    onAction={(key) => {
                      if (key === "draft") {
                        void handleCreatePr(true).then(() => onOpenChange(false));
                      }
                    }}
                  >
                    <Dropdown.Item id="draft" textValue={t`Create Draft PR`}>
                      <GitPullRequest className="size-3.5 opacity-60" />
                      <Label>
                        <Trans>Create Draft PR</Trans>
                      </Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </ButtonGroup>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
