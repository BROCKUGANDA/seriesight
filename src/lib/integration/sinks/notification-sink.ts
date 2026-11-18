/**
 * Notification sink — persists in-app notifications for the Integration Hub
 * and the shell notification centre. One row per notable occurrence; the
 * notification consumer decides which topics qualify and with what severity.
 */
import { db } from "@/lib/db";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export async function createNotification(input: {
  topic: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
}): Promise<void> {
  await db.integrationNotificationRecord.create({
    data: {
      topic: input.topic,
      severity: input.severity,
      title: input.title,
      body: input.body,
    },
  });
}

/** Keep the feed bounded — retain the most recent 200 rows. */
export async function pruneNotifications(keep = 200): Promise<void> {
  const overflow = await db.integrationNotificationRecord.count();
  if (overflow <= keep) return;
  const stale = await db.integrationNotificationRecord.findMany({
    orderBy: { createdAt: "desc" },
    skip: keep,
    take: overflow - keep,
    select: { id: true },
  });
  if (stale.length === 0) return;
  await db.integrationNotificationRecord.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
}
