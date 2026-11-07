// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PrDetails } from "@/shared/contracts";
import { makeTestDetails, renderInPrDetail } from "../testing/prDetailTestScope";
import { TimelineTab } from "./TimelineTab";

afterEach(cleanup);

const alice = { login: "alice" };
const bob = { login: "bob" };
const SHA = "1234567890abcdef1234567890abcdef12345678";

function richDetails(): PrDetails {
  return makeTestDetails({
    timeline: [
      {
        id: "e1",
        kind: "opened",
        createdAt: "2026-07-01T08:00:00Z",
        actor: alice,
      },
      {
        id: "e2",
        kind: "labeled",
        createdAt: "2026-07-01T09:00:00Z",
        actor: alice,
        label: { name: "needs-review" },
      },
      {
        id: "e3",
        kind: "review-requested",
        createdAt: "2026-07-01T09:30:00Z",
        actor: alice,
        reviewer: { id: "9", login: "carol", name: "Carol" },
      },
      {
        id: "e4",
        kind: "force-pushed",
        createdAt: "2026-07-03T09:00:00Z",
        actor: alice,
        fromRef: SHA,
        toRef: "fedcba0987654321fedcba0987654321fedcba09",
      },
      {
        id: "e5",
        kind: "base-changed",
        createdAt: "2026-07-03T10:00:00Z",
        actor: alice,
        fromRef: "main",
        toRef: "release",
      },
      {
        id: "e6",
        kind: "renamed",
        createdAt: "2026-07-03T11:00:00Z",
        actor: alice,
        fromRef: "Old title",
        toRef: "New title",
      },
      { id: "e7", kind: "ready", createdAt: "2026-07-03T12:00:00Z", actor: alice },
      { id: "e8", kind: "closed", createdAt: "2026-07-04T08:00:00Z", actor: bob },
      { id: "e9", kind: "system", createdAt: "2026-07-04T09:00:00Z", text: "Conversation locked" },
      { id: "e10", kind: "from-the-future", createdAt: "2026-07-04T10:00:00Z", actor: bob },
    ],
    commits: [
      {
        oid: SHA,
        abbreviatedOid: "1234567",
        messageHeadline: "Add the rail",
        authoredDate: "2026-07-02T08:00:00Z",
        author: alice,
      },
    ],
    reviews: [
      {
        id: "r1",
        author: bob,
        state: "CHANGES_REQUESTED",
        body: "Please split this up\nsecond line",
        submittedAt: "2026-07-02T12:00:00Z",
      },
    ],
    comments: [
      { id: "k1", author: bob, body: "Looks good overall", createdAt: "2026-07-02T13:00:00Z" },
    ],
    reviewThreads: [
      {
        id: "t1",
        isResolved: false,
        isOutdated: false,
        path: "src/app.ts",
        line: 12,
        side: "LEFT",
        comments: [
          { id: "tc1", author: bob, body: "Rename this", createdAt: "2026-07-02T14:00:00Z" },
        ],
      },
      {
        id: "t2",
        isResolved: true,
        isOutdated: false,
        comments: [
          { id: "tc2", author: bob, body: "General thought", createdAt: "2026-07-02T15:00:00Z" },
        ],
      },
    ],
  });
}

function rows() {
  return screen.getAllByRole("listitem");
}

describe("TimelineTab", () => {
  it("shows the empty state", () => {
    renderInPrDetail(<TimelineTab />);
    expect(screen.getByText("No activity yet.")).toBeTruthy();
  });

  it("shows a loader while nothing is ready", () => {
    renderInPrDetail(<TimelineTab />, { contentReady: false }, { details: null });
    expect(screen.getByRole("img", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByText("No activity yet.")).toBeNull();
  });

  it("phrases every event kind and skips unknown ones", () => {
    renderInPrDetail(<TimelineTab />, {}, { details: richDetails() });
    const text = rows().map((row) => row.textContent ?? "");
    expect(text.some((line) => line.includes("alice opened this"))).toBe(true);
    expect(
      text.some((line) => line.includes("alice labeled") && line.includes("needs-review")),
    ).toBe(true);
    expect(text.some((line) => line.includes("alice requested review from Carol"))).toBe(true);
    expect(text.some((line) => line.includes("alice force-pushed 1234567 → fedcba0"))).toBe(true);
    expect(
      text.some((line) => line.includes("alice changed the base branch from main to release")),
    ).toBe(true);
    expect(
      text.some((line) => line.includes("alice renamed this from “Old title” to “New title”")),
    ).toBe(true);
    expect(text.some((line) => line.includes("alice marked this as ready for review"))).toBe(true);
    expect(text.some((line) => line.includes("bob closed this"))).toBe(true);
    expect(text.some((line) => line.includes("Conversation locked"))).toBe(true);
    expect(rows()).toHaveLength(9 + 1 + 1 + 1 + 2);
  });

  it("shows commit, review and comment content", () => {
    renderInPrDetail(<TimelineTab />, {}, { details: richDetails() });
    expect(screen.getByText("Add the rail")).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Show changes of commit/u })).getByText("1234567"),
    ).toBeTruthy();
    expect(screen.getByText("Changes requested")).toBeTruthy();
    expect(screen.getByText(/Please split this up/u)).toBeTruthy();
    expect(screen.getByText("Looks good overall")).toBeTruthy();
  });

  it("orders oldest first by default and toggles to newest first", () => {
    renderInPrDetail(<TimelineTab />, {}, { details: richDetails() });
    expect(rows()[0]?.textContent).toContain("opened this");
    fireEvent.click(screen.getByRole("button", { name: "Change order" }));
    expect(screen.getByRole("button", { name: "Change order" }).textContent).toContain(
      "Newest first",
    );
    expect(rows()[0]?.textContent).toContain("Conversation locked");
    expect(rows().at(-1)?.textContent).toContain("opened this");
  });

  it("filters by group", async () => {
    renderInPrDetail(<TimelineTab />, {}, { details: richDetails() });
    fireEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Commits/u }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.textContent).toContain("Add the rail");

    fireEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Events/u }));
    expect(rows()).toHaveLength(9);

    fireEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Reviews & comments/u }));
    expect(rows()).toHaveLength(4);
  });

  it("scopes the changes tab to a commit when it is clicked", () => {
    renderInPrDetail(<TimelineTab />, {}, { details: richDetails() });
    fireEvent.click(screen.getByRole("button", { name: /Show changes of commit 1234567/u }));
    const nav = screen.getByTestId("pr-nav");
    expect(nav.getAttribute("data-commit")).toBe(SHA);
    expect(nav.getAttribute("data-tab")).toBe("changes");
  });

  it("marks an old-side thread and opens its old line in Changes", () => {
    renderInPrDetail(<TimelineTab />, {}, { details: richDetails() });

    expect(screen.getByText("Old side")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open src/app.ts:12 in changes" }));

    const nav = screen.getByTestId("pr-nav");
    expect(nav).toHaveAttribute("data-tab", "changes");
    expect(nav).toHaveAttribute("data-file", "src/app.ts");
    expect(nav).toHaveAttribute("data-line", "12");
    expect(nav).toHaveAttribute("data-side", "LEFT");
  });

  it("opens the file of a thread and the summary for the others", () => {
    renderInPrDetail(<TimelineTab />, {}, { details: richDetails() });
    fireEvent.click(screen.getByRole("button", { name: "Open src/app.ts:12 in changes" }));
    let nav = screen.getByTestId("pr-nav");
    expect(nav.getAttribute("data-tab")).toBe("changes");
    expect(nav.getAttribute("data-file")).toBe("src/app.ts");
    expect(nav.getAttribute("data-line")).toBe("12");
    expect(nav.getAttribute("data-side")).toBe("LEFT");

    fireEvent.click(screen.getByRole("button", { name: "Open thread in summary" }));
    nav = screen.getByTestId("pr-nav");
    expect(nav.getAttribute("data-tab")).toBe("summary");
  });
});
