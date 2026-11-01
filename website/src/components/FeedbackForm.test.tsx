import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FeedbackForm } from "./FeedbackForm";

vi.mock("@vercel/blob/client", () => ({ put: vi.fn<() => Promise<void>>() }));
const NativeURL = URL;
beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static override createObjectURL = vi.fn<() => string>(() => "blob:local-preview");
      static override revokeObjectURL = vi.fn<() => void>();
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("keeps the configuration error visible when an attachment is selected", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(Response.json({ enabled: false })),
  );
  const { container } = render(<FeedbackForm />);
  await screen.findByText("Feedback is temporarily unavailable. Please try again later.");
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["test"], "screenshot.png", { type: "image/png" })] },
  });
  expect(screen.getByRole("status")).toHaveTextContent("Feedback is temporarily unavailable");
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

it("retries the same receipt after a delivery failure and honors diagnostics opt-out", async () => {
  const receipt = "12345678-1234-1234-1234-123456789012";
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json({ receipt, grants: [] }))
    .mockResolvedValueOnce(Response.json({ error: "Please retry delivery." }, { status: 502 }))
    .mockResolvedValueOnce(Response.json({ receipt, grants: [], uploaded: [] }))
    .mockResolvedValueOnce(
      Response.json({ url: "https://github.com/Porabuild/Poracode/issues/42" }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<FeedbackForm />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Changes stay stale" } });
  fireEvent.change(screen.getByLabelText("What happened?"), {
    target: { value: "Previous branch files remain after switching branches." },
  });
  fireEvent.click(screen.getByLabelText("Include basic diagnostics"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  expect(document.querySelector("iframe")).toBeNull();
  expect(document.querySelector('script[src*="cloudflare"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Please retry delivery.");
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Feedback sent");
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).toMatchObject({
    diagnostics: "",
    title: "Changes stay stale",
  });
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).not.toHaveProperty("token");
  expect(JSON.parse(String(fetcher.mock.calls[3]![1]!.body))).toEqual({
    action: "resume",
    receipt,
  });
  expect(JSON.parse(String(fetcher.mock.calls[4]![1]!.body))).toEqual({
    action: "complete",
    receipt,
  });
});
