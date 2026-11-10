-- FEAT-005 (blob/gemini/ab-testing): stable join key for judge-vs-human agreement.
--
-- ADDITIVE and REVERSIBLE: adds one nullable TEXT column + one index to the
-- existing HumanDecisionExample table. No column is dropped or renamed.
--
-- WHY: computeJudgeAgreement previously joined a HumanDecisionExample to its
-- CopyVariant by matching variantText == CopyVariant.text. An 'edit' decision
-- updates CopyVariant.text to the edited text while the example stores the
-- pre-edit snapshot, so edited variants silently dropped out of the comparison.
-- This column stores the stable CopyVariant id the decision was about so the
-- agreement join is id-based and edited variants stay matched. It is an id only
-- and carries NO variant text and NO PII.

-- AlterTable
ALTER TABLE "HumanDecisionExample" ADD COLUMN "copyVariantId" TEXT;

-- CreateIndex
CREATE INDEX "HumanDecisionExample_copyVariantId_idx" ON "HumanDecisionExample"("copyVariantId");
