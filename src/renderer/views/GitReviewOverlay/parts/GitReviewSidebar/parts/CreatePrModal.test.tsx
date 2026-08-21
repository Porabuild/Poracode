import type { ReactNode } from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitActionPhase } from "@/renderer/state/gitReviewActionStore";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import type { GitBranchInfo } from "@/shared/contracts";
import { CreatePrModal } from "./CreatePrModal";

vi.mock("@heroui/react", () => {
  function Button(props: {
    children?: ReactNode | ((state: { isPending: boolean }) => ReactNode);
    "aria-label"?: string;
    isDisabled?: boolean;
    isPending?: boolean;
    onPress?: () => void;
  }) {
    return (
      <button
        type="button"
        aria-label={props["aria-label"]}
        disabled={props.isDisabled}
        onClick={props.onPress}
      >
        {typeof props.children === "function"
          ? props.children({ isPending: props.isPending ?? false })
          : props.children}
      </button>
    );
  }

  const ButtonGroup = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  ButtonGroup.Separator = () => <span />;

  const Dropdown = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Popover = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Menu = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  Dropdown.Item = (props: { children?: ReactNode }) => <div>{props.children}</div>;

  const Modal = {
    Backdrop: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Container: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Dialog: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Header: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Body: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Footer: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Heading: (props: { children?: ReactNode }) => <h2>{props.children}</h2>,
    CloseTrigger: () => null,
  };

  const Tooltip = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  Tooltip.Content = (props: { children?: ReactNode }) => <div>{props.children}</div>;

  return {
    Button,
    ButtonGroup,
    Dropdown,
    Label: (props: { children?: ReactNode }) => <span>{props.children}</span>,
    Modal,
    Tooltip,
  };
});

vi.mock("@/renderer/components/common", () => ({
  PixelLoader: () => <span data-testid="pixel-loader" />,
  TextArea: (props: {
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }) => <textarea value={props.value} onChange={props.onChange} />,
}));

const branchList: readonly GitBranchInfo[] = [];

function renderModal(actionPhase: GitActionPhase | null): void {
  renderWithI18n(
    <CreatePrModal
      isOpen
      onOpenChange={vi.fn<(open: boolean) => void>()}
      effectiveBranch="feature/worktree"
      defaultTargetBranch="main"
      prTitle=""
      setPrTitle={vi.fn<(title: string) => void>()}
      prBody=""
      setPrBody={vi.fn<(body: string) => void>()}
      prTargetBranch={null}
      setPrTargetBranch={vi.fn<(branch: string | null) => void>()}
      prLoading={false}
      isGeneratingPr={false}
      actionPhase={actionPhase}
      canGenerateMessage
      branchList={branchList}
      handleCreatePr={vi.fn<() => Promise<void>>()}
      handleGeneratePrSummary={vi.fn<() => Promise<void>>()}
    />,
  );
}

describe("CreatePrModal operation status", () => {
  it("shows the active phase inside the modal", () => {
    renderModal("generating-pr-summary");

    expect(screen.getByRole("status")).toHaveTextContent("Generating PR summary…");
    expect(screen.getByTestId("pixel-loader")).toBeInTheDocument();
  });

  it("does not show an idle status row", () => {
    renderModal(null);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("disables PR controls while another phase owns the panel", () => {
    renderModal("committing");

    expect(screen.getByRole("button", { name: "Generate PR summary" })).toBeDisabled();
    expect(
      screen
        .getAllByRole("button", { name: "Create PR" })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});
