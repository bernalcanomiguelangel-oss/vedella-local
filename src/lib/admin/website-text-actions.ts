"use server";

/**
 * Server-action wrappers for the website-text CMS (FEAT-006). Platform-only.
 * Each action re-authenticates with requirePlatformAdmin, delegates to the
 * guardrailed logic in ./website-text (which rejects operational facts), writes
 * an AdminAudit row, and revalidates the CMS view.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { recordAdminAudit } from "./audit";
import {
  upsertWebsiteTextDraft,
  publishWebsiteText,
  type UpsertWebsiteTextInput,
} from "./website-text";

export interface ActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export async function saveWebsiteTextDraftAction(
  input: Omit<UpsertWebsiteTextInput, "editorUserId">,
): Promise<ActionResult & { id?: string }> {
  const user = await requirePlatformAdmin();
  const res = await upsertWebsiteTextDraft(prisma, {
    ...input,
    editorUserId: user.id,
  });
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "website_text_draft",
    entityType: "website_text",
    entityId: res.id ?? "",
    detail: `${input.pageKey}/${input.sectionKey}/${input.locale} draft saved`,
  });

  revalidatePath("/admin/website-text");
  return res;
}

export async function publishWebsiteTextAction(id: string): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await publishWebsiteText(prisma, id, user.id);
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "website_text_publish",
    entityType: "website_text",
    entityId: id,
    toState: "published",
    detail: "website text published",
  });

  revalidatePath("/admin/website-text");
  return res;
}
