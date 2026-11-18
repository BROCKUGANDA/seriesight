/**
 * Integration notification feed — /api/integration/notifications
 *   GET    — recent feed rows (newest first)
 *   PATCH  { ids?, all? } — mark rows read; `all` clears the unread badge.
 */
import { NextRequest } from "next/server";
import { ok, handler, parseBody } from "@/lib/api/respond";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureBusBootstrapped } from "@/lib/integration/bootstrap";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  ensureBusBootstrapped();
  const [rows, unread] = await Promise.all([
    db.integrationNotificationRecord.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    db.integrationNotificationRecord.count({ where: { read: false } }),
  ]);
  return ok({ notifications: rows, unread }, req);
});

const patchSchema = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }).strict();

export const PATCH = handler(async (req: NextRequest) => {
  ensureBusBootstrapped();
  const body = await parseBody(req, patchSchema);
  if (body.all) {
    await db.integrationNotificationRecord.updateMany({ where: { read: false }, data: { read: true } });
  } else if (body.ids && body.ids.length > 0) {
    await db.integrationNotificationRecord.updateMany({ where: { id: { in: body.ids } }, data: { read: true } });
  }
  const unread = await db.integrationNotificationRecord.count({ where: { read: false } });
  return ok({ unread }, req);
});
