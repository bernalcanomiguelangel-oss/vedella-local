/**
 * Translation use case (R24). Generate ca/es/en translations for a farm/product/
 * pack field and store them as `Translation` rows with status `machine`. These
 * are NEVER auto-published: a human approves them in the admin review queue
 * (FEAT-004) before they surface in the catalog (catalog.ts reads approved only).
 *
 * Every run writes an AiRun audit record. Invalid model output falls back safely
 * (no rows written) and records an `invalid` outcome.
 */
import { prisma } from "@/lib/db";
import { LOCALES, type Locale } from "@/lib/i18n";
import { getAiProvider } from "./provider";
import { TranslationResultSchema } from "./schemas";
import { applyGuardrails } from "./guardrails";
import { recordAiRun } from "./audit";

export interface TranslateFieldInput {
  entityType: "farm" | "product" | "pack";
  entityId: string;
  field: string; // "name" | "description" | "story" ...
  /** The base (ca) source text to translate. Trusted content. */
  sourceText: string;
  /** Target locales; defaults to es + en (ca is the source). */
  targetLocales?: Locale[];
}

export interface TranslateFieldResult {
  ok: boolean;
  outcome: "ok" | "invalid" | "error";
  /** The persisted machine-translation rows (status always "machine"). */
  stored: { locale: Locale; field: string; text: string; status: string }[];
}

/**
 * Translate one field and persist the results as machine translations. Returns
 * which rows were stored. Always writes an audit record.
 */
export async function translateField(
  input: TranslateFieldInput,
): Promise<TranslateFieldResult> {
  const targets =
    input.targetLocales ?? (LOCALES.filter((l) => l !== "ca") as Locale[]);
  const inputRef = `${input.entityType}:${input.entityId}:${input.field}`;

  const { provider, flagEnabled, isReal } = await getAiProvider("translate");

  let outcome: TranslateFieldResult["outcome"] = "ok";
  let outputValid = false;
  const stored: TranslateFieldResult["stored"] = [];

  try {
    const result = await provider.translate({
      sourceText: input.sourceText,
      targetLocales: targets,
      inputRef,
    });

    // Strict re-validation at the boundary (defence in depth) + guardrail pass.
    const parsed = TranslationResultSchema.safeParse(result);
    if (!parsed.success) {
      outcome = "invalid";
    } else {
      outputValid = true;
      // Guardrails strip any price/approval/status field a provider tried to add.
      const { value: safe } = applyGuardrails(parsed.data);

      for (const item of safe.items) {
        if (!targets.includes(item.locale)) continue; // ignore unexpected locales
        // Persist as a MACHINE translation. Status is set HERE by the app, never
        // by the model — the model can never approve its own output.
        const row = await prisma.translation.upsert({
          where: {
            entityType_entityId_field_locale: {
              entityType: input.entityType,
              entityId: input.entityId,
              field: input.field,
              locale: item.locale,
            },
          },
          create: {
            entityType: input.entityType,
            entityId: input.entityId,
            field: input.field,
            locale: item.locale,
            text: item.text,
            status: "machine",
            source: isReal ? "openai" : "mock",
          },
          update: {
            text: item.text,
            // Re-generating resets to machine so it must be re-reviewed.
            status: "machine",
            source: isReal ? "openai" : "mock",
          },
        });
        stored.push({
          locale: item.locale as Locale,
          field: row.field,
          text: row.text,
          status: row.status,
        });
      }
    }
  } catch (err) {
    outcome = "error";
    console.error(
      "[ai-translate] provider error:",
      err instanceof Error ? err.message : "unknown error",
    );
  }

  await recordAiRun({
    useCase: "translate",
    provider: provider.name,
    model: provider.model,
    promptVersion: provider.promptVersion,
    flagEnabled,
    inputRef,
    outputValid,
    outcome,
  });

  return { ok: outcome === "ok", outcome, stored };
}
