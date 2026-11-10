-- FEAT-004 (blob/gemini/ab-testing): AI-assisted A/B testing + LLM-as-judge
-- learning loop for PRODUCT DESCRIPTIONS.
--
-- This migration is ADDITIVE and REVERSIBLE: it only CREATEs new tables,
-- indexes and foreign keys. It drops/renames no existing column. The enum-ish
-- fields (locale/source/status/verdict) are plain TEXT, enforced in app code,
-- consistent with the rest of this schema. No price/approval field is ever
-- controlled by the AI; a human sets a variant's status via a server action.
--
-- Learning is by ACCUMULATED HumanDecisionExample few-shots replayed in the
-- proposer + judge prompts, NOT by training/fine-tuning a model.

-- CreateTable
CREATE TABLE "CopyVariant" (
    "id" TEXT NOT NULL,
    "farmProductOfferId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "aiRunId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyExperiment" (
    "id" TEXT NOT NULL,
    "farmProductOfferId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "variantAId" TEXT NOT NULL,
    "variantBId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "decidedVariantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeRule" (
    "id" TEXT NOT NULL,
    "farmId" TEXT,
    "locale" TEXT,
    "ruleText" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JudgeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeEvaluation" (
    "id" TEXT NOT NULL,
    "copyVariantId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "aiRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanDecisionExample" (
    "id" TEXT NOT NULL,
    "farmId" TEXT,
    "locale" TEXT,
    "offerContext" TEXT NOT NULL DEFAULT '',
    "variantText" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "editedText" TEXT,
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanDecisionExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopyVariant_farmProductOfferId_idx" ON "CopyVariant"("farmProductOfferId");
CREATE INDEX "CopyVariant_farmId_idx" ON "CopyVariant"("farmId");
CREATE INDEX "CopyVariant_status_idx" ON "CopyVariant"("status");

-- CreateIndex
CREATE INDEX "CopyExperiment_farmId_idx" ON "CopyExperiment"("farmId");
CREATE INDEX "CopyExperiment_farmProductOfferId_idx" ON "CopyExperiment"("farmProductOfferId");

-- CreateIndex
CREATE INDEX "JudgeRule_farmId_idx" ON "JudgeRule"("farmId");

-- CreateIndex
CREATE INDEX "JudgeEvaluation_copyVariantId_idx" ON "JudgeEvaluation"("copyVariantId");

-- CreateIndex
CREATE INDEX "HumanDecisionExample_farmId_idx" ON "HumanDecisionExample"("farmId");
CREATE INDEX "HumanDecisionExample_locale_idx" ON "HumanDecisionExample"("locale");

-- AddForeignKey
ALTER TABLE "CopyVariant" ADD CONSTRAINT "CopyVariant_farmProductOfferId_fkey" FOREIGN KEY ("farmProductOfferId") REFERENCES "FarmProductOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CopyVariant" ADD CONSTRAINT "CopyVariant_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyExperiment" ADD CONSTRAINT "CopyExperiment_farmProductOfferId_fkey" FOREIGN KEY ("farmProductOfferId") REFERENCES "FarmProductOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CopyExperiment" ADD CONSTRAINT "CopyExperiment_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CopyExperiment" ADD CONSTRAINT "CopyExperiment_variantAId_fkey" FOREIGN KEY ("variantAId") REFERENCES "CopyVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CopyExperiment" ADD CONSTRAINT "CopyExperiment_variantBId_fkey" FOREIGN KEY ("variantBId") REFERENCES "CopyVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeEvaluation" ADD CONSTRAINT "JudgeEvaluation_copyVariantId_fkey" FOREIGN KEY ("copyVariantId") REFERENCES "CopyVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
