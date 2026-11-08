"use server";

/**
 * Real session actions for the admin area.
 *
 * Login is email + password: the password is verified against a salted bcrypt
 * hash (src/lib/password.ts) and, on success, the user id is stored in an
 * httpOnly session cookie. All gating stays enforced server-side by
 * src/lib/auth.ts on every admin page and action. Passwords are NEVER logged or
 * returned.
 *
 * A user whose account carries a temporary password (mustChangePassword) is
 * signed in but routed to the change-password flow before any protected page is
 * reachable (enforced in src/lib/auth.ts#requireAdmin).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  CHANGE_PASSWORD_PATH,
  requireSession,
} from "@/lib/auth";
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
} from "@/lib/password";

function setSessionCookie(userId: string): void {
  cookies().set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  });
}

/**
 * Email + password login. On success sets the session cookie, records
 * lastLoginAt, and redirects to the change-password page when the account still
 * carries a temporary password; otherwise to the dashboard. On failure returns a
 * generic error (never leaks whether the email or the password was wrong).
 */
export async function login(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/admin/login?error=invalid-credentials");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;

  // Generic failure: do not disclose which part was wrong, and never log the
  // password value.
  if (!user || !ok) {
    redirect("/admin/login?error=invalid-credentials");
  }

  setSessionCookie(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  if (user.mustChangePassword) {
    redirect(CHANGE_PASSWORD_PATH);
  }
  redirect("/admin");
}

/**
 * Forced / voluntary password change. Requires an active session (but not a
 * cleared mustChangePassword flag — this is the page that clears it). Enforces
 * the password policy, re-hashes, and clears mustChangePassword. Never logs the
 * password.
 */
export async function changePassword(formData: FormData): Promise<void> {
  const user = await requireSession();

  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm) {
    redirect(`${CHANGE_PASSWORD_PATH}?error=mismatch`);
  }

  const policy = validatePasswordPolicy(next);
  if (!policy.ok) {
    redirect(`${CHANGE_PASSWORD_PATH}?error=policy`);
  }

  const passwordHash = await hashPassword(next);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  redirect("/admin");
}

export async function logout(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  redirect("/admin/login");
}
