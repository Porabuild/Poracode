import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ loaded: false, put: vi.fn<() => Promise<void>>() }));
vi.mock("@vercel/blob/client", () => {
  blob.loaded = true;
  return { put: blob.put };
});
const NativeURL = URL;
beforeEach(() => {
  vi.resetModules();
  blob.loaded = false;
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
  const { FeedbackForm } = await import("./FeedbackForm");
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
  expect(blob.loaded).toBe(false);
});

it("retries the same receipt after a delivery failure and honors diagnostics opt-out", async () => {
  const { FeedbackForm } = await import("./FeedbackForm");
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
  expect(blob.loaded).toBe(false);
});

it("loads the uploader when sending an attachment and completes the report", async () => {
  const { FeedbackForm } = await import("./FeedbackForm");
  const grant = { path: "feedback/screenshot.png", token: "client-token", type: "image/png" };
  const file = new File(["test"], "screenshot.png", { type: "image/png" });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json({ receipt: "attachment-receipt", grants: [grant] }))
    .mockResolvedValueOnce(
      Response.json({ url: "https://github.com/Porabuild/Poracode/issues/43" }),
    );
  vi.stubGlobal("fetch", fetcher);
  blob.put.mockResolvedValueOnce();
  const { container } = render(<FeedbackForm />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Screenshot report" } });
  fireEvent.change(screen.getByLabelText("What happened?"), {
    target: { value: "The screenshot shows the problem after switching branches." },
  });
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [file] },
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  expect(blob.loaded).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Feedback sent");
  expect(blob.loaded).toBe(true);
  expect(blob.put).toHaveBeenCalledExactlyOnceWith(grant.path, file, {
    access: "private",
    token: grant.token,
    contentType: grant.type,
  });
  expect(JSON.parse(String(fetcher.mock.calls[2]![1]!.body))).toEqual({
    action: "complete",
    receipt: "attachment-receipt",
  });
});
