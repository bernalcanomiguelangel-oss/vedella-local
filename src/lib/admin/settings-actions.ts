"use server";

/**
 * Server-action wrapper for settings (FEAT-006). Platform-only. Re-authenticates
 * with requirePlatformAdmin, delegates to ./settings (which coerces values to
 * the stored type and never stores a secret), writes an AdminAudit row, and
 * revalidates the settings view. There is NO action that reads or writes a key
 * value — AI keys live only in the git-ignored .env.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { recordAdminAudit } from "./audit";
import { updateSetting, type UpdateSettingInput } from "./settings";

export interface ActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export async function updateSettingAction(
  input: UpdateSettingInput,
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await updateSetting(prisma, input);
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "setting_update",
    entityType: "setting",
    entityId: input.key,
    detail: `setting ${input.key} updated`,
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}
