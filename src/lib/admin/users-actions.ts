"use server";

/**
 * Platform-admin-only user management server actions.
 *
 * Only the main/platform admin may create users, assign roles, or link a
 * farm_manager to a farm. Every action re-authenticates on the server with
 * requirePlatformAdmin and writes an AdminAudit row. New accounts default to
 * role=customer and are NEVER auto-promoted to admin: assigning platform_admin
 * is an explicit, audited action. Passwords are stored only as salted hashes and
 * are never logged or returned.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { hashPassword, validatePasswordPolicy } from "@/lib/password";
import { recordAdminAudit } from "./audit";
import type { Role } from "./scope";

export interface UserActionResult {
  ok: boolean;
  code?: string;
  message?: string;
  userId?: string;
}

const VALID_ROLES: readonly Role[] = [
  "platform_admin",
  "farm_manager",
  "customer",
];

function normaliseRole(role: string | undefined): Role {
  // New/unknown roles default to customer; never auto-admin.
  return VALID_ROLES.includes(role as Role) ? (role as Role) : "customer";
}

export interface CreateUserInput {
  email: string;
  name?: string;
  /** Defaults to "customer" when omitted/unknown. */
  role?: string;
  /** Required when role is farm_manager: the farm to manage. */
  farmId?: string | null;
  /** Temporary password; the new user must change it on first login. */
  temporaryPassword: string;
}

/**
 * Create a user (platform_admin only). The account is created with a salted
 * password hash and mustChangePassword=true. New accounts default to
 * role=customer; assigning platform_admin is explicit and audited.
 */
export async function createUser(
  input: CreateUserInput,
): Promise<UserActionResult> {
  const actor = await requirePlatformAdmin();

  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, code: "BAD_EMAIL", message: "A valid email is required." };
  }

  const policy = validatePasswordPolicy(input.temporaryPassword);
  if (!policy.ok) {
    return { ok: false, code: "BAD_PASSWORD", message: policy.message };
  }

  const role = normaliseRole(input.role);

  // A farm_manager must be linked to a farm; other roles must not carry one.
  let farmId: string | null = null;
  if (role === "farm_manager") {
    if (!input.farmId) {
      return {
        ok: false,
        code: "FARM_REQUIRED",
        message: "A farm_manager must be linked to a farm.",
      };
    }
    const farm = await prisma.farm.findUnique({ where: { id: input.farmId } });
    if (!farm) {
      return { ok: false, code: "FARM_NOT_FOUND", message: "Farm not found." };
    }
    const taken = await prisma.user.findUnique({ where: { farmId: input.farmId } });
    if (taken) {
      return {
        ok: false,
        code: "FARM_TAKEN",
        message: "That farm already has a manager.",
      };
    }
    farmId = input.farmId;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, code: "EMAIL_TAKEN", message: "Email already in use." };
  }

  const passwordHash = await hashPassword(input.temporaryPassword);
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name?.trim() || null,
      role,
      farmId,
      passwordHash,
      mustChangePassword: true,
    },
  });

  await recordAdminAudit({
    actor,
    action: "create_user",
    entityType: "user",
    entityId: user.id,
    toState: role,
    detail: `created ${email} as ${role}${farmId ? ` (farm ${farmId})` : ""}`,
  });

  revalidatePath("/admin");
  return { ok: true, userId: user.id };
}

/**
 * Change a user's role (platform_admin only). Promoting to or demoting from
 * platform_admin is explicit and audited. Clearing farm_manager drops any farm
 * link; moving to farm_manager requires a farm via assignFarm.
 */
export async function assignRole(
  userId: string,
  nextRole: string,
): Promise<UserActionResult> {
  const actor = await requirePlatformAdmin();

  if (!VALID_ROLES.includes(nextRole as Role)) {
    return { ok: false, code: "BAD_ROLE", message: "Unknown role." };
  }
  const role = nextRole as Role;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, code: "NOT_FOUND", message: "User not found." };

  // A non-manager cannot keep a farm link.
  const farmId = role === "farm_manager" ? target.farmId : null;

  await prisma.user.update({
    where: { id: userId },
    data: { role, farmId },
  });

  await recordAdminAudit({
    actor,
    action: "assign_role",
    entityType: "user",
    entityId: userId,
    fromState: target.role,
    toState: role,
  });

  revalidatePath("/admin");
  return { ok: true, userId };
}

/**
 * Link a farm_manager to a farm (platform_admin only). The user must already be
 * a farm_manager and the farm must not already have a manager (farmId is unique
 * on User).
 */
export async function assignFarm(
  userId: string,
  farmId: string,
): Promise<UserActionResult> {
  const actor = await requirePlatformAdmin();

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, code: "NOT_FOUND", message: "User not found." };
  if (target.role !== "farm_manager") {
    return {
      ok: false,
      code: "NOT_MANAGER",
      message: "Only a farm_manager can be linked to a farm.",
    };
  }

  const farm = await prisma.farm.findUnique({ where: { id: farmId } });
  if (!farm) return { ok: false, code: "FARM_NOT_FOUND", message: "Farm not found." };

  const taken = await prisma.user.findUnique({ where: { farmId } });
  if (taken && taken.id !== userId) {
    return {
      ok: false,
      code: "FARM_TAKEN",
      message: "That farm already has a manager.",
    };
  }

  await prisma.user.update({ where: { id: userId }, data: { farmId } });

  await recordAdminAudit({
    actor,
    action: "assign_farm",
    entityType: "user",
    entityId: userId,
    fromState: target.farmId ?? "",
    toState: farmId,
  });

  revalidatePath("/admin");
  return { ok: true, userId };
}
