import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { messages } from "@/renderer/locales/en/messages.po";
import "@/renderer/tailwind.css";
import type { UserInputOption } from "@/shared/contracts";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";
import { ThreadRuntimeRequestPanel } from "./ThreadRuntimeRequestPanel";

const i18n = setupI18n({ locale: "en", messages: { en: messages } });

afterEach(cleanup);

function renderRequest(width: number, options: UserInputOption[]) {
  const command = Array.from({ length: 60 }, (_, index) => `echo line ${index + 1}`).join("\n");
  const request: OpenRuntimeRequest = {
    requestId: "long-command",
    threadId: "thread",
    requestType: "command_execution_approval",
    payload: {
      summary: command,
      options,
    },
    receivedAt: new Date().toISOString(),
  };
  return render(
    <I18nProvider i18n={i18n}>
      <div data-testid="pane" style={{ width }}>
        <ThreadRuntimeRequestPanel
          threadId={request.threadId}
          request={request}
          onResolve={async () => undefined}
        />
      </div>
    </I18nProvider>,
  );
}

it("keeps permission actions over the scroller and clears the last line at both toolbar heights", async () => {
  const view = renderRequest(900, [
    { optionId: "allow", label: "Allow once" },
    { optionId: "always", label: "Allow for this project" },
    { optionId: "reject", label: "Reject" },
  ]);
  const pane = view.getByTestId("pane");
  const details = view.getByRole("region", { name: "Request details" });
  const text = within(details).getByText(/echo line 60/);
  const [first, second, last] = within(details).getAllByRole("button");

  await waitFor(() => {
    const bottom = details.getBoundingClientRect().bottom;
    expect(text.getBoundingClientRect().bottom).toBeGreaterThan(bottom);
    expect(first!.getBoundingClientRect().bottom).toBeLessThan(bottom);
    expect(first!.getBoundingClientRect().top).toBe(last!.getBoundingClientRect().top);
  });

  for (const width of [900, 260]) {
    pane.style.width = `${width}px`;
    details.scrollTop = 0;
    const viewport = details.getBoundingClientRect();
    const firstAction = first!.getBoundingClientRect();
    expect(viewport.width).toBeGreaterThan(width - 50);
    expect(firstAction.top).toBeGreaterThan(viewport.top);
    expect(last!.getBoundingClientRect().bottom).toBeLessThan(viewport.bottom);
    expect(last!.getBoundingClientRect().top > firstAction.top).toBe(width === 260);

    details.scrollTop = details.scrollHeight;
    expect(text.getBoundingClientRect().bottom).toBeLessThan(firstAction.top);
    expect(first!.getBoundingClientRect().top).toBe(firstAction.top);
    expect(second!.getBoundingClientRect().right).toBeLessThanOrEqual(viewport.right);
  }
});

it("keeps the end of the details and long lists of permission choices reachable", async () => {
  const view = renderRequest(
    260,
    Array.from({ length: 9 }, (_, index) => ({
      optionId: `scope-${index + 1}`,
      label: `Allow permission for scope ${index + 1}`,
    })),
  );
  const details = view.getByRole("region", { name: "Request details" });
  const text = within(details).getByText(/echo line 60/);
  const lastAction = within(details).getByRole("button", { name: "Allow permission for scope 9" });
  const toolbar = lastAction.closest<HTMLElement>(".poracode-floating-chrome--clear")!;
  await waitFor(() => {
    expect(toolbar.scrollHeight).toBeGreaterThan(toolbar.clientHeight);
    details.scrollTop = details.scrollHeight;
    expect(text.getBoundingClientRect().bottom).toBeLessThan(toolbar.getBoundingClientRect().top);
    expect(text.getBoundingClientRect().bottom).toBeGreaterThan(
      details.getBoundingClientRect().top,
    );
  });
  lastAction.focus();
  expect(toolbar.scrollTop).toBeGreaterThan(0);
  expect(lastAction.getBoundingClientRect().bottom).toBeLessThan(
    toolbar.getBoundingClientRect().bottom,
  );
});
