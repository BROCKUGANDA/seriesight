import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { identityContext, type Identity } from "@/lib/auth";
import { createPersonalOrganization } from "@/services/organizations";
import { fallbackRates } from "@/lib/billing/fx";
import { createIntent, listPayments, verifyIntent } from "@/lib/billing/ledger";

const userIds: string[] = [];
const workspaceIds: string[] = [];

async function coach() {
  const id = randomUUID();
  const workspaceId = randomUUID();
  const user = await db.$transaction(async (tx) => {
    const created = await tx.authUserRecord.create({
      data: { email: `${id}@example.test`, name: "Billing Coach", passwordHash: "test", workspaceId, emailVerifiedAt: new Date() },
    });
    await createPersonalOrganization(created, tx);
    return created;
  });
  userIds.push(user.id);
  workspaceIds.push(workspaceId);
  const identity: Identity = {
    userId: user.id, workspaceId, name: user.name, email: user.email,
    kind: "coach", role: "Private coach workspace", signedInAt: new Date().toISOString(), emailVerified: true,
  };
  return identity;
}

afterAll(async () => {
  await db.billingPaymentRecord.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  const owned = await db.organizationRecord.findMany({ where: { ownerUserId: { in: userIds } }, select: { id: true } });
  await db.organizationRecord.deleteMany({ where: { id: { in: owned.map((o) => o.id) } } });
  await db.authUserRecord.deleteMany({ where: { id: { in: userIds } } });
});

describe("tenant-scoped billing ledger", () => {
  it("hides payment intents from other workspaces", async () => {
    const owner = await coach();
    const other = await coach();
    const payment = await identityContext.run(owner, () =>
      createIntent("USDC-SOL", "coach", "monthly", fallbackRates()),
    );

    await expect(identityContext.run(other, () => verifyIntent(payment.id, "a".repeat(64))))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await identityContext.run(other, () => listPayments())).toEqual([]);
    expect(await identityContext.run(owner, () => listPayments())).toHaveLength(1);
  });
});
