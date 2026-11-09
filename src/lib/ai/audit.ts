/**
 * AI audit log (ai-guardrails + R29). Persist an AiRun record for EVERY AI run —
 * mock or real, success or fallback. The record captures the use case, provider,
 * model, prompt version, whether the use-case flag was enabled, an input
 * reference (NEVER the raw untrusted content, and NEVER a key), whether the
 * output validated against its Zod schema, and the final outcome.
 *
 * We log the prompt/model/provider version to the audit record; we NEVER log any
 * API key (keys live only in the real provider, read lazily from env).
 */
import { prisma } from "@/lib/db";
import type { AiUseCase } from "./provider";

export type { AiUseCase };
export type AiOutcome = "ok" | "fallback" | "invalid" | "error";

export interface AiRunRecord {
  useCase: AiUseCase;
  provider: string;
  model: string;
  promptVersion: string;
  flagEnabled: boolean;
  /** A non-sensitive reference to the input (e.g. "farm:123:name", a filename). */
  inputRef: string;
  outputValid: boolean;
  outcome: AiOutcome;
}

/**
 * Write one audit row. Returns the created row id. Audit writes must not throw
 * in a way that breaks the caller's safe-fallback path, so failures here are
 * swallowed after being surfaced to the server console (without secrets).
 */
export async function recordAiRun(record: AiRunRecord): Promise<string | null> {
  try {
    const row = await prisma.aiRun.create({
      data: {
        useCase: record.useCase,
        provider: record.provider,
        model: record.model,
        promptVersion: record.promptVersion,
        flagEnabled: record.flagEnabled,
        inputRef: record.inputRef,
        outputValid: record.outputValid,
        outcome: record.outcome,
      },
    });
    return row.id;
  } catch (err) {
    // Never include untrusted input or secrets in logs.
    console.error(
      `[ai-audit] failed to persist AiRun for useCase=${record.useCase}`,
      err instanceof Error ? err.message : "unknown error",
    );
    return null;
  }
}
