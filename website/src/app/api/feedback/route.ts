import { NextRequest, NextResponse } from "next/server";
import {
  completeFeedback,
  configured,
  FeedbackError,
  feedbackStatus,
  limitFeedbackRequests,
  resumeFeedback,
  startFeedback,
} from "../../../lib/feedback";

export const maxDuration = 120;
// Anonymous clients use bearer receipts and Turnstile, never ambient cookies.
const headers = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "600",
};
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers });
}
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("receipt");
    if (id)
      await limitFeedbackRequests(
        request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      );
    return NextResponse.json(
      id
        ? await feedbackStatus(id)
        : { enabled: configured(), siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "" },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    await limitFeedbackRequests(
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    );
    const reader = request.body?.getReader();
    if (!reader) throw new FeedbackError("Missing form.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32000) {
        await reader.cancel();
        throw new FeedbackError("Form is too large.", 413);
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result =
      body.action === "complete"
        ? await completeFeedback(body.receipt)
        : body.action === "resume"
          ? await resumeFeedback(body.receipt)
          : await startFeedback(
              body,
              request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
            );
    return NextResponse.json(result, { headers });
  } catch (error) {
    return failure(error);
  }
}
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof FeedbackError
          ? error.message
          : "Feedback could not be sent. Your draft is kept; please try again.",
    },
    {
      status: error instanceof FeedbackError ? error.status : 503,
      headers,
    },
  );
}
