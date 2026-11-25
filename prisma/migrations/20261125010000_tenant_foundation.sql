-- Tenant foundation. Safe on both a fresh baseline and a database previously
-- created with `prisma db push`: creates missing tables, backfills one personal
-- organization/workspace per existing coach, then scopes integration rows.

ALTER TABLE "AuthUserRecord" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
UPDATE "AuthUserRecord" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "AuthVerificationRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthVerificationRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthVerificationRecord_tokenHash_key" ON "AuthVerificationRecord"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthVerificationRecord_userId_purpose_idx" ON "AuthVerificationRecord"("userId", "purpose");

CREATE TABLE IF NOT EXISTS "RequestRateLimitRecord" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequestRateLimitRecord_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "RequestRateLimitRecord_expiresAt_idx" ON "RequestRateLimitRecord"("expiresAt");

CREATE TABLE IF NOT EXISTS "OrganizationRecord" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationRecord_slug_key" ON "OrganizationRecord"("slug");

CREATE TABLE IF NOT EXISTS "OrganizationMemberRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'coach',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationMemberRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMemberRecord_organizationId_userId_key" ON "OrganizationMemberRecord"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "OrganizationMemberRecord_userId_idx" ON "OrganizationMemberRecord"("userId");

CREATE TABLE IF NOT EXISTS "OrganizationInvitationRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'coach',
  "tokenHash" TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationInvitationRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationInvitationRecord_tokenHash_key" ON "OrganizationInvitationRecord"("tokenHash");
CREATE INDEX IF NOT EXISTS "OrganizationInvitationRecord_organizationId_email_idx" ON "OrganizationInvitationRecord"("organizationId", "email");

CREATE TABLE IF NOT EXISTS "WorkspaceRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'team',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkspaceRecord_organizationId_idx" ON "WorkspaceRecord"("organizationId");

ALTER TABLE "IntegrationEventRecord" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'global';
ALTER TABLE "IntegrationEndpointRecord" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'global';
ALTER TABLE "IntegrationNotificationRecord" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT NOT NULL DEFAULT 'global';
CREATE INDEX IF NOT EXISTS "IntegrationEventRecord_workspaceId_status_nextAttemptAt_idx" ON "IntegrationEventRecord"("workspaceId", "status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "IntegrationEndpointRecord_workspaceId_status_idx" ON "IntegrationEndpointRecord"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "IntegrationNotificationRecord_workspaceId_read_createdAt_idx" ON "IntegrationNotificationRecord"("workspaceId", "read", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationRecord_ownerUserId_fkey') THEN
    ALTER TABLE "OrganizationRecord" ADD CONSTRAINT "OrganizationRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "AuthUserRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationMemberRecord_organizationId_fkey') THEN
    ALTER TABLE "OrganizationMemberRecord" ADD CONSTRAINT "OrganizationMemberRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "OrganizationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationMemberRecord_userId_fkey') THEN
    ALTER TABLE "OrganizationMemberRecord" ADD CONSTRAINT "OrganizationMemberRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUserRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationInvitationRecord_organizationId_fkey') THEN
    ALTER TABLE "OrganizationInvitationRecord" ADD CONSTRAINT "OrganizationInvitationRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "OrganizationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationInvitationRecord_invitedByUserId_fkey') THEN
    ALTER TABLE "OrganizationInvitationRecord" ADD CONSTRAINT "OrganizationInvitationRecord_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "AuthUserRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceRecord_organizationId_fkey') THEN
    ALTER TABLE "WorkspaceRecord" ADD CONSTRAINT "WorkspaceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "OrganizationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Existing coaches keep their workspace id and drafts; add the tenant records
-- that the new authorization layer expects.
INSERT INTO "OrganizationRecord" ("id", "name", "slug", "ownerUserId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u."name" || ' organisation', 'personal-' || substr(u."id", 1, 8), u."id", NOW(), NOW()
FROM "AuthUserRecord" u
WHERE NOT EXISTS (SELECT 1 FROM "OrganizationRecord" o WHERE o."ownerUserId" = u."id");

INSERT INTO "OrganizationMemberRecord" ("id", "organizationId", "userId", "role", "joinedAt")
SELECT gen_random_uuid(), o."id", o."ownerUserId", 'owner', NOW()
FROM "OrganizationRecord" o
WHERE NOT EXISTS (
  SELECT 1 FROM "OrganizationMemberRecord" m
  WHERE m."organizationId" = o."id" AND m."userId" = o."ownerUserId"
);

INSERT INTO "WorkspaceRecord" ("id", "organizationId", "name", "kind", "createdAt", "updatedAt")
SELECT u."workspaceId", o."id", 'Personal workspace', 'personal', NOW(), NOW()
FROM "AuthUserRecord" u
JOIN "OrganizationRecord" o ON o."ownerUserId" = u."id"
WHERE NOT EXISTS (SELECT 1 FROM "WorkspaceRecord" w WHERE w."id" = u."workspaceId");
