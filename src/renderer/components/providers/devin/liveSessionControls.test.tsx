import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";

const bridgeMock = vi.hoisted(() => ({
  listThreadSessionActions:
    vi.fn<(payload: { threadId: string }) => Promise<{ actions: readonly { id: string }[] }>>(),
  invokeThreadSessionAction:
    vi.fn<
      (payload: {
        threadId: string;
        actionId: string;
        payload: Record<string, unknown>;
      }) => Promise<Record<string, unknown>>
    >(),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn<(message: string) => void>(),
  danger: vi.fn<(message: string) => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@heroui/react")>();
  return {
    ...actual,
    Button: (props: {
      children?: ReactNode;
      type?: string;
      "aria-label"?: string;
      "aria-expanded"?: boolean;
      isDisabled?: boolean;
      isPending?: boolean;
      onPress?: () => void;
    }) => (
      <button
        type={props.type === "submit" ? "submit" : "button"}
        aria-label={props["aria-label"]}
        aria-expanded={props["aria-expanded"]}
        data-pending={props.isPending || undefined}
        disabled={props.isDisabled}
        onClick={props.onPress}
      >
        {props.children}
      </button>
    ),
    Popover: Object.assign((props: { children?: ReactNode }) => <div>{props.children}</div>, {
      Trigger: (props: { children?: ReactNode }) => <>{props.children}</>,
      Content: (props: { children?: ReactNode }) => <>{props.children}</>,
      Dialog: (props: { children?: ReactNode }) => <>{props.children}</>,
    }),
    Modal: Object.assign((props: { children?: ReactNode }) => <>{props.children}</>, {
      Backdrop: (props: { children?: ReactNode; isOpen?: boolean }) =>
        props.isOpen ? <>{props.children}</> : null,
      Container: (props: { children?: ReactNode }) => <>{props.children}</>,
      Dialog: (props: { children?: ReactNode; "aria-label"?: string }) => (
        <div role="dialog" aria-label={props["aria-label"]}>
          {props.children}
        </div>
      ),
      CloseTrigger: () => null,
      Header: (props: { children?: ReactNode }) => <>{props.children}</>,
      Heading: (props: { children?: ReactNode }) => <h2>{props.children}</h2>,
      Body: (props: { children?: ReactNode }) => <>{props.children}</>,
    }),
    toast: toastMock,
  };
});

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    placeholder?: string;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
  PixelLoader: () => <span data-testid="pixel-loader" />,
}));

import { ProviderSessionControls } from "../providerSessionControls";
import { DevinSessionControls as SessionControls } from "./liveSessionControls";
import type { ProviderSessionControlProps } from "../providerSessionControls";

/** Exercise the provider state owner through its menu declaration, without mocking its actions. */
function DevinSessionControls(props: ProviderSessionControlProps) {
  return (
    <SessionControls {...props}>
      {(actions) =>
        actions.map((action) => (
          <button
            type="button"
            key={action.id}
            aria-label={action.label}
            disabled={action.isDisabled}
            onClick={action.onAction}
          >
            {action.label}
            {action.detail ? <span>{action.detail}</span> : null}
          </button>
        ))
      }
    </SessionControls>
  );
}
import {
  DEVIN_NATIVE_PERSONAS_ACTION_ID,
  DEVIN_SESSION_ACTION_IDS,
  DEVIN_SESSION_CONFIG_ACTION_IDS,
} from "./sessionActionIds";

function thread(overrides: Partial<Thread> = {}): Thread {
  return { id: "thread-1", status: "idle", agentKind: "devin", ...overrides } as Thread;
}

function catalog(...ids: string[]) {
  bridgeMock.listThreadSessionActions.mockResolvedValue({
    actions: ids.map((id) => ({ id })),
  });
}

/** Deferred invoke reply the test resolves explicitly. */
function holdInvoke() {
  let resolveInvoke: (value: Record<string, unknown>) => void = () => {};
  bridgeMock.invokeThreadSessionAction.mockReturnValue(
    new Promise<Record<string, unknown>>((resolve) => {
      resolveInvoke = resolve;
    }),
  );
  return resolveInvoke;
}

beforeEach(() => {
  bridgeMock.listThreadSessionActions.mockReset().mockResolvedValue({ actions: [] });
  bridgeMock.invokeThreadSessionAction.mockReset().mockResolvedValue({});
  toastMock.success.mockReset();
  toastMock.danger.mockReset();
  useComposerInputInbox.setState({ itemsByComposer: {} });
});

describe("DevinSessionControls visibility", () => {
  it("renders nothing when the session declares no known actions", async () => {
    const { container } = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    await waitFor(() => expect(bridgeMock.listThreadSessionActions).toHaveBeenCalled());
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("hides without error only for the typed old-host answers", async () => {
    bridgeMock.listThreadSessionActions.mockRejectedValue(
      new RemoteClientError(
        'Procedure "listThreadSessionActions" is not available to remote clients.',
        403,
        "git_procedure_not_allowed",
      ),
    );
    const { container } = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(toastMock.danger).not.toHaveBeenCalled();
    expect(bridgeMock.invokeThreadSessionAction).not.toHaveBeenCalled();

    // The host-served shim predating the verb throws a TypeError naming it.
    bridgeMock.listThreadSessionActions.mockRejectedValue(
      new TypeError("readBridge(...).listThreadSessionActions is not a function"),
    );
    const shim = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    await waitFor(() => expect(shim.container.firstChild).toBeNull());
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it("surfaces an unexpected inventory failure instead of hiding the controls", async () => {
    bridgeMock.listThreadSessionActions.mockRejectedValue(new Error("socket hang up"));
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    expect(await screen.findByText("socket hang up")).toBeDefined();
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it("recovers through the retry press after a failed inventory", async () => {
    bridgeMock.listThreadSessionActions.mockRejectedValueOnce(new Error("socket hang up"));
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    await screen.findByText("socket hang up");
    fireEvent.click(screen.getByRole("button", { name: "Retry session controls" }));
    expect(await screen.findByRole("button", { name: "Revise command" })).toBeDefined();
  });

  it("surfaces a malformed inventory with retry instead of an unhandled rejection", async () => {
    bridgeMock.listThreadSessionActions.mockResolvedValue({
      actions: null,
    } as unknown as { actions: readonly { id: string }[] });
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    expect(await screen.findByRole("button", { name: "Retry session controls" })).toBeDefined();
    expect(
      screen.getByText("The session action failed. Try again or reopen the session."),
    ).toBeDefined();
    expect(bridgeMock.invokeThreadSessionAction).not.toHaveBeenCalled();
  });

  it("renders only the controls the current session declares", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.rules);
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    expect(await screen.findByRole("button", { name: "Rules" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Revise command" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hooks" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Personas" })).toBeNull();
  });

  it("disables the controls while the composer is disabled", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={true} />);
    expect(await screen.findByRole("button", { name: "Revise command" })).toBeDisabled();
  });

  it("does not re-ask the inventory or drop accepted controls on a status change alone", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    const view = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    await screen.findByRole("button", { name: "Revise command" });
    // working→idle is the same live session: the inventory stays put.
    view.rerender(
      <DevinSessionControls
        thread={thread({ status: "working" })}
        presentationMode="gui"
        isDisabled={false}
      />,
    );
    await act(async () => {});
    expect(bridgeMock.listThreadSessionActions).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Revise command" })).toBeDefined();
  });

  it("re-asks the inventory when the live session is replaced", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    const view = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    await screen.findByRole("button", { name: "Revise command" });
    view.rerender(
      <DevinSessionControls
        thread={thread({
          sessionRef: { providerSessionId: "sess-2", discoveredAt: "2026-10-07T00:00:00Z" },
        })}
        presentationMode="gui"
        isDisabled={false}
      />,
    );
    await waitFor(() => expect(bridgeMock.listThreadSessionActions).toHaveBeenCalledTimes(2));
  });

  it("drops the previous thread's capabilities immediately when the thread changes", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    const view = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    await screen.findByRole("button", { name: "Revise command" });
    // thread-2's fresh inventory has not arrived; thread-1's must not leak.
    view.rerender(
      <DevinSessionControls
        thread={thread({ id: "thread-2" })}
        presentationMode="gui"
        isDisabled={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Revise command" })).toBeNull();
  });
});

describe("DevinSessionControls menu dialogs", () => {
  it("renders no toolbar actions or dialogs until the menu selects one", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    let openRevise: (() => void) | undefined;
    const view = render(
      <SessionControls thread={thread()} presentationMode="gui" isDisabled={false}>
        {(actions) => {
          openRevise = actions[0]?.onAction;
          return <span>Existing add menu</span>;
        }}
      </SessionControls>,
    );
    await waitFor(() => expect(openRevise).toBeDefined());
    expect(screen.queryByRole("button", { name: "Revise command" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => openRevise?.());
    expect(screen.getByRole("dialog", { name: "Revise command" })).toBeDefined();
    expect(screen.getByLabelText("Command to revise")).toBeDefined();
    view.rerender(
      <SessionControls
        thread={thread({ id: "new-owner" })}
        presentationMode="gui"
        isDisabled={false}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("DevinSessionControls revise", () => {
  it("shows the suggestion for review and inserts into the composer only on explicit press", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    bridgeMock.invokeThreadSessionAction.mockResolvedValue({
      command: "git push --force-with-lease",
    });
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revise command" }));
    fireEvent.change(screen.getByLabelText("Command to revise"), {
      target: { value: "git push --force" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get suggestion" }));
    expect(await screen.findByText("git push --force-with-lease")).toBeDefined();

    // The suggestion is staged for review — nothing inserted or executed yet.
    expect(useComposerInputInbox.getState().itemsByComposer["thread-1"]).toBeUndefined();
    expect(bridgeMock.invokeThreadSessionAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Insert into composer" }));
    expect(useComposerInputInbox.getState().itemsByComposer["thread-1"]).toEqual([
      [{ kind: "text", content: "git push --force-with-lease" }],
    ]);
    // Still exactly one RPC: insertion never executes or sends anything.
    expect(bridgeMock.invokeThreadSessionAction).toHaveBeenCalledTimes(1);
  });

  it("never executes a stale revise suggestion after the thread changed", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    const resolveInvoke = holdInvoke();
    const view = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Revise command" }));
    fireEvent.change(screen.getByLabelText("Command to revise"), {
      target: { value: "git push --force" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get suggestion" }));
    await waitFor(() => expect(bridgeMock.invokeThreadSessionAction).toHaveBeenCalled());
    view.rerender(
      <DevinSessionControls
        thread={thread({ id: "thread-2" })}
        presentationMode="gui"
        isDisabled={false}
      />,
    );
    resolveInvoke({ command: "rm -rf /" });
    await waitFor(() =>
      expect(bridgeMock.listThreadSessionActions).toHaveBeenLastCalledWith({
        threadId: "thread-2",
      }),
    );
    expect(useComposerInputInbox.getState().itemsByComposer["thread-1"]).toBeUndefined();
    expect(useComposerInputInbox.getState().itemsByComposer["thread-2"]).toBeUndefined();
  });

  it("passes an optional revision note with the command", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    bridgeMock.invokeThreadSessionAction.mockResolvedValue({ command: "ls -la" });
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revise command" }));
    fireEvent.change(screen.getByLabelText("Command to revise"), {
      target: { value: "ls" },
    });
    fireEvent.change(screen.getByLabelText("Revision note (optional)"), {
      target: { value: "show hidden files" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get suggestion" }));
    await waitFor(() =>
      expect(bridgeMock.invokeThreadSessionAction).toHaveBeenCalledWith({
        threadId: "thread-1",
        actionId: DEVIN_SESSION_ACTION_IDS.revise,
        payload: { command: "ls", note: "show hidden files" },
      }),
    );
  });

  it("discards the suggestion without touching the composer", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    bridgeMock.invokeThreadSessionAction.mockResolvedValue({ command: "cmd" });
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revise command" }));
    fireEvent.change(screen.getByLabelText("Command to revise"), {
      target: { value: "cmd" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get suggestion" }));
    await screen.findByText("cmd");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(useComposerInputInbox.getState().itemsByComposer["thread-1"]).toBeUndefined();
  });
});

describe("DevinSessionControls revision admission", () => {
  it("blocks an already-open form after the composer becomes disabled", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    const view = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Revise command" }));
    fireEvent.change(screen.getByLabelText("Command to revise"), {
      target: { value: "echo test" },
    });
    view.rerender(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled />);
    expect(screen.getByRole("button", { name: "Get suggestion" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Command to revise").closest("form")!);
    expect(bridgeMock.invokeThreadSessionAction).not.toHaveBeenCalled();
  });

  it("admits only one request when a revision form submits twice in the same tick", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    const resolve = holdInvoke();
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revise command" }));
    fireEvent.change(screen.getByLabelText("Command to revise"), {
      target: { value: "echo test" },
    });
    const form = screen.getByLabelText("Command to revise").closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(bridgeMock.invokeThreadSessionAction).toHaveBeenCalledOnce();
    resolve({ command: "echo revised" });
    expect(await screen.findByText("echo revised")).toBeDefined();
  });

  it("drops a revision reply from a replaced live session", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    const resolve = holdInvoke();
    const view = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Revise command" }));
    fireEvent.change(screen.getByLabelText("Command to revise"), {
      target: { value: "echo test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get suggestion" }));
    view.rerender(
      <DevinSessionControls
        thread={thread({
          sessionRef: { providerSessionId: "replacement", discoveredAt: "2026-10-07T00:00:00Z" },
        })}
        presentationMode="gui"
        isDisabled={false}
      />,
    );
    resolve({ command: "echo stale" });
    await act(async () => {});
    expect(screen.queryByText("echo stale")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useComposerInputInbox.getState().itemsByComposer).toEqual({});
  });
});

describe("DevinSessionControls rules listings", () => {
  it("lists rule names and paths read-only", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.rules);
    bridgeMock.invokeThreadSessionAction.mockResolvedValue({
      rules: [
        {
          name: "no-force-push",
          path: ".devin/rules/no-force-push.md",
          provider: "project",
          scope: "project",
          trigger: "always_on",
        },
      ],
    });
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Rules" }));
    expect(await screen.findByText("no-force-push")).toBeDefined();
    expect(screen.getByText(".devin/rules/no-force-push.md")).toBeDefined();
    expect(screen.queryByText("provider: project")).toBeNull();
    expect(screen.getByText("Project · Always applied")).toBeDefined();
    expect(bridgeMock.invokeThreadSessionAction).toHaveBeenCalledWith({
      threadId: "thread-1",
      actionId: DEVIN_SESSION_ACTION_IDS.rules,
      payload: {},
    });
  });

  it("shows the empty listing for a session without rules", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.rules);
    bridgeMock.invokeThreadSessionAction.mockResolvedValue({ rules: [] });
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Rules" }));
    expect(await screen.findByText("No rules were listed for this session.")).toBeDefined();
  });

  it("fails a malformed rules listing visibly instead of rendering it as empty", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.rules);
    bridgeMock.invokeThreadSessionAction.mockResolvedValue({});
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Rules" }));
    expect(await screen.findByText(/rules listing Poracode could not interpret/i)).toBeDefined();
    expect(screen.queryByText("No rules were listed for this session.")).toBeNull();
  });

  it("fails a listing visibly when an entry violates the contract", async () => {
    catalog(DEVIN_SESSION_ACTION_IDS.rules);
    bridgeMock.invokeThreadSessionAction.mockResolvedValue({
      rules: [{ name: "kept-rule", path: "a.md" }, { name: "broken-rule" }],
    });
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Rules" }));
    expect(await screen.findByText(/rules listing Poracode could not interpret/i)).toBeDefined();
    expect(screen.queryByText("kept-rule")).toBeNull();
  });
});

describe("DevinSessionControls composer settings", () => {
  it("does not duplicate composer controls when native config actions are advertised", async () => {
    catalog(
      DEVIN_SESSION_CONFIG_ACTION_IDS.list,
      DEVIN_SESSION_CONFIG_ACTION_IDS.set,
      DEVIN_SESSION_ACTION_IDS.revise,
      DEVIN_SESSION_ACTION_IDS.rename,
      DEVIN_SESSION_ACTION_IDS.archive,
      DEVIN_SESSION_ACTION_IDS.hooks,
      DEVIN_NATIVE_PERSONAS_ACTION_ID,
    );
    render(<DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />);
    expect(await screen.findByRole("button", { name: "Revise command" })).toBeDefined();
    for (const name of [
      "Session settings",
      "Rename session",
      "Archive session",
      "Hooks",
      "Personas",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bridgeMock.invokeThreadSessionAction).not.toHaveBeenCalled();
  });

  it("renders no session actions for a config-only inventory", async () => {
    catalog(DEVIN_SESSION_CONFIG_ACTION_IDS.list, DEVIN_SESSION_CONFIG_ACTION_IDS.set);
    const view = render(
      <DevinSessionControls thread={thread()} presentationMode="gui" isDisabled={false} />,
    );
    await waitFor(() => expect(bridgeMock.listThreadSessionActions).toHaveBeenCalledOnce());
    expect(view.container).toBeEmptyDOMElement();
    expect(bridgeMock.invokeThreadSessionAction).not.toHaveBeenCalled();
  });
});

describe("ProviderSessionControls registration for devin", () => {
  it("mounts the Devin controls on the GUI surface only", async () => {
    // Importing the module performs the registration.
    await import("./index");
    catalog(DEVIN_SESSION_ACTION_IDS.revise);
    render(
      <ProviderSessionControls thread={thread()} presentationMode="gui" isDisabled={false}>
        {(actions) =>
          actions.map((action) => (
            <button type="button" key={action.id} onClick={action.onAction}>
              {action.label}
              {action.detail ? <span>{action.detail}</span> : null}
            </button>
          ))
        }
      </ProviderSessionControls>,
    );
    expect(await screen.findByRole("button", { name: "Revise command" })).toBeDefined();

    const terminal = render(
      <ProviderSessionControls thread={thread()} presentationMode="terminal" isDisabled={false} />,
    );
    await waitFor(() => expect(bridgeMock.listThreadSessionActions).toHaveBeenCalled());
    expect(terminal.container.firstChild).toBeNull();
  });
});
