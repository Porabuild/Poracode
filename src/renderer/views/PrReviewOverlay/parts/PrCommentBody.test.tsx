import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { PrCommentBody } from "./PrCommentBody";

it("keeps the original body as the save precondition while retaining a failed draft", async () => {
  const onSave = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
  const view = render(<PrCommentBody body="Original" disabled={false} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit comment" }), {
    target: { value: "My draft" },
  });
  view.rerender(<PrCommentBody body="Original" disabled onSave={onSave} />);
  expect(screen.getByRole("textbox", { name: "Edit comment" })).toHaveValue("My draft");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  view.rerender(
    <PrCommentBody body="Changed by another client" disabled={false} onSave={onSave} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith("My draft", "Original"));
  expect(screen.getByRole("textbox", { name: "Edit comment" })).toHaveValue("My draft");
  onSave.mockResolvedValue(true);
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.queryByRole("textbox", { name: "Edit comment" })).not.toBeInTheDocument(),
  );
});

it("shows no edit action without authority and cancels a draft without writing", () => {
  const onSave = vi.fn<() => Promise<boolean>>();
  const view = render(<PrCommentBody body="Original" disabled={false} />);
  expect(screen.queryByRole("button", { name: "Edit comment" })).not.toBeInTheDocument();
  view.rerender(<PrCommentBody body="Original" disabled={false} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit comment" }), {
    target: { value: "Discard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
  expect(screen.getByRole("textbox", { name: "Edit comment" })).toHaveValue("Original");
});
