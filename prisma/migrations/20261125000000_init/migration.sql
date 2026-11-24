-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AuthUserRecord" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthUserRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSessionRecord" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSessionRecord_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "AuthThrottleRecord" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AuthThrottleRecord_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RequestRateLimitRecord" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestRateLimitRecord_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DraftSessionRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'ws-demo',
    "ourTeamId" TEXT NOT NULL,
    "opponentTeamId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "rulesetId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "restrictionsScope" TEXT NOT NULL,
    "tournamentId" TEXT,
    "patch" TEXT NOT NULL,
    "ourSide" TEXT NOT NULL DEFAULT 'BLUE',
    "poolJson" TEXT NOT NULL DEFAULT '[]',
    "currentGame" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "gamesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftSessionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftActionRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "championId" TEXT NOT NULL,
    "playerId" TEXT,
    "role" TEXT,
    "phase" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "priorStateVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftActionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJobRecord" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "seriesCount" INTEGER NOT NULL DEFAULT 0,
    "gameCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IngestionJobRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourceConnectionRecord" (
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastSuccessfulRequestAt" TIMESTAMP(3),
    "lastImportAttemptAt" TIMESTAMP(3),
    "authorizedEndpointsJson" TEXT NOT NULL DEFAULT '[]',
    "rateLimitRemaining" INTEGER,
    "parsedSeriesCount" INTEGER NOT NULL DEFAULT 0,
    "failedImportCount" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSourceConnectionRecord_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "LeadRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'coach',
    "message" TEXT,
    "source" TEXT NOT NULL DEFAULT 'website-trial',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEventRecord" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'internal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "correlationId" TEXT,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationEventRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEndpointRecord" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "topicsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEndpointRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationDeliveryRecord" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationDeliveryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationNotificationRecord" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationNotificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPaymentRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'ws-demo',
    "planId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "aedAmount" DOUBLE PRECISION NOT NULL,
    "usdAmount" DOUBLE PRECISION NOT NULL,
    "tokenAmount" DOUBLE PRECISION NOT NULL,
    "rateUsd" DOUBLE PRECISION NOT NULL,
    "rateSource" TEXT NOT NULL,
    "rateTimestamp" TIMESTAMP(3) NOT NULL,
    "treasuryAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
    "txRef" TEXT,
    "verificationNote" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingReversalRecord" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "aedAmount" DOUBLE PRECISION NOT NULL,
    "tokenAmount" DOUBLE PRECISION NOT NULL,
    "token" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "refundTxRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingReversalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthUserRecord_email_key" ON "AuthUserRecord"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthUserRecord_workspaceId_key" ON "AuthUserRecord"("workspaceId");

-- CreateIndex
CREATE INDEX "AuthSessionRecord_expiresAt_idx" ON "AuthSessionRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "RequestRateLimitRecord_expiresAt_idx" ON "RequestRateLimitRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "DraftSessionRecord_workspaceId_status_idx" ON "DraftSessionRecord"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "DraftSessionRecord_opponentTeamId_idx" ON "DraftSessionRecord"("opponentTeamId");

-- CreateIndex
CREATE INDEX "DraftActionRecord_sessionId_gameNumber_order_idx" ON "DraftActionRecord"("sessionId", "gameNumber", "order");

-- CreateIndex
CREATE INDEX "IngestionJobRecord_status_createdAt_idx" ON "IngestionJobRecord"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LeadRecord_status_createdAt_idx" ON "LeadRecord"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LeadRecord_email_idx" ON "LeadRecord"("email");

-- CreateIndex
CREATE INDEX "IntegrationEventRecord_status_nextAttemptAt_idx" ON "IntegrationEventRecord"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "IntegrationEventRecord_topic_createdAt_idx" ON "IntegrationEventRecord"("topic", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEndpointRecord_status_idx" ON "IntegrationEndpointRecord"("status");

-- CreateIndex
CREATE INDEX "IntegrationDeliveryRecord_status_createdAt_idx" ON "IntegrationDeliveryRecord"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationDeliveryRecord_endpointId_idx" ON "IntegrationDeliveryRecord"("endpointId");

-- CreateIndex
CREATE INDEX "IntegrationNotificationRecord_read_createdAt_idx" ON "IntegrationNotificationRecord"("read", "createdAt");

-- CreateIndex
CREATE INDEX "BillingPaymentRecord_status_createdAt_idx" ON "BillingPaymentRecord"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingPaymentRecord_workspaceId_createdAt_idx" ON "BillingPaymentRecord"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingReversalRecord_paymentId_idx" ON "BillingReversalRecord"("paymentId");

-- AddForeignKey
ALTER TABLE "DraftActionRecord" ADD CONSTRAINT "DraftActionRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DraftSessionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDeliveryRecord" ADD CONSTRAINT "IntegrationDeliveryRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "IntegrationEventRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDeliveryRecord" ADD CONSTRAINT "IntegrationDeliveryRecord_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "IntegrationEndpointRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReversalRecord" ADD CONSTRAINT "BillingReversalRecord_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPaymentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

