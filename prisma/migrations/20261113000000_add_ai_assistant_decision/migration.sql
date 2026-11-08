-- FEAT-007: AI-assistant decision history.
--
-- The five bounded in-panel assistants (farmProfileDraft, offerCompare,
-- traceabilityReview, metricsAnalyst, cycleRecommendation) only draft/suggest;
-- they never price, approve, publish or create traceability. For every
-- suggestion a HUMAN records an explicit accept|edit|reject decision WITH a
-- reason. This table is that durable record and feeds the /admin/audit browser
-- as the "assistant" source. It carries NO price/approval/lifecycle/role field;
-- the suggestion is a guardrail-filtered, schema-valid JSON blob.

CREATE TABLE "AiAssistantDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assistant" TEXT NOT NULL,
    "inputRef" TEXT NOT NULL DEFAULT '',
    "suggestionJson" TEXT NOT NULL DEFAULT '',
    "aiRunId" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "decisionReason" TEXT NOT NULL DEFAULT '',
    "decidedByUserId" TEXT,
    "decidedByEmail" TEXT NOT NULL DEFAULT '',
    "decidedAt" DATETIME,
    "farmId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "AiAssistantDecision_assistant_idx" ON "AiAssistantDecision"("assistant");
CREATE INDEX "AiAssistantDecision_farmId_idx" ON "AiAssistantDecision"("farmId");
CREATE INDEX "AiAssistantDecision_decision_idx" ON "AiAssistantDecision"("decision");
