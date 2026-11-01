import { timingSafeEqual } from "node:crypto";
import { cleanupFeedback } from "@/lib/feedback";

export const maxDuration = 120;

export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const actual = request.headers.get("authorization") ?? "";
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return new Response(null, { status: 401 });
  await cleanupFeedback();
  return Response.json({ ok: true });
}
