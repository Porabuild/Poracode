import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { FeedbackDialog } from "./FeedbackDialog";
import {
  resetFeedbackDraft,
  updateFeedbackDraft,
  useFeedbackDraftStore,
} from "@/renderer/state/feedbackDraftStore";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    appVersion: "2.0.0",
    platform: "win32",
    openExternal: vi.fn<() => Promise<void>>(),
  }),
}));
vi.mock("@vercel/blob/client", () => ({ put: vi.fn<() => Promise<void>>() }));
const NativeURL = URL;
beforeEach(() => {
  resetFeedbackDraft();
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static override createObjectURL = vi.fn<() => string>(() => "blob:local-preview");
      static override revokeObjectURL = vi.fn<() => void>();
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(Response.json({ enabled: false })),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("unlocks an expired receipt while preserving the draft for fresh verification", async () => {
  updateFeedbackDraft({
    title: "Changes stay stale",
    details: "Previous branch files remain after switching branches.",
    delivery: { receipt: "12345678-1234-1234-1234-123456789012", grants: [], uploaded: [] },
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ enabled: true }))
      .mockResolvedValueOnce(Response.json({ error: "Expired" }, { status: 410 })),
  );
  render(<FeedbackDialog isOpen onOpenChange={vi.fn<(open: boolean) => void>()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("This submission has expired. Your draft is kept.");
  expect(screen.getByRole("textbox", { name: "Title" })).toBeEnabled();
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Changes stay stale");
  expect(useFeedbackDraftStore.getState().draft.delivery).toBeNull();
  expect(await screen.findByTitle("Verification")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

it("renders native fields, keeps the service error visible, and adds/removes local attachments", async () => {
  const { container } = render(
    <FeedbackDialog isOpen onOpenChange={vi.fn<(open: boolean) => void>()} />,
  );
  await screen.findByText("Feedback is temporarily unavailable. Please try again later.");
  expect(container.querySelector("iframe")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Native form" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Idea" }));
  expect(screen.getByRole("textbox", { name: "What would you like to see?" })).toBeInTheDocument();
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [new File(["image"], "screenshot.png", { type: "image/png" })] },
  });
  expect(screen.getByText("screenshot.png")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Feedback is temporarily unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Remove screenshot.png" }));
  expect(screen.queryByText("screenshot.png")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(screen.getByText("Poracode 2.0.0; win32")).toBeInTheDocument();
});

it("accepts verification only from its trusted challenge frame and retries the same receipt", async () => {
  const receipt = "12345678-1234-1234-1234-123456789012";
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json({ receipt, grants: [] }))
    .mockResolvedValueOnce(Response.json({ error: "Retry delivery" }, { status: 502 }))
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json({ receipt, grants: [], uploaded: [] }))
    .mockResolvedValueOnce(
      Response.json({ url: "https://github.com/Porabuild/Poracode/issues/42" }),
    );
  vi.stubGlobal("fetch", fetcher);
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const view = render(<FeedbackDialog isOpen onOpenChange={onOpenChange} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Changes stay stale" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "What happened?" }), {
    target: { value: "Previous branch files remain after switching branches." },
  });
  const frame = (await screen.findByTitle("Verification")) as HTMLIFrameElement;
  expect(frame).toHaveAttribute("src", "https://poracode.com/feedback/verify");
  for (const [origin, source] of [
    ["https://evil.test", frame.contentWindow],
    ["https://poracode.com", window],
  ] as const)
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source,
        data: { type: "poracode.feedback.verification", token: "forged" },
      }),
    );
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "https://poracode.com",
      source: frame.contentWindow,
      data: { type: "poracode.feedback.verification", token: "verified" },
    }),
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Retry delivery");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  view.unmount();
  render(<FeedbackDialog isOpen onOpenChange={onOpenChange} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Changes stay stale");
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Feedback sent");
  expect(JSON.parse(String(fetcher.mock.calls[4]![1]!.body))).toEqual({
    action: "resume",
    receipt,
  });
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).toMatchObject({
    diagnostics: "Poracode 2.0.0; win32",
    token: "verified",
  });
});
