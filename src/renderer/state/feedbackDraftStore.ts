import { create } from "zustand";
import type { FeedbackDelivery } from "@/shared/feedbackClient";

type FeedbackDraft = {
  kind: "bug" | "idea";
  title: string;
  details: string;
  files: File[];
  delivery: FeedbackDelivery | null;
};
const emptyDraft = (): FeedbackDraft => ({
  kind: "bug",
  title: "",
  details: "",
  files: [],
  delivery: null,
});
// Memory only: retain the receipt across modal/sidebar unmounts so retries cannot
// accidentally start a second issue. No file data or bearer receipt goes to disk.
export const useFeedbackDraftStore = create<{ draft: FeedbackDraft }>(() => ({
  draft: emptyDraft(),
}));
export function updateFeedbackDraft(patch: Partial<FeedbackDraft>) {
  useFeedbackDraftStore.setState(({ draft }) => ({ draft: { ...draft, ...patch } }));
}
export function resetFeedbackDraft() {
  useFeedbackDraftStore.setState({ draft: emptyDraft() });
}
