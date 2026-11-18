/**
 * Replay a dead-lettered or pending event — POST /api/integration/events/[eventId]/replay
 * Resets attempts and dispatches immediately; the Integration Hub exposes this
 * as the recovery action on dead-lettered rows.
 */
import { NextRequest } from "next/server";
import { ok, handler, fail } from "@/lib/api/respond";
import { replayEvent } from "@/lib/integration/bus";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) => {
  ensureBusBootstrapped();
  const { eventId } = await params;
  try {
    const outcome = await replayEvent(eventId);
    return ok(outcome, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown replay failure";
    if (message.includes("not found")) {
      return fail({ code: "NOT_FOUND", message: "Event not found.", retryable: false, recovery: "Refresh the event stream and retry." }, req, 404);
    }
    return fail({ code: "INTEGRATION_EVENT_NOT_REPLAYABLE", message, retryable: false, recovery: "Only pending or dead-lettered events can be replayed." }, req, 409);
  }
});
