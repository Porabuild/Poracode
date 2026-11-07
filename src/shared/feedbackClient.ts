export type FeedbackGrant = { path: string; type: string; token: string };
export type FeedbackDelivery = { receipt: string; grants: FeedbackGrant[]; uploaded: number[] };
export type FeedbackDraft = {
  kind: "bug" | "idea";
  title: string;
  details: string;
  diagnostics: string;
};
export type FeedbackProgress = "prepare" | "complete" | { upload: number };
export class FeedbackDeliveryError extends Error {
  constructor(public code: "expired" | "unconfirmed") {
    super(code);
  }
}
export async function feedbackRequest(base: string, body: unknown) {
  const response = await fetch(`${base}/api/feedback`, {
    method: "POST",
    credentials: "omit",
    signal: AbortSignal.timeout(150000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (response.status === 410) throw new FeedbackDeliveryError("expired");
  if (!response.ok) throw new Error(value.error);
  return value;
}
function issueUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^https:\/\/github\.com\/Porabuild\/Poracode\/issues\/\d+$/.test(value)
  );
}
export async function deliverFeedback(options: {
  base: string;
  draft: FeedbackDraft;
  files: File[];
  delivery: FeedbackDelivery | null;
  onDelivery: (delivery: FeedbackDelivery) => void;
  onProgress: (progress: FeedbackProgress) => void;
  upload: (grant: FeedbackGrant, file: File) => Promise<unknown>;
}): Promise<{ url: string } | { pending: true }> {
  let current: FeedbackDelivery;
  if (options.delivery) {
    const resumed = await feedbackRequest(options.base, {
      action: "resume",
      receipt: options.delivery.receipt,
    });
    if (issueUrl(resumed.url)) return { url: resumed.url };
    if (resumed.pending) return { pending: true };
    if (!resumed.grants) throw new FeedbackDeliveryError("expired");
    current = resumed as FeedbackDelivery;
  } else {
    options.onProgress("prepare");
    current = {
      ...(await feedbackRequest(options.base, {
        version: 1,
        ...options.draft,
        files: options.files.map((file) => ({ name: file.name, size: file.size })),
      })),
      uploaded: [],
    };
  }
  options.onDelivery(current);
  for (let index = 0; index < current.grants.length; index++) {
    if (current.uploaded.includes(index)) continue;
    options.onProgress({ upload: index + 1 });
    await options.upload(current.grants[index]!, options.files[index]!);
    current.uploaded.push(index);
  }
  options.onProgress("complete");
  const result = await feedbackRequest(options.base, {
    action: "complete",
    receipt: current.receipt,
  });
  if (result.pending) return { pending: true };
  if (!issueUrl(result.url)) throw new FeedbackDeliveryError("unconfirmed");
  return { url: result.url };
}
